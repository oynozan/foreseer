package extension

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"extension-scaffold/internal/config"
	"extension-scaffold/internal/engine"
	"extension-scaffold/pkg/types"

	"github.com/flare-foundation/go-flare-common/pkg/logger"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

// SIMULATED_TEE: key from env, reference test key as dev default
func newForeseerTee() *engine.ReferenceTee {
	keyHex := strings.TrimPrefix(os.Getenv("FORESEER_TEE_KEY"), "0x")
	if keyHex == "" {
		keyHex = engine.ReferenceTestKeyHex
		logger.Warnf("FORESEER_TEE_KEY not set, using the public reference test key (SIMULATED_TEE)")
	}
	tee, err := engine.NewReferenceTee(engine.ReferenceTeeOptions{PrivateKeyHex: keyHex})
	if err != nil {
		logger.Fatalf("invalid FORESEER_TEE_KEY: %v", err)
	}
	return tee
}

func hex32(b [32]byte) string {
	return "0x" + hex.EncodeToString(b[:])
}

func receiptToJSON(signed *engine.SignedReceipt) types.PlayResponse {
	r := signed.Receipt
	return types.PlayResponse{
		Receipt: types.ReceiptJSON{
			SpecVersion: r.SpecVersion,
			CodeVersion: hex32(r.CodeVersion),
			EpochID:     r.EpochID,
			BetID:       r.BetID,
			SeedCommit:  hex32(r.SeedCommit),
			ClientSeed:  r.ClientSeed,
			Nonce:       r.Nonce,
			RuleHash:    hex32(r.RuleHash),
			Draws:       r.Draws,
			Win:         r.Win,
			PayoutBp:    r.PayoutBp,
			Timestamp:   r.Timestamp,
		},
		Signature: "0x" + hex.EncodeToString(signed.Signature[:]),
	}
}

func (e *Extension) processForeseer(action teetypes.Action, df *instruction.DataFixed) (int, []byte) {
	var ar teetypes.ActionResult
	switch {
	case df.OPCommand == teeutils.ToHash(config.OPCommandOpenEpoch):
		ar = e.processOpenEpoch(action, df)
	case df.OPCommand == teeutils.ToHash(config.OPCommandPlay):
		ar = e.processPlay(action, df)
	case df.OPCommand == teeutils.ToHash(config.OPCommandCloseEpoch):
		ar = e.processCloseEpoch(action, df)
	default:
		return http.StatusNotImplemented, []byte(fmt.Sprintf(
			"unsupported op command: received %s, expected one of [%s, %s, %s]",
			df.OPCommand.Hex(), config.OPCommandOpenEpoch, config.OPCommandPlay, config.OPCommandCloseEpoch,
		))
	}
	b, _ := json.Marshal(ar)
	return http.StatusOK, b
}

func (e *Extension) processOpenEpoch(action teetypes.Action, df *instruction.DataFixed) teetypes.ActionResult {
	e.mu.Lock()
	epochID, commit, err := e.tee.OpenEpoch()
	e.mu.Unlock()
	if err != nil {
		return buildResult(action, df, nil, 0, err)
	}
	data, _ := json.Marshal(types.OpenEpochResponse{EpochID: epochID, SeedCommit: hex32(commit)})
	return buildResult(action, df, data, 1, nil)
}

func (e *Extension) processPlay(action teetypes.Action, df *instruction.DataFixed) teetypes.ActionResult {
	var req types.PlayRequest
	dec := json.NewDecoder(bytes.NewReader(df.OriginalMessage))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return buildResult(action, df, nil, 0, fmt.Errorf("decoding request: %w", err))
	}
	rule, err := engine.ParseRule(req.Rule)
	if err != nil {
		return buildResult(action, df, nil, 0, err)
	}
	e.mu.Lock()
	signed, err := e.tee.Play(req.ClientSeed, rule)
	e.mu.Unlock()
	if err != nil {
		return buildResult(action, df, nil, 0, err)
	}
	data, _ := json.Marshal(receiptToJSON(signed))
	return buildResult(action, df, data, 1, nil)
}

func (e *Extension) processCloseEpoch(action teetypes.Action, df *instruction.DataFixed) teetypes.ActionResult {
	e.mu.Lock()
	closed, err := e.tee.CloseEpoch()
	e.mu.Unlock()
	if err != nil {
		return buildResult(action, df, nil, 0, err)
	}
	data, _ := json.Marshal(types.CloseEpochResponse{
		ServerSeed:     hex32(closed.ServerSeed),
		MerkleRoot:     hex32(closed.MerkleRoot),
		ReceiptCount:   closed.ReceiptCount,
		CloseSignature: "0x" + hex.EncodeToString(closed.CloseSignature[:]),
	})
	return buildResult(action, df, data, 1, nil)
}
