package engine

import (
	"bytes"
	"crypto/ecdsa"
	"fmt"
	"math"
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
)

var testSeed = func() []byte {
	seed := make([]byte, 32)
	for i := range seed {
		seed[i] = byte(i)
	}
	return seed
}()

func mustRule(t *testing.T, raw string) *Rule {
	t.Helper()
	rule, err := ParseRule([]byte(raw))
	if err != nil {
		t.Fatalf("ParseRule(%s): %v", raw, err)
	}
	return rule
}

func wantErr(t *testing.T, err error, substr string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error containing %q, got nil", substr)
	}
	if !strings.Contains(err.Error(), substr) {
		t.Fatalf("expected error containing %q, got %q", substr, err.Error())
	}
}

func TestDeriveBlockErrors(t *testing.T) {
	_, err := DeriveBlock(testSeed[:31], "alice", 0, 0)
	wantErr(t, err, "32 bytes")
	_, err = DeriveBlock(append(testSeed, 0), "alice", 0, 0)
	wantErr(t, err, "32 bytes")
	_, err = DeriveBlock(testSeed, "", 0, 0)
	wantErr(t, err, "clientSeed")
	_, err = DeriveBlock(testSeed, "has:colon", 0, 0)
	wantErr(t, err, "clientSeed")
	_, err = DeriveBlock(testSeed, strings.Repeat("x", 65), 0, 0)
	wantErr(t, err, "clientSeed")
}

func TestDeriveBlockHugeNonce(t *testing.T) {
	a, err := DeriveBlock(testSeed, "alice", math.MaxUint64, math.MaxUint64)
	if err != nil {
		t.Fatalf("DeriveBlock: %v", err)
	}
	if len(a) != 32 {
		t.Fatalf("block length %d", len(a))
	}
	b, err := DeriveBlock(testSeed, "alice", math.MaxUint64, math.MaxUint64)
	if err != nil || !bytes.Equal(a, b) {
		t.Fatalf("not deterministic")
	}
}

func TestNewByteStreamErrors(t *testing.T) {
	_, err := NewByteStream(testSeed[:16], "alice", 0)
	wantErr(t, err, "32 bytes")
	_, err = NewByteStream(testSeed, "bad seed", 0)
	wantErr(t, err, "clientSeed")
}

func TestTakeErrors(t *testing.T) {
	s, err := NewByteStream(testSeed, "alice", 0)
	if err != nil {
		t.Fatalf("NewByteStream: %v", err)
	}
	_, err = s.Take(0)
	wantErr(t, err, "n >= 1")
	_, err = s.Take(-1)
	wantErr(t, err, "n >= 1")
	if s.BytesRead != 0 {
		t.Fatalf("BytesRead %d after failed takes", s.BytesRead)
	}
}

func TestDrawIntErrors(t *testing.T) {
	s, err := NewByteStream(testSeed, "alice", 0)
	if err != nil {
		t.Fatalf("NewByteStream: %v", err)
	}
	_, err = DrawInt(s, 6, 5)
	wantErr(t, err, "min <= max")
	_, err = DrawInt(s, 0, uint64(1)<<32)
	wantErr(t, err, "2^32")
	_, err = DrawInt(s, 1, uint64(1)<<32)
	wantErr(t, err, "2^32")
}

func TestDrawIntsErrors(t *testing.T) {
	s, err := NewByteStream(testSeed, "alice", 0)
	if err != nil {
		t.Fatalf("NewByteStream: %v", err)
	}
	_, err = DrawInts(s, 0, 9, 0)
	wantErr(t, err, "count")
	_, err = DrawInts(s, 0, 9, -2)
	wantErr(t, err, "count")
	_, err = DrawInts(s, 7, 5, 2)
	wantErr(t, err, "min <= max")
}

const validRuleJSON = `{"v":0,"random":{"type":"int","min":0,"max":9999,"count":1},"win":{"op":">","l":{"r":0},"r":{"c":5000}},"payout_bp":19800}`

func ruleWithWin(win string) string {
	return fmt.Sprintf(`{"v":0,"random":{"type":"int","min":0,"max":9999,"count":1},"win":%s,"payout_bp":19800}`, win)
}

func TestParseRuleErrors(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"truncated json", `{"v":0`},
		{"trailing object", validRuleJSON + ` {}`},
		{"trailing number", validRuleJSON + ` 1`},
		{"trailing junk", validRuleJSON + ` xyz`},
		{"array doc", `[1,2]`},
		{"string doc", `"rule"`},
		{"number doc", `5`},
		{"missing payout", `{"v":0,"random":{"type":"int","min":0,"max":9,"count":1},"win":{"op":">","l":{"r":0},"r":{"c":5}}}`},
		{"extra key", strings.Replace(validRuleJSON, `"v":0`, `"v":0,"x":1`, 1)},
		{"v is 1", strings.Replace(validRuleJSON, `"v":0`, `"v":1`, 1)},
		{"v is 0.0", strings.Replace(validRuleJSON, `"v":0`, `"v":0.0`, 1)},
		{"random not object", `{"v":0,"random":5,"win":{"op":">","l":{"r":0},"r":{"c":5}},"payout_bp":1}`},
		{"random missing count", `{"v":0,"random":{"type":"int","min":0,"max":9},"win":{"op":">","l":{"r":0},"r":{"c":5}},"payout_bp":1}`},
		{"random type float", strings.Replace(validRuleJSON, `"type":"int"`, `"type":"float"`, 1)},
		{"min above max", strings.Replace(validRuleJSON, `"min":0`, `"min":10000`, 1)},
		{"min float 1.0", strings.Replace(validRuleJSON, `"min":0`, `"min":1.0`, 1)},
		{"min negative", strings.Replace(validRuleJSON, `"min":0`, `"min":-1`, 1)},
		{"max above uint32", strings.Replace(validRuleJSON, `"max":9999`, `"max":4294967296`, 1)},
		{"count 0", strings.Replace(validRuleJSON, `"count":1`, `"count":0`, 1)},
		{"count 17", strings.Replace(validRuleJSON, `"count":1`, `"count":17`, 1)},
		{"payout float 5.0", strings.Replace(validRuleJSON, `"payout_bp":19800`, `"payout_bp":5.0`, 1)},
		{"payout exponent", strings.Replace(validRuleJSON, `"payout_bp":19800`, `"payout_bp":1e2`, 1)},
		{"payout above uint32", strings.Replace(validRuleJSON, `"payout_bp":19800`, `"payout_bp":4294967296`, 1)},
		{"win not object", ruleWithWin(`5`)},
		{"win op not string", ruleWithWin(`{"op":5,"l":{"r":0},"r":{"c":5}}`)},
		{"win unknown op", ruleWithWin(`{"op":"xor","l":{"r":0},"r":{"c":5}}`)},
		{"comparison missing r", ruleWithWin(`{"op":">","l":{"r":0}}`)},
		{"comparison extra key", ruleWithWin(`{"op":">","l":{"r":0},"r":{"c":5},"x":1}`)},
		{"operand two keys", ruleWithWin(`{"op":">","l":{"r":0,"c":1},"r":{"c":5}}`)},
		{"operand unknown key", ruleWithWin(`{"op":">","l":{"x":1},"r":{"c":5}}`)},
		{"draw index out of range", ruleWithWin(`{"op":">","l":{"r":1},"r":{"c":5}}`)},
		{"draw index negative", ruleWithWin(`{"op":">","l":{"r":-1},"r":{"c":5}}`)},
		{"draw index float", ruleWithWin(`{"op":">","l":{"r":0.5},"r":{"c":5}}`)},
		{"constant above uint32", ruleWithWin(`{"op":">","l":{"r":0},"r":{"c":4294967296}}`)},
		{"constant string", ruleWithWin(`{"op":">","l":{"r":0},"r":{"c":"5"}}`)},
		{"int expr number", ruleWithWin(`{"op":">","l":5,"r":{"c":5}}`)},
		{"int expr array", ruleWithWin(`{"op":">","l":[{"r":0}],"r":{"c":5}}`)},
		{"unknown int op", ruleWithWin(`{"op":">","l":{"op":"div","l":{"r":0},"r":{"c":2}},"r":{"c":5}}`)},
		{"mod missing r", ruleWithWin(`{"op":">","l":{"op":"mod","l":{"r":0}},"r":{"c":5}}`)},
		{"mod extra key", ruleWithWin(`{"op":">","l":{"op":"mod","l":{"r":0},"r":{"c":2},"x":1},"r":{"c":5}}`)},
		{"mod divisor draw ref", ruleWithWin(`{"op":">","l":{"op":"mod","l":{"r":0},"r":{"r":0}},"r":{"c":5}}`)},
		{"mod divisor zero", ruleWithWin(`{"op":">","l":{"op":"mod","l":{"r":0},"r":{"c":0}},"r":{"c":5}}`)},
		{"mod divisor float", ruleWithWin(`{"op":">","l":{"op":"mod","l":{"r":0},"r":{"c":2.5}},"r":{"c":5}}`)},
		{"logic op extra key", ruleWithWin(`{"op":"and","args":[{"op":">","l":{"r":0},"r":{"c":1}},{"op":"<","l":{"r":0},"r":{"c":9}}],"x":1}`)},
		{"logic args not array", ruleWithWin(`{"op":"or","args":"nope"}`)},
		{"logic one arg", ruleWithWin(`{"op":"and","args":[{"op":">","l":{"r":0},"r":{"c":1}}]}`)},
		{"logic bad child", ruleWithWin(`{"op":"and","args":[{"op":">","l":{"r":0},"r":{"c":1}},{"r":0}]}`)},
		{"not with args", ruleWithWin(`{"op":"not","args":[{"op":">","l":{"r":0},"r":{"c":1}}]}`)},
		{"not bad child", ruleWithWin(`{"op":"not","arg":{"r":0}}`)},
	}
	for _, c := range cases {
		if _, err := ParseRule([]byte(c.raw)); err == nil {
			t.Errorf("%s: unexpectedly valid", c.name)
		}
	}
}

func TestParseRuleDepthCap(t *testing.T) {
	wrap := func(inner string, times int) string {
		out := inner
		for i := 0; i < times; i++ {
			out = `{"op":"not","arg":` + out + `}`
		}
		return out
	}
	cmp := `{"op":">","l":{"r":0},"r":{"c":5000}}`
	if _, err := ParseRule([]byte(ruleWithWin(wrap(cmp, 30)))); err != nil {
		t.Fatalf("30 nots should be valid: %v", err)
	}
	_, err := ParseRule([]byte(ruleWithWin(wrap(cmp, 31))))
	wantErr(t, err, "nesting too deep")
	_, err = ParseRule([]byte(ruleWithWin(wrap(cmp, 32))))
	wantErr(t, err, "nesting too deep")
	modCmp := `{"op":">","l":{"op":"mod","l":{"r":0},"r":{"c":7}},"r":{"c":3}}`
	if _, err := ParseRule([]byte(ruleWithWin(wrap(modCmp, 29)))); err != nil {
		t.Fatalf("29 nots over mod should be valid: %v", err)
	}
	_, err = ParseRule([]byte(ruleWithWin(wrap(modCmp, 30))))
	wantErr(t, err, "nesting too deep")
}

func TestEvalWinOperators(t *testing.T) {
	two := `{"v":0,"random":{"type":"int","min":0,"max":9999,"count":2},"win":%s,"payout_bp":10000}`
	cases := []struct {
		win  string
		want bool
	}{
		{`{"op":">","l":{"r":0},"r":{"c":9}}`, true},
		{`{"op":">","l":{"r":0},"r":{"c":10}}`, false},
		{`{"op":">=","l":{"r":0},"r":{"c":10}}`, true},
		{`{"op":"<","l":{"r":1},"r":{"c":21}}`, true},
		{`{"op":"<=","l":{"r":1},"r":{"c":19}}`, false},
		{`{"op":"==","l":{"r":0},"r":{"c":10}}`, true},
		{`{"op":"!=","l":{"r":0},"r":{"r":1}}`, true},
		{`{"op":"!=","l":{"r":0},"r":{"c":10}}`, false},
		{`{"op":"==","l":{"op":"mod","l":{"r":1},"r":{"c":7}},"r":{"c":6}}`, true},
		{`{"op":"not","arg":{"op":"==","l":{"r":0},"r":{"c":10}}}`, false},
		{`{"op":"and","args":[{"op":">","l":{"r":0},"r":{"c":9}},{"op":">","l":{"r":1},"r":{"c":19}}]}`, true},
		{`{"op":"and","args":[{"op":">","l":{"r":0},"r":{"c":10}},{"op":">","l":{"r":1},"r":{"c":19}}]}`, false},
		{`{"op":"or","args":[{"op":">","l":{"r":0},"r":{"c":10}},{"op":">","l":{"r":1},"r":{"c":19}}]}`, true},
		{`{"op":"or","args":[{"op":">","l":{"r":0},"r":{"c":10}},{"op":">","l":{"r":1},"r":{"c":20}}]}`, false},
	}
	for _, c := range cases {
		rule := mustRule(t, fmt.Sprintf(two, c.win))
		got, err := rule.EvalWin([]uint32{10, 20})
		if err != nil {
			t.Fatalf("%s: %v", c.win, err)
		}
		if got != c.want {
			t.Errorf("%s: got %v want %v", c.win, got, c.want)
		}
	}
}

func TestEvalWinDrawCountMismatch(t *testing.T) {
	rule := mustRule(t, validRuleJSON)
	_, err := rule.EvalWin([]uint32{})
	wantErr(t, err, "draw count")
	_, err = rule.EvalWin([]uint32{1, 2})
	wantErr(t, err, "draw count")
}

func TestResolveOutcomeErrors(t *testing.T) {
	rule := mustRule(t, validRuleJSON)
	_, err := ResolveOutcome(rule, testSeed[:8], "alice", 0)
	wantErr(t, err, "32 bytes")
	_, err = ResolveOutcome(rule, testSeed, "bad seed", 0)
	wantErr(t, err, "clientSeed")
}

func testDigest() []byte {
	return crypto.Keccak256([]byte("foreseer engine test digest"))
}

func testKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	key, err := crypto.HexToECDSA(ReferenceTestKeyHex)
	if err != nil {
		t.Fatalf("key: %v", err)
	}
	return key
}

func TestSignDigestErrors(t *testing.T) {
	key := testKey(t)
	_, err := SignDigest(testDigest()[:31], key)
	wantErr(t, err, "32 bytes")
	_, err = SignDigest(append(testDigest(), 0), key)
	wantErr(t, err, "32 bytes")
}

func TestRecoverSignerRejections(t *testing.T) {
	key := testKey(t)
	digest := testDigest()
	sig, err := SignDigest(digest, key)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if _, err := RecoverSigner(digest[:31], sig); err == nil {
		t.Fatal("short digest accepted")
	}

	badV := sig
	badV[64] = 29
	_, err = RecoverSigner(digest, badV)
	wantErr(t, err, "27 or 28")

	zeroR := sig
	for i := 0; i < 32; i++ {
		zeroR[i] = 0
	}
	_, err = RecoverSigner(digest, zeroR)
	wantErr(t, err, "invalid r")

	hugeR := sig
	for i := 0; i < 32; i++ {
		hugeR[i] = 0xff
	}
	_, err = RecoverSigner(digest, hugeR)
	wantErr(t, err, "invalid r")

	zeroS := sig
	for i := 32; i < 64; i++ {
		zeroS[i] = 0
	}
	_, err = RecoverSigner(digest, zeroS)
	wantErr(t, err, "invalid s")

	hugeS := sig
	for i := 32; i < 64; i++ {
		hugeS[i] = 0xff
	}
	_, err = RecoverSigner(digest, hugeS)
	wantErr(t, err, "invalid s")

	s := new(big.Int).SetBytes(sig[32:64])
	highS := new(big.Int).Sub(secpN, s)
	flipped := sig
	highS.FillBytes(flipped[32:64])
	if flipped[64] == 27 {
		flipped[64] = 28
	} else {
		flipped[64] = 27
	}
	_, err = RecoverSigner(digest, flipped)
	wantErr(t, err, "high-s")
}

func TestRecoverSignerUnrecoverablePoint(t *testing.T) {
	digest := testDigest()
	var sig [65]byte
	sig[63] = 1
	sig[64] = 27
	for r := int64(1); r <= 64; r++ {
		big.NewInt(r).FillBytes(sig[0:32])
		if _, err := RecoverSigner(digest, sig); err != nil {
			return
		}
	}
	t.Fatal("no unrecoverable r found in 1..64")
}

func TestReceiptStructHashErrors(t *testing.T) {
	receipt := Receipt{ClientSeed: "alice"}
	_, err := receipt.StructHash()
	wantErr(t, err, "non-empty")
	receipt.Draws = []uint32{1}
	receipt.ClientSeed = "bad seed"
	_, err = receipt.StructHash()
	wantErr(t, err, "clientSeed")
	receipt.ClientSeed = "alice"
	if _, err := receipt.StructHash(); err != nil {
		t.Fatalf("valid receipt rejected: %v", err)
	}
	_, err = receipt.Digest(nil)
	wantErr(t, err, "uint256")
	receipt.Draws = nil
	_, err = receipt.Digest(big.NewInt(114))
	wantErr(t, err, "non-empty")
}

func TestDomainSeparatorErrors(t *testing.T) {
	_, err := DomainSeparator(nil)
	wantErr(t, err, "uint256")
	_, err = DomainSeparator(big.NewInt(-1))
	wantErr(t, err, "uint256")
	_, err = DomainSeparator(new(big.Int).Lsh(big.NewInt(1), 256))
	wantErr(t, err, "uint256")
	_, err = EIP712Digest(nil, testDigest())
	wantErr(t, err, "uint256")
	if _, err := DomainSeparator(big.NewInt(0)); err != nil {
		t.Fatalf("chainId 0 rejected: %v", err)
	}
}

func TestSeedCommitErrors(t *testing.T) {
	_, err := SeedCommit(testSeed[:31])
	wantErr(t, err, "32 bytes")
	_, err = SeedCommit(append(testSeed, 0))
	wantErr(t, err, "32 bytes")
}

func TestVerifyCommitFalsePaths(t *testing.T) {
	commit, err := SeedCommit(testSeed)
	if err != nil {
		t.Fatalf("SeedCommit: %v", err)
	}
	if !VerifyCommit(testSeed, commit) {
		t.Fatal("correct reveal rejected")
	}
	wrong := make([]byte, 32)
	copy(wrong, testSeed)
	wrong[0] ^= 1
	if VerifyCommit(wrong, commit) {
		t.Fatal("wrong seed accepted")
	}
	if VerifyCommit(testSeed[:16], commit) {
		t.Fatal("short seed accepted")
	}
}

func TestEpochCloseDigestErrors(t *testing.T) {
	commit, _ := SeedCommit(testSeed)
	closeStruct := EpochClose{SpecVersion: SpecVersion, SeedCommit: commit, ReceiptCount: 1}
	_, err := closeStruct.Digest(nil)
	wantErr(t, err, "uint256")
	_, err = SignEpochClose(&closeStruct, nil, testKey(t))
	wantErr(t, err, "uint256")
	if _, err := closeStruct.Digest(big.NewInt(114)); err != nil {
		t.Fatalf("valid close rejected: %v", err)
	}
}

func TestMerkleProofOutOfRange(t *testing.T) {
	leaves := make([][32]byte, 3)
	for i := range leaves {
		copy(leaves[i][:], crypto.Keccak256([]byte(fmt.Sprintf("leaf:%d", i))))
	}
	tree := NewMerkleTree(leaves)
	if _, err := tree.Proof(-1); err == nil {
		t.Fatal("negative index accepted")
	}
	_, err := tree.Proof(3)
	wantErr(t, err, "out of range")
	empty := NewMerkleTree(nil)
	if empty.Root() != ([32]byte{}) {
		t.Fatal("empty root not zero")
	}
	if _, err := empty.Proof(0); err == nil {
		t.Fatal("proof on empty tree accepted")
	}
}

func TestVerifyMerkleProofTampered(t *testing.T) {
	leaves := make([][32]byte, 8)
	for i := range leaves {
		copy(leaves[i][:], crypto.Keccak256([]byte(fmt.Sprintf("leaf:%d", i))))
	}
	tree := NewMerkleTree(leaves)
	root := tree.Root()
	proof, err := tree.Proof(3)
	if err != nil {
		t.Fatalf("proof: %v", err)
	}
	if !VerifyMerkleProof(leaves[3], proof, root) {
		t.Fatal("valid proof rejected")
	}
	if VerifyMerkleProof(leaves[4], proof, root) {
		t.Fatal("wrong leaf accepted")
	}
	bad := make([][32]byte, len(proof))
	copy(bad, proof)
	bad[0][0] ^= 1
	if VerifyMerkleProof(leaves[3], bad, root) {
		t.Fatal("tampered proof accepted")
	}
	badRoot := root
	badRoot[31] ^= 1
	if VerifyMerkleProof(leaves[3], proof, badRoot) {
		t.Fatal("tampered root accepted")
	}
}

func TestReferenceTeeConstructorErrors(t *testing.T) {
	_, err := NewReferenceTee(ReferenceTeeOptions{PrivateKeyHex: "zz"})
	wantErr(t, err, "private key")
	_, err = NewReferenceTee(ReferenceTeeOptions{ServerSeed: testSeed[:31]})
	wantErr(t, err, "32 bytes")
}

func TestReferenceTeeLifecycleErrors(t *testing.T) {
	tee, err := NewReferenceTee(ReferenceTeeOptions{ServerSeed: testSeed, Now: func() uint64 { return 1755000000 }})
	if err != nil {
		t.Fatalf("tee: %v", err)
	}
	rule := mustRule(t, validRuleJSON)
	if _, err := tee.Play("alice", rule); err == nil {
		t.Fatal("play with no epoch accepted")
	}
	if _, err := tee.CloseEpoch(); err == nil {
		t.Fatal("close with no epoch accepted")
	}
	if tee.EpochOpen() || tee.CurrentEpochID() != 0 || tee.ReceiptCount() != 0 {
		t.Fatal("closed tee reports open state")
	}
	if tee.CurrentSeedCommit() != ([32]byte{}) {
		t.Fatal("closed tee reports a commit")
	}
	epochID, commit, err := tee.OpenEpoch()
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, _, err := tee.OpenEpoch(); err == nil {
		t.Fatal("double open accepted")
	}
	if !tee.EpochOpen() || tee.CurrentEpochID() != epochID || tee.CurrentSeedCommit() != commit {
		t.Fatal("open tee state mismatch")
	}
	if _, err := tee.Play("bad seed", rule); err == nil {
		t.Fatal("invalid clientSeed accepted")
	}
	if _, err := tee.Play("alice", rule); err != nil {
		t.Fatalf("play: %v", err)
	}
	if tee.ReceiptCount() != 1 {
		t.Fatalf("receipt count %d", tee.ReceiptCount())
	}
	if _, err := tee.CloseEpoch(); err != nil {
		t.Fatalf("close: %v", err)
	}
	if _, err := tee.CloseEpoch(); err == nil {
		t.Fatal("second close accepted")
	}
	nextID, _, err := tee.OpenEpoch()
	if err != nil || nextID != epochID+1 {
		t.Fatalf("reopen: id %d err %v", nextID, err)
	}
}

func TestReferenceTeeDeterministicEpochs(t *testing.T) {
	run := func() (*SignedReceipt, *CloseResult) {
		tee, err := NewReferenceTee(ReferenceTeeOptions{
			ServerSeed:   testSeed,
			FirstEpochID: 7,
			Now:          func() uint64 { return 1755000000 },
		})
		if err != nil {
			t.Fatalf("tee: %v", err)
		}
		if _, _, err := tee.OpenEpoch(); err != nil {
			t.Fatalf("open: %v", err)
		}
		rule := mustRule(t, validRuleJSON)
		signed, err := tee.Play("alice", rule)
		if err != nil {
			t.Fatalf("play: %v", err)
		}
		closed, err := tee.CloseEpoch()
		if err != nil {
			t.Fatalf("close: %v", err)
		}
		return signed, closed
	}
	sig1, close1 := run()
	sig2, close2 := run()
	if sig1.Signature != sig2.Signature {
		t.Fatal("receipt signatures differ across identical epochs")
	}
	if sig1.Receipt.EpochID != 7 || sig2.Receipt.EpochID != 7 {
		t.Fatal("firstEpochId not honored")
	}
	if close1.MerkleRoot != close2.MerkleRoot || close1.CloseSignature != close2.CloseSignature {
		t.Fatal("close results differ across identical epochs")
	}
}

func TestReferenceTeeRandomSeeds(t *testing.T) {
	tee, err := NewReferenceTee(ReferenceTeeOptions{})
	if err != nil {
		t.Fatalf("tee: %v", err)
	}
	_, first, err := tee.OpenEpoch()
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := tee.CloseEpoch(); err != nil {
		t.Fatalf("close: %v", err)
	}
	_, second, err := tee.OpenEpoch()
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if first == second {
		t.Fatal("fresh epochs reused a seed commit")
	}
	rule := mustRule(t, validRuleJSON)
	signed, err := tee.Play("alice", rule)
	if err != nil {
		t.Fatalf("play: %v", err)
	}
	if signed.Receipt.Timestamp < 1700000000 {
		t.Fatalf("default clock timestamp %d", signed.Receipt.Timestamp)
	}
}
