# Foreseer server

Orchestration service for Foreseer (Phase 2 of the [root roadmap](../TODO.md)):
epoch lifecycle on a timer, SQLite receipt store, verify API, operator API
keys. Zero runtime dependencies beyond `foreseer.ts`: plain `node:http` and
the built-in `node:sqlite`.

SIMULATED TEE: this server generates and stores epoch seeds itself (in
SQLite) and signs with a configurable key. Phase 3 replaces exactly this part
with the Go FCE extension running in a real enclave; the receipt bytes,
Merkle trees, and signatures already follow FORESEER-SPEC v0.1, so nothing
player-facing changes. All epoch state lives in SQLite, so the server can
restart mid-epoch without losing nonces, betIds, or seeds.

## Run

```sh
pnpm install --ignore-workspace   # foreseer.ts must be built first (pnpm build in packages/ts)
pnpm start                        # or: pnpm dev (watch mode)
pnpm test
pnpm typecheck
```

Node >= 22 (uses the built-in `node:sqlite`).

## Configuration (env)

| Variable                 | Default                    | Meaning                                                        |
| ------------------------ | -------------------------- | -------------------------------------------------------------- |
| `PORT`                   | `8787`                     | HTTP port                                                      |
| `FORESEER_DB`            | `data/foreseer.db`         | SQLite database path                                           |
| `FORESEER_EPOCH_SECONDS` | `300`                      | epoch length; the scheduler closes and reopens on this cadence |
| `FORESEER_ADMIN_KEY`     | `dev-admin-key` (warns)    | key for `/admin/*` routes                                      |
| `FORESEER_TEE_KEY`       | reference test key (warns) | secp256k1 private key (hex) used to sign receipts              |

## API

Operator routes need `x-api-key`, admin routes need `x-admin-key`. Everything
else is public (players verify without any key).

| Method | Path                               | What                                                              |
| ------ | ---------------------------------- | ----------------------------------------------------------------- |
| GET    | `/health`                          | `{ok, teeId, chainId}`                                            |
| POST   | `/admin/operators`                 | create operator `{name}` -> `{id, name, apiKey}`                  |
| POST   | `/admin/close`                     | force-close the open epoch                                        |
| POST   | `/rules`                           | register a rule `{rule}` -> `{ruleHash}` (validated per spec 4.2) |
| GET    | `/rules/:ruleHash`                 | fetch the rule document for a hash                                |
| POST   | `/play`                            | `{clientSeed, ruleHash, nonce?}` -> signed receipt                |
| GET    | `/epochs/current`                  | open epoch: id, commitment, timing                                |
| GET    | `/epochs/:id`                      | epoch info; `serverSeed` is null until closed                     |
| GET    | `/epochs/:id/receipts?clientSeed=` | receipts of an epoch                                              |
| GET    | `/epochs/:id/proof/:betId`         | Merkle proof (after close)                                        |
| GET    | `/verify/:epochId/:betId`          | run the offline checks server-side                                |

The verify endpoint is a convenience; the honest path is client-side
verification with `foreseer.ts` against `/epochs/:id` (revealed seed),
`/rules/:hash`, and `/epochs/:id/proof/:betId`. The API tests do exactly
that.
