# Foreseer

Provably-fair engine for iGaming built on Flare Confidential Compute (FCC) TEEs.

Game outcomes are produced inside a TEE. Per epoch, the TEE generates a secret
`serverSeed`, publishes `SHA256(serverSeed)` onchain as a commitment, then
resolves bets offchain as `outcome = f(serverSeed, clientSeed, nonce)`. Every
outcome comes back as a receipt signed with the TEE's secp256k1 identity key.
At epoch close the TEE reveals the seed and anchors a Merkle root of all
receipts onchain. Players verify everything in the browser: signature,
recomputed outcome, commit/reveal, Merkle inclusion.

Outcome derivation is byte-identical between the Go TEE engine (later phase)
and the TypeScript reference implementation in this repo. `spec/SPEC.md` is
the normative contract; `spec/vectors/` are the golden test vectors both
implementations must match exactly.

## Layout

| Path | Contents |
| --- | --- |
| `spec/` | FORESEER-SPEC v0.1 and golden test vectors (committed deliverables) |
| `packages/ts` | npm package `foreseer.ts`: core, verifier, ReferenceTee. Git submodule |
| `server/` | Orchestration service: epochs, SQLite receipt store, verify API (Phase 2) |
| `tee/` | Go FCE extension, engine matching the vectors, contracts (Phases 3 and 4) |
| `docs-site/` | Docs site and the browser receipt verifier (Phase 5) |
| `HARDENING.md` | Production hardening runbook (Phase 6) |
| `TODO.md` | Whole-project MVP roadmap |

## Running tests

```sh
cd packages/ts
pnpm install
pnpm build
pnpm test
```

Regenerate golden vectors (writes `spec/vectors/`, then copies them into the
package):

```sh
cd packages/ts
pnpm gen-vectors
pnpm sync-vectors
```

Regeneration is deterministic: the files must come out byte-identical.

## Git: clone and commit

- Clone with `git clone --recurse-submodules <url>`. After a plain clone, run
  `git submodule update --init`.
- An empty `packages/ts/` folder means the submodule was never initialized:
  run `git submodule update --init`.
- After every pull, run `git submodule update --init` again.
- Commit order is always two-step: commit inside `packages/ts` first, then
  commit the pointer bump in the root:
  `git -C packages/ts commit ...` then `git add packages/ts && git commit`.
- `modified: packages/ts (new commits)` in `git status` means the pointer
  commit is still missing: `git add packages/ts && git commit`.
- Never stage the subrepo's file contents into the root repo.
