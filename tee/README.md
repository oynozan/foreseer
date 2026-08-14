# Foreseer TEE extension

Go Flare Compute Extension (FCE) for Foreseer, built on
[fce-extension-scaffold](https://github.com/flare-foundation/fce-extension-scaffold)
(vendored here; the original scaffold README is [SCAFFOLD-README.md](SCAFFOLD-README.md),
its docs live in [docs/](docs/)). The Python and TypeScript scaffold languages
were dropped; Foreseer is Go only.

## What is implemented

- `go/internal/engine/`: the full FORESEER-SPEC v0.1 consensus engine
  (HMAC-SHA256 byte stream, rejection-sampled draws, rule AST with float-token
  rejection at the parse layer, EIP-712 receipts and epoch close, sorted-pair
  Keccak Merkle trees) plus a `ReferenceTee` that mirrors the normative
  TypeScript implementation in `packages/ts`.
- `go/internal/engine/vectors_test.go`: golden conformance against
  `spec/vectors/`. Every block, draw, canonical rule, hash, struct hash,
  digest, signature, address, Merkle root, proof, and the whole e2e epoch
  replay must match byte for byte, and they do.
- `go/internal/extension/foreseer.go`: FORESEER op type with OPEN_EPOCH, PLAY,
  CLOSE_EPOCH commands wired into the scaffold's action pipeline. The
  scaffold's GREETING demo ops are kept so its conformance fixtures still run.
- `go/cmd/foreseer-smoke/`: dev client that drives a running extension with
  real TEE-node wire actions.

SIMULATED_TEE: the extension signs with `FORESEER_TEE_KEY` (hex env var). When
unset it warns and uses the public reference test key from SPEC section 9.1.
Real enclave key handling arrives with attestation on actual FCC hardware.

## Contracts (Phase 4)

`contracts/ForeseerInstructionSender.sol`: FORESEER ops with paid
`sendOpenEpoch()` (fee split treasury/operator, excess forwarded as the
registry instruction fee), pre-reveal `commitEpoch`, and trustless
`anchorEpoch` that verifies the FORESEER-SPEC 6.3 EIP-712 EpochClose
signature onchain (ecrecover to the attested teeId, low-s enforced, sha256
seed-commitment binding) plus `verifyReceiptInclusion` (sorted-pair Merkle).
Tested with Foundry against the golden vectors: the contract accepts the
actual `closeSignature` from `spec/vectors/e2e.json` on chainId 114.

```sh
forge test    # 12 tests; forge-std is vendored in lib/
```

## Test

```sh
cd go
go test ./...
./scripts/test-conformance.sh go   # 19 wire fixtures incl. FORESEER ops
```

Windows note: the conformance harness needs a jq whose stdout is LF. The
winget jq emits CRLF; wrap it (`jq "$@" | tr -d '\r'`) or run under WSL.

## Docker image

```sh
docker build -f go/Dockerfile -t foreseer-tee .
```

This is the image Coston2 runs (distroless, combined tee-node + extension).

## Run locally (simulated)

```sh
cd go
EXTENSION_PORT=8095 go run ./cmd            # extension server
FORESEER_EXTENSION_URL=http://localhost:8095 go run ./cmd/foreseer-smoke
```

The smoke client opens an epoch, plays three dice bets, closes the epoch, and
prints receipts, the revealed seed, the Merkle root, and the close signature.

## Coston2 deployment (live)

Deployed 2026-08-14 from `0x84ef59f489879c00dd2d60c5b7f5a94ee20a85a5`:

| Contract | Address |
| --- | --- |
| ForeseerInstructionSender | `0x3fecD2c7B57DB6ac1EC2446bAe61cd9d740342b6` |
| OperatorBond | `0xAe260f04eCe439aD21427381e0032ad9B2f11e69` |

The golden epoch is anchored on the public network: `commitEpoch` tx
`0xee82feb5...28b2d5`, `anchorEpoch` tx `0x293c0e32...d2529f` (the contract
verified the golden TEE close signature via ecrecover on chain id 114), and
`verifyReceiptInclusion` answers true for golden receipt 0 over public RPC.
An operator bond of 1 C2FLR is active.

## Flare registry registration (live)

Registered 2026-08-14 in the `FlareTeeManager` diamond at
`0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE` via `scripts/pre-build.sh`:

| Item | Value |
| --- | --- |
| EXTENSION_ID | `0x00000000000000000000000000000000000000000000000000000000000102c2` (66242) |
| Scaffold InstructionSender | `0xC2268A60E73a330a57530eA8620C53A95b00731B` |

`config/extension.env` (gitignored) carries the same values for the scripts.
`tools/cmd/query-tee -ext 0x...0102c2` confirms the extension over public RPC
(zero active TEE machines until a Confidential Space VM is attached).

Release image (reproducible, SOURCE_DATE_EPOCH from the last root commit):

| Item | Value |
| --- | --- |
| Tag | `foreseer-tee:v0.1.0` |
| Digest | `sha256:3f1f479d284e344f6e3e768c828fe9452052c5f09250a6754699f45bdbc3ce15` |
| Hand-off tar | `foreseer-tee-v0.1.0.tar` (gitignored) |
| MODE | `1` baked, `MODE` is in `tee.launch_policy.allow_env_override`, launch with `MODE=0` |

Remaining hand-off (needs infrastructure outside this repo): deploy the
release image on a GCP Confidential Space VM with
`INITIAL_OWNER`, `CHAIN_URL`, `EXTENSION_ID`, `PROXY_URL` and `MODE=0`,
receive the public proxy URL, set `EXT_PROXY_URL` in `.env.coston2`, then run
`scripts/post-build.sh` (allow-tee-version, governance, register-tee with
real FTDC attestation). See [docs/deployment-steps.md](docs/deployment-steps.md)
steps 6 to 9.

## Coston2 pipeline

The scaffold ships the whole deployment pipeline: `scripts/full-setup.sh`,
`docker-compose.coston2.yaml`, contract deployment and registration tools
under `tools/`, and step-by-step docs in [docs/deployment-steps.md](docs/deployment-steps.md)
and [docs/testing-against-coston2.md](docs/testing-against-coston2.md).
Running it needs Docker plus a funded Coston2 account
(`DEPLOYMENT_PRIVATE_KEY` in `.env`, test FLR from the faucet). That final
step is operator-run and intentionally not automated from this repo.

Phase 4 (root roadmap) wires `contracts/InstructionSender.sol` to the
FORESEER ops, seed commitments, and Merkle anchors onchain.
