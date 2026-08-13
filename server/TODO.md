# server/ TODO

Roadmap context: [root TODO.md](../TODO.md).

## Phase 2 MVP (done)

- [x] Runtime and framework: Node 22, no framework (node:http), node:sqlite (recorded 2026-08-13)
- [x] Epoch scheduler: open, resolve, close epochs on a timer (Engine.tick)
- [x] Receipt store on SQLite (operators, rules, epochs, receipts; crash-safe state)
- [x] Verify API: receipts, Merkle proofs, revealed seeds, server-side check endpoint
- [x] Operator API keys and rule registry per operator

## Later

- [ ] Billing hooks (usage metering per operator, Phase 6)
- [ ] Swap simulated seed handling for the Go TEE (Phase 3): server relays instead of signing
- [ ] Cache Merkle trees of hot closed epochs (proofFor rebuilds per call)
- [ ] Pagination on receipt listings
- [ ] Rate limiting on /play
