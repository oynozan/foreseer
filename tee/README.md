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

## Test

```sh
cd go
go test ./...
```

## Run locally (simulated)

```sh
cd go
EXTENSION_PORT=8095 go run ./cmd            # extension server
FORESEER_EXTENSION_URL=http://localhost:8095 go run ./cmd/foreseer-smoke
```

The smoke client opens an epoch, plays three dice bets, closes the epoch, and
prints receipts, the revealed seed, the Merkle root, and the close signature.

## Coston2

The scaffold ships the whole deployment pipeline: `scripts/full-setup.sh`,
`docker-compose.coston2.yaml`, contract deployment and registration tools
under `tools/`, and step-by-step docs in [docs/deployment-steps.md](docs/deployment-steps.md)
and [docs/testing-against-coston2.md](docs/testing-against-coston2.md).
Running it needs Docker plus a funded Coston2 account
(`DEPLOYMENT_PRIVATE_KEY` in `.env`, test FLR from the faucet). That final
step is operator-run and intentionally not automated from this repo.

Phase 4 (root roadmap) wires `contracts/InstructionSender.sol` to the
FORESEER ops, seed commitments, and Merkle anchors onchain.
