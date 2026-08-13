package engine

import (
	"crypto/ecdsa"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	SpecVersion = 1

	domainType  = "EIP712Domain(string name,string version,uint256 chainId)"
	ReceiptType = "Receipt(uint16 specVersion,bytes32 codeVersion,uint64 epochId,uint64 betId,bytes32 seedCommit,string clientSeed,uint64 nonce,bytes32 ruleHash,uint32[] draws,bool win,uint32 payoutBp,uint64 timestamp)"
)

var (
	domainTypeHash  = crypto.Keccak256([]byte(domainType))
	receiptTypeHash = crypto.Keccak256([]byte(ReceiptType))
	nameHash        = crypto.Keccak256([]byte("Foreseer"))
	versionHash     = crypto.Keccak256([]byte("0"))
	secpN           = crypto.S256().Params().N
	secpHalfN       = new(big.Int).Rsh(secpN, 1)
	maxUint256      = new(big.Int).Lsh(big.NewInt(1), 256)
)

type Receipt struct {
	SpecVersion uint16
	CodeVersion [32]byte
	EpochID     uint64
	BetID       uint64
	SeedCommit  [32]byte
	ClientSeed  string
	Nonce       uint64
	RuleHash    [32]byte
	Draws       []uint32
	Win         bool
	PayoutBp    uint32
	Timestamp   uint64
}

type SignedReceipt struct {
	Receipt   Receipt
	Signature [65]byte
}

func uint256be(v uint64) [32]byte {
	var out [32]byte
	out[24] = byte(v >> 56)
	out[25] = byte(v >> 48)
	out[26] = byte(v >> 40)
	out[27] = byte(v >> 32)
	out[28] = byte(v >> 24)
	out[29] = byte(v >> 16)
	out[30] = byte(v >> 8)
	out[31] = byte(v)
	return out
}

func boolWord(v bool) [32]byte {
	var out [32]byte
	if v {
		out[31] = 1
	}
	return out
}

func encString(s string) []byte {
	return crypto.Keccak256([]byte(s))
}

func encUint32Array(values []uint32) []byte {
	buf := make([]byte, 0, 32*len(values))
	for _, v := range values {
		w := uint256be(uint64(v))
		buf = append(buf, w[:]...)
	}
	return crypto.Keccak256(buf)
}

// FORESEER-SPEC §5.1
func DomainSeparator(chainID *big.Int) ([]byte, error) {
	if chainID == nil || chainID.Sign() < 0 || chainID.Cmp(maxUint256) >= 0 {
		return nil, fmt.Errorf("chainId must be a uint256")
	}
	var chainWord [32]byte
	chainID.FillBytes(chainWord[:])
	buf := make([]byte, 0, 128)
	buf = append(buf, domainTypeHash...)
	buf = append(buf, nameHash...)
	buf = append(buf, versionHash...)
	buf = append(buf, chainWord[:]...)
	return crypto.Keccak256(buf), nil
}

// FORESEER-SPEC §5.3
func (r *Receipt) StructHash() ([]byte, error) {
	if len(r.Draws) == 0 {
		return nil, fmt.Errorf("draws must be a non-empty array")
	}
	if !clientSeedRe.MatchString(r.ClientSeed) {
		return nil, fmt.Errorf("clientSeed must match ^[A-Za-z0-9_-]{1,64}$")
	}
	buf := make([]byte, 0, 32*13)
	buf = append(buf, receiptTypeHash...)
	words := [][32]byte{
		uint256be(uint64(r.SpecVersion)),
		r.CodeVersion,
		uint256be(r.EpochID),
		uint256be(r.BetID),
		r.SeedCommit,
	}
	for _, w := range words {
		buf = append(buf, w[:]...)
	}
	buf = append(buf, encString(r.ClientSeed)...)
	nonceWord := uint256be(r.Nonce)
	buf = append(buf, nonceWord[:]...)
	buf = append(buf, r.RuleHash[:]...)
	buf = append(buf, encUint32Array(r.Draws)...)
	winWord := boolWord(r.Win)
	buf = append(buf, winWord[:]...)
	payoutWord := uint256be(uint64(r.PayoutBp))
	buf = append(buf, payoutWord[:]...)
	tsWord := uint256be(r.Timestamp)
	buf = append(buf, tsWord[:]...)
	return crypto.Keccak256(buf), nil
}

// FORESEER-SPEC §5.4
func EIP712Digest(chainID *big.Int, structHash []byte) ([]byte, error) {
	sep, err := DomainSeparator(chainID)
	if err != nil {
		return nil, err
	}
	buf := make([]byte, 0, 66)
	buf = append(buf, 0x19, 0x01)
	buf = append(buf, sep...)
	buf = append(buf, structHash...)
	return crypto.Keccak256(buf), nil
}

func (r *Receipt) Digest(chainID *big.Int) ([]byte, error) {
	sh, err := r.StructHash()
	if err != nil {
		return nil, err
	}
	return EIP712Digest(chainID, sh)
}

// FORESEER-SPEC §1.2
func SignDigest(digest []byte, key *ecdsa.PrivateKey) ([65]byte, error) {
	var out [65]byte
	if len(digest) != 32 {
		return out, fmt.Errorf("digest must be 32 bytes")
	}
	sig, err := crypto.Sign(digest, key)
	if err != nil {
		return out, err
	}
	copy(out[:64], sig[:64])
	out[64] = sig[64] + 27
	return out, nil
}

// FORESEER-SPEC §1.2
func RecoverSigner(digest []byte, sig [65]byte) (common.Address, error) {
	var zero common.Address
	if len(digest) != 32 {
		return zero, fmt.Errorf("digest must be 32 bytes")
	}
	v := sig[64]
	if v != 27 && v != 28 {
		return zero, fmt.Errorf("v must be 27 or 28")
	}
	r := new(big.Int).SetBytes(sig[0:32])
	s := new(big.Int).SetBytes(sig[32:64])
	if r.Sign() == 0 || r.Cmp(secpN) >= 0 {
		return zero, fmt.Errorf("invalid r")
	}
	if s.Sign() == 0 || s.Cmp(secpN) >= 0 {
		return zero, fmt.Errorf("invalid s")
	}
	if s.Cmp(secpHalfN) > 0 {
		return zero, fmt.Errorf("high-s signature rejected")
	}
	raw := make([]byte, 65)
	copy(raw[:64], sig[:64])
	raw[64] = v - 27
	pub, err := crypto.SigToPub(digest, raw)
	if err != nil {
		return zero, err
	}
	return crypto.PubkeyToAddress(*pub), nil
}
