# tee/ TODO

Roadmap context: [root TODO.md](../TODO.md).

## Phase 3 (this session)

- [x] Scaffold from https://github.com/flare-foundation/fce-extension-scaffold (vendored, Go path)
- [x] Port ReferenceTee logic to Go (spec/SPEC.md is normative)
- [x] Match every golden vector in spec/vectors/ byte for byte (go test ./internal/engine)
- [x] FORESEER ops (OPEN_EPOCH, PLAY, CLOSE_EPOCH) in the extension pipeline
- [x] Local SIMULATED_TEE run (cmd + foreseer-smoke)
- [ ] Deploy and run on Coston2 (needs Docker plus a funded DEPLOYMENT_PRIVATE_KEY; see README)
- [ ] Epoch key handling: identity key inside the enclave, attestation registration

## Phase 4 hooks

- [ ] Rewrite contracts/InstructionSender.sol for FORESEER ops
- [ ] Commit and Merkle anchor transactions via InstructionSender
- [ ] Update testdata/conformance fixtures for FORESEER ops
