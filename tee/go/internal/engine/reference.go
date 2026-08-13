package engine

import (
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	ReferenceTestKeyHex = "0000000000000000000000000000000000000000000000000000000000000001"
	referenceCodeInput  = "foreseer-reference-tee-v0.1"
)

// FORESEER-SPEC §9.2
func ReferenceCodeVersion() [32]byte {
	return sha256.Sum256([]byte(referenceCodeInput))
}

type epochState struct {
	epochID    uint64
	serverSeed []byte
	seedCommit [32]byte
	receipts   []SignedReceipt
	nonces     map[string]uint64
}

// Mirrors the normative TypeScript ReferenceTee exactly
type ReferenceTee struct {
	key         *ecdsa.PrivateKey
	ChainID     *big.Int
	TeeID       common.Address
	Now         func() uint64
	fixedSeed   []byte
	nextEpochID uint64
	epoch       *epochState
}

type ReferenceTeeOptions struct {
	PrivateKeyHex string
	ChainID       *big.Int
	ServerSeed    []byte
	FirstEpochID  uint64
	Now           func() uint64
}

func NewReferenceTee(opts ReferenceTeeOptions) (*ReferenceTee, error) {
	keyHex := opts.PrivateKeyHex
	if keyHex == "" {
		keyHex = ReferenceTestKeyHex
	}
	key, err := crypto.HexToECDSA(keyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid secp256k1 private key: %w", err)
	}
	chainID := opts.ChainID
	if chainID == nil {
		chainID = big.NewInt(114)
	}
	if opts.ServerSeed != nil && len(opts.ServerSeed) != 32 {
		return nil, fmt.Errorf("serverSeed must be exactly 32 bytes")
	}
	first := opts.FirstEpochID
	if first == 0 {
		first = 1
	}
	now := opts.Now
	if now == nil {
		// Non-consensus: informational timestamp only
		now = func() uint64 { return uint64(time.Now().Unix()) }
	}
	return &ReferenceTee{
		key:         key,
		ChainID:     chainID,
		TeeID:       crypto.PubkeyToAddress(key.PublicKey),
		Now:         now,
		fixedSeed:   opts.ServerSeed,
		nextEpochID: first,
	}, nil
}

func (t *ReferenceTee) EpochOpen() bool {
	return t.epoch != nil
}

func (t *ReferenceTee) CurrentEpochID() uint64 {
	if t.epoch == nil {
		return 0
	}
	return t.epoch.epochID
}

func (t *ReferenceTee) CurrentSeedCommit() [32]byte {
	if t.epoch == nil {
		return [32]byte{}
	}
	return t.epoch.seedCommit
}

func (t *ReferenceTee) ReceiptCount() int {
	if t.epoch == nil {
		return 0
	}
	return len(t.epoch.receipts)
}

func (t *ReferenceTee) OpenEpoch() (uint64, [32]byte, error) {
	if t.epoch != nil {
		return 0, [32]byte{}, fmt.Errorf("epoch already open, close it first")
	}
	seed := make([]byte, 32)
	if t.fixedSeed != nil {
		copy(seed, t.fixedSeed)
	} else {
		if _, err := rand.Read(seed); err != nil {
			return 0, [32]byte{}, err
		}
	}
	commit, err := SeedCommit(seed)
	if err != nil {
		return 0, [32]byte{}, err
	}
	epochID := t.nextEpochID
	t.nextEpochID++
	t.epoch = &epochState{
		epochID:    epochID,
		serverSeed: seed,
		seedCommit: commit,
		nonces:     map[string]uint64{},
	}
	return epochID, commit, nil
}

func (t *ReferenceTee) Play(clientSeed string, rule *Rule) (*SignedReceipt, error) {
	if t.epoch == nil {
		return nil, fmt.Errorf("no open epoch")
	}
	nonce := t.epoch.nonces[clientSeed]
	outcome, err := ResolveOutcome(rule, t.epoch.serverSeed, clientSeed, nonce)
	if err != nil {
		return nil, err
	}
	receipt := Receipt{
		SpecVersion: SpecVersion,
		CodeVersion: ReferenceCodeVersion(),
		EpochID:     t.epoch.epochID,
		BetID:       uint64(len(t.epoch.receipts)),
		SeedCommit:  t.epoch.seedCommit,
		ClientSeed:  clientSeed,
		Nonce:       nonce,
		RuleHash:    rule.Hash,
		Draws:       outcome.Draws,
		Win:         outcome.Win,
		PayoutBp:    outcome.PayoutBp,
		Timestamp:   t.Now(),
	}
	digest, err := receipt.Digest(t.ChainID)
	if err != nil {
		return nil, err
	}
	sig, err := SignDigest(digest, t.key)
	if err != nil {
		return nil, err
	}
	signed := SignedReceipt{Receipt: receipt, Signature: sig}
	t.epoch.nonces[clientSeed] = nonce + 1
	t.epoch.receipts = append(t.epoch.receipts, signed)
	return &signed, nil
}

type CloseResult struct {
	ServerSeed     [32]byte
	MerkleRoot     [32]byte
	ReceiptCount   int
	CloseSignature [65]byte
}

func (t *ReferenceTee) CloseEpoch() (*CloseResult, error) {
	if t.epoch == nil {
		return nil, fmt.Errorf("no open epoch")
	}
	leaves := make([][32]byte, 0, len(t.epoch.receipts))
	for i := range t.epoch.receipts {
		digest, err := t.epoch.receipts[i].Receipt.Digest(t.ChainID)
		if err != nil {
			return nil, err
		}
		var leaf [32]byte
		copy(leaf[:], digest)
		leaves = append(leaves, leaf)
	}
	root := NewMerkleTree(leaves).Root()
	var seed [32]byte
	copy(seed[:], t.epoch.serverSeed)
	closeStruct := EpochClose{
		SpecVersion:  SpecVersion,
		CodeVersion:  ReferenceCodeVersion(),
		EpochID:      t.epoch.epochID,
		SeedCommit:   t.epoch.seedCommit,
		ServerSeed:   seed,
		MerkleRoot:   root,
		ReceiptCount: uint64(len(t.epoch.receipts)),
	}
	sig, err := SignEpochClose(&closeStruct, t.ChainID, t.key)
	if err != nil {
		return nil, err
	}
	result := &CloseResult{
		ServerSeed:     seed,
		MerkleRoot:     root,
		ReceiptCount:   len(t.epoch.receipts),
		CloseSignature: sig,
	}
	t.epoch = nil
	return result, nil
}
