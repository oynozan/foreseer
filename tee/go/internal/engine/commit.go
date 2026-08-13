package engine

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/crypto"
)

const EpochCloseType = "EpochClose(uint16 specVersion,bytes32 codeVersion,uint64 epochId,bytes32 seedCommit,bytes32 serverSeed,bytes32 merkleRoot,uint64 receiptCount)"

var epochCloseTypeHash = crypto.Keccak256([]byte(EpochCloseType))

// FORESEER-SPEC §6.1
func SeedCommit(serverSeed []byte) ([32]byte, error) {
	var out [32]byte
	if len(serverSeed) != 32 {
		return out, fmt.Errorf("serverSeed must be exactly 32 bytes")
	}
	out = sha256.Sum256(serverSeed)
	return out, nil
}

// FORESEER-SPEC §6.1
func VerifyCommit(serverSeed []byte, commit [32]byte) bool {
	got, err := SeedCommit(serverSeed)
	return err == nil && got == commit
}

type EpochClose struct {
	SpecVersion  uint16
	CodeVersion  [32]byte
	EpochID      uint64
	SeedCommit   [32]byte
	ServerSeed   [32]byte
	MerkleRoot   [32]byte
	ReceiptCount uint64
}

// FORESEER-SPEC §6.3
func (c *EpochClose) StructHash() []byte {
	buf := make([]byte, 0, 32*8)
	buf = append(buf, epochCloseTypeHash...)
	words := [][32]byte{
		uint256be(uint64(c.SpecVersion)),
		c.CodeVersion,
		uint256be(c.EpochID),
		c.SeedCommit,
		c.ServerSeed,
		c.MerkleRoot,
		uint256be(c.ReceiptCount),
	}
	for _, w := range words {
		buf = append(buf, w[:]...)
	}
	return crypto.Keccak256(buf)
}

func (c *EpochClose) Digest(chainID *big.Int) ([]byte, error) {
	return EIP712Digest(chainID, c.StructHash())
}

func SignEpochClose(c *EpochClose, chainID *big.Int, key *ecdsa.PrivateKey) ([65]byte, error) {
	digest, err := c.Digest(chainID)
	if err != nil {
		return [65]byte{}, err
	}
	return SignDigest(digest, key)
}
