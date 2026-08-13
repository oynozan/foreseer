package engine

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
)

func vectorPath(name string) string {
	return filepath.Join("..", "..", "..", "..", "spec", "vectors", name)
}

func loadVector(t *testing.T, name string, into any) {
	t.Helper()
	raw, err := os.ReadFile(vectorPath(name))
	if err != nil {
		t.Fatalf("reading %s: %v", name, err)
	}
	if err := json.Unmarshal(raw, into); err != nil {
		t.Fatalf("parsing %s: %v", name, err)
	}
}

func fromHex(t *testing.T, s string) []byte {
	t.Helper()
	b, err := hex.DecodeString(strings.TrimPrefix(s, "0x"))
	if err != nil {
		t.Fatalf("bad hex %q: %v", s, err)
	}
	return b
}

func toHex32(b [32]byte) string {
	return "0x" + hex.EncodeToString(b[:])
}

func toHexBytes(b []byte) string {
	return "0x" + hex.EncodeToString(b)
}

type receiptJSON struct {
	SpecVersion uint16   `json:"specVersion"`
	CodeVersion string   `json:"codeVersion"`
	EpochID     uint64   `json:"epochId"`
	BetID       uint64   `json:"betId"`
	SeedCommit  string   `json:"seedCommit"`
	ClientSeed  string   `json:"clientSeed"`
	Nonce       uint64   `json:"nonce"`
	RuleHash    string   `json:"ruleHash"`
	Draws       []uint32 `json:"draws"`
	Win         bool     `json:"win"`
	PayoutBp    uint32   `json:"payoutBp"`
	Timestamp   uint64   `json:"timestamp"`
}

func (r receiptJSON) toReceipt(t *testing.T) Receipt {
	t.Helper()
	var code, commit, ruleH [32]byte
	copy(code[:], fromHex(t, r.CodeVersion))
	copy(commit[:], fromHex(t, r.SeedCommit))
	copy(ruleH[:], fromHex(t, r.RuleHash))
	return Receipt{
		SpecVersion: r.SpecVersion,
		CodeVersion: code,
		EpochID:     r.EpochID,
		BetID:       r.BetID,
		SeedCommit:  commit,
		ClientSeed:  r.ClientSeed,
		Nonce:       r.Nonce,
		RuleHash:    ruleH,
		Draws:       r.Draws,
		Win:         r.Win,
		PayoutBp:    r.PayoutBp,
		Timestamp:   r.Timestamp,
	}
}

func TestGoldenDerive(t *testing.T) {
	var v struct {
		ServerSeed string `json:"serverSeed"`
		Cases      []struct {
			ClientSeed   string   `json:"clientSeed"`
			Nonce        uint64   `json:"nonce"`
			HmacMessages []string `json:"hmacMessages"`
			Blocks       []string `json:"blocks"`
		} `json:"cases"`
	}
	loadVector(t, "derive.json", &v)
	seed := fromHex(t, v.ServerSeed)
	for _, c := range v.Cases {
		for i, want := range c.Blocks {
			wantMsg := fmt.Sprintf("%s:%d:%d", c.ClientSeed, c.Nonce, i)
			if c.HmacMessages[i] != wantMsg {
				t.Fatalf("hmac message mismatch: %q vs %q", c.HmacMessages[i], wantMsg)
			}
			block, err := DeriveBlock(seed, c.ClientSeed, c.Nonce, uint64(i))
			if err != nil {
				t.Fatalf("DeriveBlock: %v", err)
			}
			if got := toHexBytes(block); got != want {
				t.Fatalf("block %s nonce %d index %d: got %s want %s", c.ClientSeed, c.Nonce, i, got, want)
			}
		}
	}
}

func TestGoldenInts(t *testing.T) {
	var v struct {
		ServerSeed string `json:"serverSeed"`
		Cases      []struct {
			Name          string   `json:"name"`
			ClientSeed    string   `json:"clientSeed"`
			Nonce         uint64   `json:"nonce"`
			Min           uint64   `json:"min"`
			Max           uint64   `json:"max"`
			Count         int      `json:"count"`
			Draws         []uint32 `json:"draws"`
			BytesConsumed int      `json:"bytesConsumed"`
		} `json:"cases"`
	}
	loadVector(t, "ints.json", &v)
	seed := fromHex(t, v.ServerSeed)
	sawRejection := false
	for _, c := range v.Cases {
		stream, err := NewByteStream(seed, c.ClientSeed, c.Nonce)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		draws, err := DrawInts(stream, c.Min, c.Max, c.Count)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		if len(draws) != len(c.Draws) {
			t.Fatalf("%s: draw count", c.Name)
		}
		for i := range draws {
			if draws[i] != c.Draws[i] {
				t.Fatalf("%s draw %d: got %d want %d", c.Name, i, draws[i], c.Draws[i])
			}
		}
		if stream.BytesRead != c.BytesConsumed {
			t.Fatalf("%s: consumed %d want %d", c.Name, stream.BytesRead, c.BytesConsumed)
		}
		if c.BytesConsumed > 4*c.Count {
			sawRejection = true
		}
	}
	if !sawRejection {
		t.Fatal("no vector exercised the rejection path")
	}
}

func TestGoldenRules(t *testing.T) {
	var v struct {
		Valid []struct {
			Name      string          `json:"name"`
			Rule      json.RawMessage `json:"rule"`
			Canonical string          `json:"canonical"`
			RuleHash  string          `json:"ruleHash"`
		} `json:"valid"`
		Invalid []struct {
			Name   string          `json:"name"`
			Rule   json.RawMessage `json:"rule"`
			Reason string          `json:"reason"`
		} `json:"invalid"`
	}
	loadVector(t, "rules.json", &v)
	for _, c := range v.Valid {
		rule, err := ParseRule(c.Rule)
		if err != nil {
			t.Fatalf("%s: %v", c.Name, err)
		}
		if string(rule.Canonical) != c.Canonical {
			t.Fatalf("%s canonical:\n got %s\nwant %s", c.Name, rule.Canonical, c.Canonical)
		}
		if got := toHex32(rule.Hash); got != c.RuleHash {
			t.Fatalf("%s hash: got %s want %s", c.Name, got, c.RuleHash)
		}
	}
	for _, c := range v.Invalid {
		if _, err := ParseRule(c.Rule); err == nil {
			t.Fatalf("%s (%s): unexpectedly valid", c.Name, c.Reason)
		}
	}
}

func TestGoldenReceipts(t *testing.T) {
	var v struct {
		Domain struct {
			ChainID int64 `json:"chainId"`
		} `json:"domain"`
		PrivateKey string `json:"privateKey"`
		ServerSeed string `json:"serverSeed"`
		Receipts   []struct {
			RuleName         string      `json:"ruleName"`
			Receipt          receiptJSON `json:"receipt"`
			StructHash       string      `json:"structHash"`
			Digest           string      `json:"digest"`
			Signature        string      `json:"signature"`
			RecoveredAddress string      `json:"recoveredAddress"`
		} `json:"receipts"`
	}
	loadVector(t, "receipts.json", &v)
	chainID := big.NewInt(v.Domain.ChainID)
	key, err := crypto.HexToECDSA(strings.TrimPrefix(v.PrivateKey, "0x"))
	if err != nil {
		t.Fatalf("key: %v", err)
	}
	seed := fromHex(t, v.ServerSeed)

	var rules struct {
		Valid []struct {
			Name string          `json:"name"`
			Rule json.RawMessage `json:"rule"`
		} `json:"valid"`
	}
	loadVector(t, "rules.json", &rules)
	ruleByName := map[string]*Rule{}
	for _, r := range rules.Valid {
		parsed, err := ParseRule(r.Rule)
		if err != nil {
			t.Fatalf("rule %s: %v", r.Name, err)
		}
		ruleByName[r.Name] = parsed
	}

	for _, c := range v.Receipts {
		receipt := c.Receipt.toReceipt(t)
		structHash, err := receipt.StructHash()
		if err != nil {
			t.Fatalf("%s structHash: %v", c.RuleName, err)
		}
		if got := toHexBytes(structHash); got != c.StructHash {
			t.Fatalf("%s structHash: got %s want %s", c.RuleName, got, c.StructHash)
		}
		digest, err := receipt.Digest(chainID)
		if err != nil {
			t.Fatalf("%s digest: %v", c.RuleName, err)
		}
		if got := toHexBytes(digest); got != c.Digest {
			t.Fatalf("%s digest: got %s want %s", c.RuleName, got, c.Digest)
		}
		sig, err := SignDigest(digest, key)
		if err != nil {
			t.Fatalf("%s sign: %v", c.RuleName, err)
		}
		if got := toHexBytes(sig[:]); got != c.Signature {
			t.Fatalf("%s signature: got %s want %s", c.RuleName, got, c.Signature)
		}
		signer, err := RecoverSigner(digest, sig)
		if err != nil {
			t.Fatalf("%s recover: %v", c.RuleName, err)
		}
		if got := strings.ToLower(signer.Hex()); got != c.RecoveredAddress {
			t.Fatalf("%s recovered: got %s want %s", c.RuleName, got, c.RecoveredAddress)
		}
		rule := ruleByName[c.RuleName]
		if rule == nil {
			t.Fatalf("%s: rule not in rules.json", c.RuleName)
		}
		outcome, err := ResolveOutcome(rule, seed, receipt.ClientSeed, receipt.Nonce)
		if err != nil {
			t.Fatalf("%s outcome: %v", c.RuleName, err)
		}
		if outcome.Win != receipt.Win || outcome.PayoutBp != receipt.PayoutBp {
			t.Fatalf("%s outcome mismatch", c.RuleName)
		}
		for i := range outcome.Draws {
			if outcome.Draws[i] != receipt.Draws[i] {
				t.Fatalf("%s draw %d mismatch", c.RuleName, i)
			}
		}
	}
}

func TestGoldenMerkle(t *testing.T) {
	var v struct {
		Trees []struct {
			Size   int        `json:"size"`
			Leaves []string   `json:"leaves"`
			Root   string     `json:"root"`
			Proofs [][]string `json:"proofs"`
		} `json:"trees"`
	}
	loadVector(t, "merkle.json", &v)
	for _, tree := range v.Trees {
		leaves := make([][32]byte, tree.Size)
		for i := 0; i < tree.Size; i++ {
			var leaf [32]byte
			copy(leaf[:], crypto.Keccak256([]byte(fmt.Sprintf("leaf:%d", i))))
			leaves[i] = leaf
			if got := toHex32(leaf); got != tree.Leaves[i] {
				t.Fatalf("size %d leaf %d: got %s want %s", tree.Size, i, got, tree.Leaves[i])
			}
		}
		mt := NewMerkleTree(leaves)
		root := mt.Root()
		if got := toHex32(root); got != tree.Root {
			t.Fatalf("size %d root: got %s want %s", tree.Size, got, tree.Root)
		}
		for i := 0; i < tree.Size; i++ {
			proof, err := mt.Proof(i)
			if err != nil {
				t.Fatalf("proof: %v", err)
			}
			if len(proof) != len(tree.Proofs[i]) {
				t.Fatalf("size %d proof %d length", tree.Size, i)
			}
			for j := range proof {
				if got := toHex32(proof[j]); got != tree.Proofs[i][j] {
					t.Fatalf("size %d proof %d elem %d: got %s want %s", tree.Size, i, j, got, tree.Proofs[i][j])
				}
			}
			if !VerifyMerkleProof(leaves[i], proof, root) {
				t.Fatalf("size %d proof %d does not verify", tree.Size, i)
			}
		}
	}
}

func TestGoldenE2E(t *testing.T) {
	var v struct {
		Domain struct {
			ChainID int64 `json:"chainId"`
		} `json:"domain"`
		PrivateKey string `json:"privateKey"`
		TeeID      string `json:"teeId"`
		EpochID    uint64 `json:"epochId"`
		ServerSeed string `json:"serverSeed"`
		SeedCommit string `json:"seedCommit"`
		Rules      []struct {
			Name string          `json:"name"`
			Rule json.RawMessage `json:"rule"`
		} `json:"rules"`
		Receipts []struct {
			RuleName  string      `json:"ruleName"`
			Receipt   receiptJSON `json:"receipt"`
			Digest    string      `json:"digest"`
			Signature string      `json:"signature"`
		} `json:"receipts"`
		MerkleRoot     string `json:"merkleRoot"`
		ReceiptCount   int    `json:"receiptCount"`
		CloseDigest    string `json:"closeDigest"`
		CloseSignature string `json:"closeSignature"`
	}
	loadVector(t, "e2e.json", &v)

	ruleByName := map[string]*Rule{}
	for _, r := range v.Rules {
		parsed, err := ParseRule(r.Rule)
		if err != nil {
			t.Fatalf("rule %s: %v", r.Name, err)
		}
		ruleByName[r.Name] = parsed
	}

	tick := uint64(1755000000)
	tee, err := NewReferenceTee(ReferenceTeeOptions{
		PrivateKeyHex: strings.TrimPrefix(v.PrivateKey, "0x"),
		ChainID:       big.NewInt(v.Domain.ChainID),
		ServerSeed:    fromHex(t, v.ServerSeed),
		Now: func() uint64 {
			out := tick
			tick++
			return out
		},
	})
	if err != nil {
		t.Fatalf("tee: %v", err)
	}
	if got := strings.ToLower(tee.TeeID.Hex()); got != v.TeeID {
		t.Fatalf("teeId: got %s want %s", got, v.TeeID)
	}
	epochID, commit, err := tee.OpenEpoch()
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if epochID != v.EpochID || toHex32(commit) != v.SeedCommit {
		t.Fatalf("open mismatch: epoch %d commit %s", epochID, toHex32(commit))
	}

	for i, entry := range v.Receipts {
		rule := ruleByName[entry.RuleName]
		if rule == nil {
			t.Fatalf("receipt %d: unknown rule %s", i, entry.RuleName)
		}
		signed, err := tee.Play(entry.Receipt.ClientSeed, rule)
		if err != nil {
			t.Fatalf("play %d: %v", i, err)
		}
		want := entry.Receipt.toReceipt(t)
		got := signed.Receipt
		if got.BetID != want.BetID || got.Nonce != want.Nonce || got.Win != want.Win ||
			got.PayoutBp != want.PayoutBp || got.Timestamp != want.Timestamp ||
			got.SeedCommit != want.SeedCommit || got.RuleHash != want.RuleHash ||
			len(got.Draws) != len(want.Draws) {
			t.Fatalf("receipt %d field mismatch", i)
		}
		for j := range got.Draws {
			if got.Draws[j] != want.Draws[j] {
				t.Fatalf("receipt %d draw %d mismatch", i, j)
			}
		}
		digest, err := got.Digest(tee.ChainID)
		if err != nil {
			t.Fatalf("digest %d: %v", i, err)
		}
		if toHexBytes(digest) != entry.Digest {
			t.Fatalf("receipt %d digest: got %s want %s", i, toHexBytes(digest), entry.Digest)
		}
		if toHexBytes(signed.Signature[:]) != entry.Signature {
			t.Fatalf("receipt %d signature: got %s want %s", i, toHexBytes(signed.Signature[:]), entry.Signature)
		}
	}

	closed, err := tee.CloseEpoch()
	if err != nil {
		t.Fatalf("close: %v", err)
	}
	if toHex32(closed.ServerSeed) != v.ServerSeed {
		t.Fatalf("close seed mismatch")
	}
	if toHex32(closed.MerkleRoot) != v.MerkleRoot {
		t.Fatalf("close root: got %s want %s", toHex32(closed.MerkleRoot), v.MerkleRoot)
	}
	if closed.ReceiptCount != v.ReceiptCount {
		t.Fatalf("close count: got %d want %d", closed.ReceiptCount, v.ReceiptCount)
	}
	if toHexBytes(closed.CloseSignature[:]) != v.CloseSignature {
		t.Fatalf("close signature: got %s want %s", toHexBytes(closed.CloseSignature[:]), v.CloseSignature)
	}
	closeStruct := EpochClose{
		SpecVersion:  SpecVersion,
		CodeVersion:  ReferenceCodeVersion(),
		EpochID:      v.EpochID,
		SeedCommit:   commit,
		ServerSeed:   closed.ServerSeed,
		MerkleRoot:   closed.MerkleRoot,
		ReceiptCount: uint64(v.ReceiptCount),
	}
	closeDigest, err := closeStruct.Digest(tee.ChainID)
	if err != nil {
		t.Fatalf("close digest: %v", err)
	}
	if toHexBytes(closeDigest) != v.CloseDigest {
		t.Fatalf("close digest: got %s want %s", toHexBytes(closeDigest), v.CloseDigest)
	}
	signer, err := RecoverSigner(closeDigest, closed.CloseSignature)
	if err != nil {
		t.Fatalf("close recover: %v", err)
	}
	if strings.ToLower(signer.Hex()) != v.TeeID {
		t.Fatalf("close signer mismatch")
	}
}
