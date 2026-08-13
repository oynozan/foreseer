package engine

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"regexp"
	"strconv"
)

var clientSeedRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func checkSeedAndClient(serverSeed []byte, clientSeed string) error {
	if len(serverSeed) != 32 {
		return fmt.Errorf("serverSeed must be exactly 32 bytes")
	}
	if !clientSeedRe.MatchString(clientSeed) {
		return fmt.Errorf("clientSeed must match ^[A-Za-z0-9_-]{1,64}$")
	}
	return nil
}

// FORESEER-SPEC §2
func DeriveBlock(serverSeed []byte, clientSeed string, nonce uint64, blockIndex uint64) ([]byte, error) {
	if err := checkSeedAndClient(serverSeed, clientSeed); err != nil {
		return nil, err
	}
	mac := hmac.New(sha256.New, serverSeed)
	msg := clientSeed + ":" + strconv.FormatUint(nonce, 10) + ":" + strconv.FormatUint(blockIndex, 10)
	mac.Write([]byte(msg))
	return mac.Sum(nil), nil
}

// FORESEER-SPEC §2
type ByteStream struct {
	serverSeed []byte
	clientSeed string
	nonce      uint64
	block      []byte
	blockIndex uint64
	offset     int
	haveBlock  bool
	BytesRead  int
}

func NewByteStream(serverSeed []byte, clientSeed string, nonce uint64) (*ByteStream, error) {
	if err := checkSeedAndClient(serverSeed, clientSeed); err != nil {
		return nil, err
	}
	seed := make([]byte, 32)
	copy(seed, serverSeed)
	return &ByteStream{serverSeed: seed, clientSeed: clientSeed, nonce: nonce}, nil
}

func (s *ByteStream) Take(n int) ([]byte, error) {
	if n < 1 {
		return nil, fmt.Errorf("take needs n >= 1")
	}
	out := make([]byte, n)
	for i := 0; i < n; i++ {
		if !s.haveBlock || s.offset == 32 {
			if s.haveBlock {
				s.blockIndex++
			}
			block, err := DeriveBlock(s.serverSeed, s.clientSeed, s.nonce, s.blockIndex)
			if err != nil {
				return nil, err
			}
			s.block = block
			s.offset = 0
			s.haveBlock = true
		}
		out[i] = s.block[s.offset]
		s.offset++
	}
	s.BytesRead += n
	return out, nil
}

const two32 = uint64(1) << 32

// FORESEER-SPEC §3
func DrawInt(s *ByteStream, min, max uint64) (uint32, error) {
	if min > max {
		return 0, fmt.Errorf("need 0 <= min <= max")
	}
	rng := max - min + 1
	if rng > two32 || max >= two32 {
		return 0, fmt.Errorf("range must be <= 2^32")
	}
	limit := two32 - two32%rng
	for {
		b, err := s.Take(4)
		if err != nil {
			return 0, err
		}
		x := uint64(binary.BigEndian.Uint32(b))
		if x < limit {
			return uint32(min + x%rng), nil
		}
	}
}

// FORESEER-SPEC §3
func DrawInts(s *ByteStream, min, max uint64, count int) ([]uint32, error) {
	if count < 1 {
		return nil, fmt.Errorf("count must be >= 1")
	}
	out := make([]uint32, 0, count)
	for i := 0; i < count; i++ {
		v, err := DrawInt(s, min, max)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}
