# Foreseer MVP roadmap

Folder TODOs: [spec/TODO.md](spec/TODO.md), [packages/ts/TODO.md](packages/ts/TODO.md),
[server/TODO.md](server/TODO.md), [tee/TODO.md](tee/TODO.md).

## Phase 1: spec, TypeScript reference, golden vectors (done)

- [x] Write FORESEER-SPEC v0.1 in spec/SPEC.md
- [x] Implement foreseer.ts core: derive, rules, receipt, commit, merkle, verify
- [x] Implement ReferenceTee and presets (dice, coinflip)
- [x] Generate golden vectors into spec/vectors/ and sync to packages/ts/test/vectors/
- [x] Golden tests, property and edge tests, full e2e epoch test all green
- [x] Register packages/ts as a git submodule of the root

## Phase 2: server orchestration MVP (done)

- [x] Epoch scheduler (open, resolve, close on a timer)
- [x] Receipt store on SQLite
- [x] Verify API (serve receipts, proofs, revealed seeds)
- [x] Operator API keys and per-operator rule registry

## Phase 3: Go TEE extension

- [x] Scaffold tee/ from fce-extension-scaffold
- [x] Mirror ReferenceTee in Go, byte for byte
- [x] Match every golden vector in spec/vectors/ exactly
- [x] Run with SIMULATED_TEE locally (extension server plus smoke client)
- [ ] Deploy the SIMULATED_TEE image to Coston2 (operator-run: Docker plus funded key, see tee/README.md)

## Phase 4: contracts

- [x] InstructionSender wiring for TEE messages (ForeseerInstructionSender.sol)
- [x] Seed commitment storage per epoch (commitEpoch, bound by the signed close)
- [x] Merkle root anchoring per epoch (anchorEpoch, EIP-712 verified onchain)
- [x] Paid openEpoch() with fee split (treasury share bp plus operator balance)
- [ ] Deploy and register on Coston2 (operator-run: funded key)

## Phase 5: player-facing verification (done)

- [x] Browser verify widget (docs-site/verify.html, six checks, offline in the browser)
- [x] Docs site (docs-site/, protocol overview plus the verifier)

## Phase 6: production hardening (done)

- [x] Billing automation (server /admin/billing report, price per play, per-operator)
- [x] Operator bonding contract (OperatorBond.sol: bond, delayed withdraw, slash; 7 tests)
- [x] Second TEE machine support (two instances with distinct identities demonstrated; siblings compose; physical second box is deployment)
- [x] Production hardening pass (HARDENING.md runbook, rate limits, body caps, /metrics, backups)
