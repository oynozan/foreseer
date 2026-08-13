# Foreseer security audit

Date: 2026-08-13. Scope: `server/` (Nest.js + better-sqlite3 orchestration
service), with supporting checks on `packages/ts` and dependencies. Every
claim below is backed by a test in `server/test/security.test.ts` or a
command run during the audit; nothing is asserted from reading alone.

## Verdict

No SQL injection. No known exploitable server vulnerability in scope. Two
hardening findings were discovered during this audit and fixed in the same
session (F-1, F-2 below).

## SQL injection: confirmed absent

Method: every `prepare()` call site in `server/src` was enumerated. All
values reach SQL through `?` placeholders (better-sqlite3 bound parameters,
never string concatenation). The only dynamic SQL text in the codebase is
`Engine.receiptPage`, which interpolates a `where` fragment chosen from two
hardcoded string constants; user values still bind through placeholders.

Proof by test (`security.test.ts`, "sql injection resistance"):

- Operator names like `Robert"); DROP TABLE operators;--` and
  `' OR '1'='1` are stored and returned as inert strings; the
  `sqlite_master` table list is identical before and after.
- `clientSeed` query filters with injection payloads return `total: 0`
  instead of leaking other rows; the honest filter still returns its row.
- Play-path `clientSeed` payloads are rejected 400 by the spec charset
  (`^[A-Za-z0-9_-]{1,64}$`) before any state is touched.
- Numeric path and query params (`/epochs/1 OR 1=1`, `billing?from=0 OR 1=1`)
  are rejected by strict `^\d+$` validation before reaching the database.

## Findings fixed during the audit

### F-1: operator API keys were stored in plaintext (medium, fixed)

`operators.api_key` held the usable secret; a leaked database file or backup
would leak every operator credential. Fixed: the column is now
`api_key_hash` holding `sha256(key)`; the plaintext is returned exactly once
at creation and never persisted. Lookup hashes the presented header first,
which also removes any string-compare timing surface. Test: the credential
handling suite asserts the dump contains no `fsk_` material and that
plaintext auth still works against the hash. Note: dev databases created
before this change need recreating (schema is CREATE IF NOT EXISTS).

### F-2: unexpected errors leaked internal messages (low, fixed)

The exception filter returned `error.message` for unhandled errors, which
could expose driver internals or file paths on a 500. Fixed: unhandled
errors log server-side and return `{"error":"internal error"}`. Test kills
the DB connection under a live app and asserts the generic body.

## Reviewed and found sound

- Admin auth: sha256 + `timingSafeEqual`, constant length, no early exit.
- Operator keys: 192-bit random (`fsk_` + 24 random bytes hex); brute force
  is infeasible; auth is header based, no cookies, so open CORS cannot be
  used for CSRF (browsers cannot attach the header cross-origin without the
  key).
- DoS bounds: 64 KiB JSON body cap (413), pagination capped at 1000 rows,
  rule AST capped (depth 32, count 16, uint32 values) by the consensus
  validator, per-operator rate limit on `/play`, Merkle rebuilds cached.
- Information exposure: `serverSeed` is null on every open epoch response
  (tested); it appears only after close, which is the protocol design.
- Prototype pollution: rule objects pass an exact-key-set validator, so
  `__proto__`/`constructor` keys are rejected as unknown keys.
- No dynamic file paths from user input anywhere in `server/src`.
- The consensus library itself is byte-validated against golden vectors in
  three implementations, with high-s signature rejection and strict input
  validation (see spec section 1.2 and the stress suite).

## Dependency audit

- `server`: `pnpm audit --ignore-workspace`: **No known vulnerabilities found**.
- `packages/ts`: 1 low: esbuild `<0.28.1` arbitrary file read **when running
  its development server on Windows** (GHSA path: vitest > vite > esbuild).
  Accepted: dev-only transitive dependency, the esbuild dev server is never
  run in this repo (esbuild is used purely as a bundler/test transform), and
  the version is pinned by vite's range. Revisit when vite ships esbuild
  0.28.1.

## Out of scope, tracked elsewhere

Enclave key custody, attestation, and chain trust are Phase 3+ properties
covered by `HARDENING.md` and the Flare attestation flow, not by this server
audit. The SIMULATED_TEE seed-in-SQLite design is documented and intentional
until the Go enclave takes over signing.
