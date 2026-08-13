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

## Phase 2: server orchestration MVP

- [ ] Epoch scheduler (open, resolve, close on a timer)
- [ ] Receipt store on SQLite
- [ ] Verify API (serve receipts, proofs, revealed seeds)
- [ ] Operator API keys and per-operator rule registry

## Phase 3: Go TEE extension

- [ ] Scaffold tee/ from fce-extension-scaffold
- [ ] Mirror ReferenceTee in Go, byte for byte
- [ ] Match every golden vector in spec/vectors/ exactly
- [ ] Run on Coston2 with SIMULATED_TEE

## Phase 4: contracts

- [ ] InstructionSender wiring for TEE messages
- [ ] Seed commitment storage per epoch
- [ ] Merkle root anchoring per epoch
- [ ] Paid openEpoch() with fee split

## Phase 5: player-facing verification

- [ ] Browser verify widget (six checks, all green)
- [ ] Docs site

## Phase 6: production hardening

- [ ] Billing automation
- [ ] Operator bonding contract
- [ ] Second TEE machine
- [ ] Production hardening pass (monitoring, key rotation, incident runbook)
