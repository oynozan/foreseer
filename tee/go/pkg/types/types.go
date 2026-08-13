// Package types contains types that could be useful to other apps when interacting with this extension.
package types

import (
	"encoding/json"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// SayHelloRequest is the JSON payload sent via the Solidity contract.
type SayHelloRequest struct {
	Name string `json:"name"`
}

// SayHelloResponse is the JSON payload returned in ActionResult.Data.
type SayHelloResponse struct {
	Greeting       string `json:"greeting"`
	GreetingNumber int    `json:"greetingNumber"`
}

// SayGoodbyeRequest is the ABI-decoded payload sent via the Solidity contract.
type SayGoodbyeRequest struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// SayGoodbyeResponse is the JSON payload returned in ActionResult.Data.
type SayGoodbyeResponse struct {
	Farewell       string `json:"farewell"`
	FarewellNumber int    `json:"farewellNumber"`
}

// SayGoodbyeMessageArg describes the ABI layout of SayGoodbyeMessage from the Solidity contract.
var SayGoodbyeMessageArg abi.Argument

func init() {
	tupleTy, _ := abi.NewType("tuple", "", []abi.ArgumentMarshaling{
		{Name: "name", Type: "string"},
		{Name: "reason", Type: "string"},
	})
	SayGoodbyeMessageArg = abi.Argument{Type: tupleTy}
}

// PlayRequest is the JSON payload for a FORESEER PLAY command.
type PlayRequest struct {
	ClientSeed string          `json:"clientSeed"`
	Rule       json.RawMessage `json:"rule"`
}

// ReceiptJSON mirrors the FORESEER-SPEC receipt with JSON native ints.
type ReceiptJSON struct {
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

type PlayResponse struct {
	Receipt   ReceiptJSON `json:"receipt"`
	Signature string      `json:"signature"`
}

type OpenEpochResponse struct {
	EpochID    uint64 `json:"epochId"`
	SeedCommit string `json:"seedCommit"`
}

type CloseEpochResponse struct {
	ServerSeed     string `json:"serverSeed"`
	MerkleRoot     string `json:"merkleRoot"`
	ReceiptCount   int    `json:"receiptCount"`
	CloseSignature string `json:"closeSignature"`
}

// State holds the extension's observable state, returned by GET /state.
type State struct {
	GreetingCount int    `json:"greetingCount"`
	LastGreeting  string `json:"lastGreeting"`
	FarewellCount int    `json:"farewellCount"`
	LastFarewell  string `json:"lastFarewell"`

	ForeseerTeeID      string `json:"foreseerTeeId"`
	ForeseerEpochID    uint64 `json:"foreseerEpochId"`
	ForeseerEpochOpen  bool   `json:"foreseerEpochOpen"`
	ForeseerSeedCommit string `json:"foreseerSeedCommit"`
	ForeseerBets       int    `json:"foreseerBets"`
}

// --- DO NOT MODIFY below this line. ---

// StateResponse is the envelope returned by GET /state.
type StateResponse struct {
	StateVersion common.Hash `json:"stateVersion"`
	State        State       `json:"state"`
}
