# Foreseer production hardening runbook

Phase 6 operational checklist. Everything here is enforced by code where
possible; the rest is procedure.

## Keys

- TEE identity key: generated inside the enclave in production, never in env.
  SIMULATED mode (`FORESEER_TEE_KEY`) is for development only; the server and
  extension both log a warning when running on the public reference key.
- Key rotation: open no new epochs, close the current epoch, anchor it
  (`anchorEpoch`), register the new TEE identity via Flare attestation, point
  `ForeseerInstructionSender.teeId` governance at the new address, resume.
  Old receipts stay verifiable forever against the old address.
- Server secrets (`FORESEER_ADMIN_KEY`, operator api keys): 32+ bytes random,
  rotated by inserting a new operator row and revoking the old one.
- Deployment key (`DEPLOYMENT_PRIVATE_KEY`): funded, used only by the
  scaffold deploy tools, never shipped in images.

## Multi machine

- Two or more TEE machines run the same image with distinct identity keys
  (demonstrated: two instances, teeIds 0x7e5f...bdf and 0x2b5a...d6cf).
  `docker-compose.siblings.yaml` in `tee/` runs the sibling topology.
- `verifyEpoch` fails receipts whose signer differs from the epoch signer, so
  one epoch is always one machine; route per epoch, not per bet.
- Operator bonding: `OperatorBond.sol` (bond, delayed withdraw, governance
  slash to treasury) backs operator honesty with stake.

## Server

- Rate limits: `FORESEER_PLAY_LIMIT` / `FORESEER_PLAY_WINDOW_SECONDS`.
- Request bodies capped at 64 KiB; receipts endpoints paginated.
- Monitoring: `GET /metrics` (uptime, epochs, receipts, cache hits, plays in
  the last hour) and `GET /health`. Alert on: no epoch close within 2x
  `FORESEER_EPOCH_SECONDS`, plays dropping to zero, 5xx rate.
- SQLite runs WAL mode: back up with `sqlite3 foreseer.db ".backup ..."` on a
  schedule; the DB is the entire orchestration state and restores mid-epoch.
- Billing: `GET /admin/billing?from=&to=` with
  `FORESEER_PRICE_PER_PLAY_WEI`; export monthly, invoice per operator.

## Incident response

- Suspected seed leak: close the epoch immediately (`POST /admin/close`),
  anchor, rotate the TEE identity key, audit receipts of the epoch with
  `verifyEpoch` before paying out.
- Verification failure reported by a player: fetch the epoch, run
  `verifyEpoch` offline; a genuine mismatch is a stop-the-world event: halt
  `/play`, do not open new epochs, publish the evidence.
- Chain reorg around an anchor: `anchorEpoch` is idempotent per epoch and
  can be resubmitted; receipts hold without the anchor via the close
  signature.

## Deploy checklist (Coston2 and beyond)

1. `docker build -f go/Dockerfile` reproducibly (SOURCE_DATE_EPOCH pinned).
2. `./scripts/full-setup.sh --chain coston2 --test` with a funded
   `DEPLOYMENT_PRIVATE_KEY` in `tee/.env`.
3. Deploy `ForeseerInstructionSender` and `OperatorBond`, register the
   extension, set governance, verify with `tools/cmd/verify-deploy`.
4. Set real `FORESEER_ADMIN_KEY`, `FORESEER_TEE_KEY` unset (enclave key),
   `FORESEER_PRICE_PER_PLAY_WEI`, rate limits sized to capacity.
5. Run the stress suite (`pnpm stress` in packages/ts) on release candidates.
