package extension

import (
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"extension-scaffold/internal/config"
	"extension-scaffold/internal/engine"
	"extension-scaffold/pkg/types"

	teetypes "github.com/flare-foundation/tee-node/pkg/types"
)

const diceRuleJSON = `{"v":0,"random":{"type":"int","min":0,"max":9999,"count":1},"win":{"op":">","l":{"r":0},"r":{"c":4999}},"payout_bp":19800}`

func newForeseerExtension(t *testing.T) *Extension {
	t.Helper()
	seed := make([]byte, 32)
	for i := range seed {
		seed[i] = byte(i)
	}
	tee, err := engine.NewReferenceTee(engine.ReferenceTeeOptions{
		ServerSeed: seed,
		Now:        func() uint64 { return 1755000000 },
	})
	if err != nil {
		t.Fatalf("tee: %v", err)
	}
	return &Extension{tee: tee}
}

func runForeseer(t *testing.T, e *Extension, command string, payload []byte) teetypes.ActionResult {
	t.Helper()
	action := buildTestAction(toHash(config.OPTypeForeseer), toHash(command), payload)
	status, body := e.processAction(action)
	if status != http.StatusOK {
		t.Fatalf("%s: status %d body %s", command, status, body)
	}
	var ar teetypes.ActionResult
	if err := json.Unmarshal(body, &ar); err != nil {
		t.Fatalf("%s: %v", command, err)
	}
	return ar
}

func TestForeseerEpochLifecycle(t *testing.T) {
	e := newForeseerExtension(t)

	open := runForeseer(t, e, config.OPCommandOpenEpoch, nil)
	if open.Status != 1 {
		t.Fatalf("open failed: %s", open.Log)
	}
	var opened types.OpenEpochResponse
	if err := json.Unmarshal(open.Data, &opened); err != nil {
		t.Fatalf("open data: %v", err)
	}
	if opened.EpochID != 1 || !strings.HasPrefix(opened.SeedCommit, "0x") {
		t.Fatalf("unexpected open response: %+v", opened)
	}

	playPayload, _ := json.Marshal(types.PlayRequest{ClientSeed: "alice", Rule: []byte(diceRuleJSON)})
	first := runForeseer(t, e, config.OPCommandPlay, playPayload)
	if first.Status != 1 {
		t.Fatalf("play failed: %s", first.Log)
	}
	var played types.PlayResponse
	if err := json.Unmarshal(first.Data, &played); err != nil {
		t.Fatalf("play data: %v", err)
	}
	if played.Receipt.BetID != 0 || played.Receipt.Nonce != 0 || played.Receipt.ClientSeed != "alice" {
		t.Fatalf("unexpected receipt: %+v", played.Receipt)
	}
	if played.Receipt.SeedCommit != opened.SeedCommit {
		t.Fatalf("receipt commit mismatch")
	}
	sigBytes, err := hex.DecodeString(strings.TrimPrefix(played.Signature, "0x"))
	if err != nil || len(sigBytes) != 65 {
		t.Fatalf("bad signature encoding")
	}

	second := runForeseer(t, e, config.OPCommandPlay, playPayload)
	var playedSecond types.PlayResponse
	_ = json.Unmarshal(second.Data, &playedSecond)
	if playedSecond.Receipt.Nonce != 1 || playedSecond.Receipt.BetID != 1 {
		t.Fatalf("nonce did not advance: %+v", playedSecond.Receipt)
	}

	closeRes := runForeseer(t, e, config.OPCommandCloseEpoch, nil)
	if closeRes.Status != 1 {
		t.Fatalf("close failed: %s", closeRes.Log)
	}
	var closed types.CloseEpochResponse
	if err := json.Unmarshal(closeRes.Data, &closed); err != nil {
		t.Fatalf("close data: %v", err)
	}
	if closed.ReceiptCount != 2 || !strings.HasPrefix(closed.MerkleRoot, "0x") {
		t.Fatalf("unexpected close: %+v", closed)
	}
	commit, _ := engine.SeedCommit(mustHex(t, closed.ServerSeed))
	if "0x"+hex.EncodeToString(commit[:]) != opened.SeedCommit {
		t.Fatalf("revealed seed does not match commitment")
	}
}

func TestForeseerRejectsBadInput(t *testing.T) {
	e := newForeseerExtension(t)
	runForeseer(t, e, config.OPCommandOpenEpoch, nil)

	badRule, _ := json.Marshal(types.PlayRequest{ClientSeed: "alice", Rule: []byte(`{"v":1}`)})
	res := runForeseer(t, e, config.OPCommandPlay, badRule)
	if res.Status != 0 || !strings.Contains(res.Log, "invalid rule") {
		t.Fatalf("invalid rule accepted: %+v", res)
	}

	floatRule, _ := json.Marshal(types.PlayRequest{
		ClientSeed: "alice",
		Rule:       []byte(`{"v":0,"random":{"type":"int","min":0,"max":9999.0,"count":1},"win":{"op":">","l":{"r":0},"r":{"c":4999}},"payout_bp":19800}`),
	})
	res = runForeseer(t, e, config.OPCommandPlay, floatRule)
	if res.Status != 0 {
		t.Fatalf("float token 9999.0 accepted, spec 4.2 violated")
	}

	badSeed, _ := json.Marshal(types.PlayRequest{ClientSeed: "no spaces!", Rule: []byte(diceRuleJSON)})
	res = runForeseer(t, e, config.OPCommandPlay, badSeed)
	if res.Status != 0 {
		t.Fatalf("invalid clientSeed accepted")
	}

	double := runForeseer(t, e, config.OPCommandOpenEpoch, nil)
	if double.Status != 0 || !strings.Contains(double.Log, "already open") {
		t.Fatalf("double open accepted: %+v", double)
	}
}

func TestForeseerKeyHex(t *testing.T) {
	realKey := strings.Repeat("11", 32)
	cases := []struct {
		name    string
		env     map[string]string
		want    string
		wantErr bool
	}{
		{"explicit key on a public chain", map[string]string{"FORESEER_TEE_KEY": "0x" + realKey, "CHAIN_ID": "114"}, realKey, false},
		{"devnet falls back to the test key", map[string]string{"CHAIN_ID": "31337"}, engine.ReferenceTestKeyHex, false},
		{"unset chain falls back to the test key", map[string]string{}, engine.ReferenceTestKeyHex, false},
		{"coston2 without a key is refused", map[string]string{"CHAIN_ID": "114"}, "", true},
		{"coston without a key is refused", map[string]string{"CHAIN_ID": " 16 "}, "", true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := foreseerKeyHex(func(k string) string { return c.env[k] })
			if c.wantErr {
				if err == nil {
					t.Fatalf("public test key accepted on chain %q", c.env["CHAIN_ID"])
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != c.want {
				t.Fatalf("key = %s, want %s", got, c.want)
			}
		})
	}
}

func mustHex(t *testing.T, s string) []byte {
	t.Helper()
	b, err := hex.DecodeString(strings.TrimPrefix(s, "0x"))
	if err != nil {
		t.Fatalf("bad hex: %v", err)
	}
	return b
}
