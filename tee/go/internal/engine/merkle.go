package engine

import (
	"bytes"
	"fmt"

	"github.com/ethereum/go-ethereum/crypto"
)

// FORESEER-SPEC §7.1
func HashPair(a, b [32]byte) [32]byte {
	var out [32]byte
	if bytes.Compare(a[:], b[:]) <= 0 {
		copy(out[:], crypto.Keccak256(a[:], b[:]))
	} else {
		copy(out[:], crypto.Keccak256(b[:], a[:]))
	}
	return out
}

func nextLevel(level [][32]byte) [][32]byte {
	out := make([][32]byte, 0, (len(level)+1)/2)
	for i := 0; i+1 < len(level); i += 2 {
		out = append(out, HashPair(level[i], level[i+1]))
	}
	if len(level)%2 == 1 {
		out = append(out, level[len(level)-1])
	}
	return out
}

// FORESEER-SPEC §7.1
type MerkleTree struct {
	levels [][][32]byte
}

func NewMerkleTree(leaves [][32]byte) *MerkleTree {
	level := make([][32]byte, len(leaves))
	copy(level, leaves)
	levels := [][][32]byte{level}
	for len(levels[len(levels)-1]) > 1 {
		levels = append(levels, nextLevel(levels[len(levels)-1]))
	}
	return &MerkleTree{levels: levels}
}

func (t *MerkleTree) Size() int {
	return len(t.levels[0])
}

func (t *MerkleTree) Root() [32]byte {
	top := t.levels[len(t.levels)-1]
	if len(top) == 0 {
		return [32]byte{}
	}
	return top[0]
}

// FORESEER-SPEC §7.2
func (t *MerkleTree) Proof(index int) ([][32]byte, error) {
	if index < 0 || index >= t.Size() {
		return nil, fmt.Errorf("leaf index out of range")
	}
	proof := [][32]byte{}
	i := index
	for depth := 0; depth < len(t.levels)-1; depth++ {
		level := t.levels[depth]
		sibling := i - 1
		if i%2 == 0 {
			sibling = i + 1
		}
		if sibling < len(level) {
			proof = append(proof, level[sibling])
		}
		i /= 2
	}
	return proof, nil
}

// FORESEER-SPEC §7.2
func VerifyMerkleProof(leaf [32]byte, proof [][32]byte, root [32]byte) bool {
	h := leaf
	for _, p := range proof {
		h = HashPair(h, p)
	}
	return h == root
}
