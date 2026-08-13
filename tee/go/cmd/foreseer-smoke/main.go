// Dev client: drives a running extension with FORESEER actions.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"extension-scaffold/internal/config"
	"extension-scaffold/pkg/types"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

const diceRule = `{"v":0,"random":{"type":"int","min":0,"max":9999,"count":1},"win":{"op":">","l":{"r":0},"r":{"c":4999}},"payout_bp":19800}`

type dataFixed struct {
	InstructionID      common.Hash    `json:"instructionId"`
	TeeID              common.Address `json:"teeId"`
	Timestamp          uint64         `json:"timestamp"`
	RewardEpochID      uint32         `json:"rewardEpochId"`
	OPType             common.Hash    `json:"opType"`
	OPCommand          common.Hash    `json:"opCommand"`
	Cosigners          []string       `json:"cosigners"`
	CosignersThreshold uint64         `json:"cosignersThreshold"`
	OriginalMessage    hexutil.Bytes  `json:"originalMessage"`
}

func send(base string, id int, command string, payload []byte) (*teetypes.ActionResult, error) {
	df := dataFixed{
		InstructionID:   common.BigToHash(common.Big32),
		OPType:          teeutils.ToHash(config.OPTypeForeseer),
		OPCommand:       teeutils.ToHash(command),
		OriginalMessage: payload,
	}
	msg, err := json.Marshal(df)
	if err != nil {
		return nil, err
	}
	action := teetypes.Action{
		Data: teetypes.ActionData{
			ID:            common.BigToHash(common.Big1),
			SubmissionTag: teetypes.Submit,
			Message:       msg,
		},
	}
	body, err := json.Marshal(action)
	if err != nil {
		return nil, err
	}
	resp, err := http.Post(base+"/action", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var ar teetypes.ActionResult
	if err := json.NewDecoder(resp.Body).Decode(&ar); err != nil {
		return nil, fmt.Errorf("http %d: %w", resp.StatusCode, err)
	}
	return &ar, nil
}

func main() {
	base := os.Getenv("FORESEER_EXTENSION_URL")
	if base == "" {
		base = "http://localhost:8080"
	}

	open, err := send(base, 1, config.OPCommandOpenEpoch, nil)
	if err != nil {
		fmt.Println("open failed:", err)
		os.Exit(1)
	}
	fmt.Printf("OPEN_EPOCH  status=%d log=%s data=%s\n", open.Status, open.Log, open.Data)

	for i, seed := range []string{"alice", "alice", "bob"} {
		payload, _ := json.Marshal(types.PlayRequest{ClientSeed: seed, Rule: []byte(diceRule)})
		play, err := send(base, 2+i, config.OPCommandPlay, payload)
		if err != nil {
			fmt.Println("play failed:", err)
			os.Exit(1)
		}
		var pr types.PlayResponse
		_ = json.Unmarshal(play.Data, &pr)
		fmt.Printf("PLAY        status=%d bet=%d %s nonce=%d draw=%v win=%v\n",
			play.Status, pr.Receipt.BetID, pr.Receipt.ClientSeed, pr.Receipt.Nonce, pr.Receipt.Draws, pr.Receipt.Win)
	}

	closeRes, err := send(base, 9, config.OPCommandCloseEpoch, nil)
	if err != nil {
		fmt.Println("close failed:", err)
		os.Exit(1)
	}
	fmt.Printf("CLOSE_EPOCH status=%d log=%s data=%s\n", closeRes.Status, closeRes.Log, closeRes.Data)

	state, err := http.Get(base + "/state")
	if err == nil {
		defer state.Body.Close()
		var s any
		_ = json.NewDecoder(state.Body).Decode(&s)
		out, _ := json.Marshal(s)
		fmt.Printf("STATE       %s\n", out)
	}
}
