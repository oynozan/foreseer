# server/ TODO

Roadmap context: [root TODO.md](../TODO.md).

## Phase 2 MVP (done)

- [x] Runtime and framework: Node 22, Nest.js (platform-express), better-sqlite3 (decided by the developer 2026-08-13)
- [x] Epoch scheduler: open, resolve, close epochs on a timer (Engine.tick)
- [x] Receipt store on SQLite (operators, rules, epochs, receipts; crash-safe state)
- [x] Verify API: receipts, Merkle proofs, revealed seeds, server-side check endpoint
- [x] Operator API keys and rule registry per operator

## Later

- [x] Billing hooks (usage metering per operator, Phase 6): GET /admin/billing report
- [ ] Swap simulated seed handling for the Go TEE (Phase 3): server relays instead of signing
- [x] Cache Merkle trees of hot closed epochs (LRU of 8 in Engine.proofFor)
- [x] Pagination on receipt listings (limit/offset with total on GET /epochs/:id/receipts)
- [x] Rate limiting on /play (fixed window per operator, env-configurable)
