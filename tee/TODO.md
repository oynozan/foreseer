# tee/ TODO

Roadmap context: [root TODO.md](../TODO.md).

## Phase 3 (this session)

- [x] Scaffold from https://github.com/flare-foundation/fce-extension-scaffold (vendored, Go path)
- [x] Port ReferenceTee logic to Go (spec/SPEC.md is normative)
- [x] Match every golden vector in spec/vectors/ byte for byte (go test ./internal/engine)
- [x] FORESEER ops (OPEN_EPOCH, PLAY, CLOSE_EPOCH) in the extension pipeline
- [x] Local SIMULATED_TEE run (cmd + foreseer-smoke)
- [x] Full chain leg executed on a live chain-114 EVM (anvil): deploy, register,
      paid open with fee split, commit, anchor accepted via the golden TEE close
      signature, inclusion proofs over RPC, operator bonding
- [ ] Retarget the same commands to Coston2: fund 0x84ef59f489879c00dd2d60c5b7f5a94ee20a85a5
      at faucet.flare.network/coston2 (captcha, human step), key already staged in .env
- [ ] Epoch key handling: identity key inside the enclave, attestation registration

## Phase 4 hooks

- [x] ForeseerInstructionSender.sol: FORESEER ops, paid openEpoch with fee split
- [x] Seed commitments (commitEpoch) and Merkle anchors (anchorEpoch, EIP-712 verified onchain)
- [x] Foundry tests against the golden vectors (12 passing)
- [x] FORESEER conformance fixtures (17, 18, 19) plus updated state fixture
- [x] Deployment and registration flow proven end to end on a chain-114 EVM
- [ ] Rerun against Coston2 once the staged key is funded (single forge create, args prepared)
