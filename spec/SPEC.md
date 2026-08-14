# FORESEER-SPEC v0.1

Normative protocol specification for Foreseer, a provably-fair outcome engine.
This document is the source of truth. The TypeScript reference implementation
(`packages/ts`, npm package `foreseer-sdk`) and the future Go TEE engine MUST
produce byte-identical results for everything defined here. If an
implementation and this spec disagree, the implementation is wrong.

Keywords MUST, MUST NOT, and MAY are used in the RFC 2119 sense.

Consensus-critical computation uses integer and byte operations only. No
floating point, no ambient randomness, no clock reads, no locale-dependent
behavior. All arithmetic in this spec is exact integer arithmetic.

## §1 Primitives and encodings

### §1.1 Hash functions

- SHA-256 is used for seed commitments (§6) and rule hashes (§4).
- Keccak-256 (the Ethereum variant, not FIPS SHA-3) is used for EIP-712
  hashing (§5) and the epoch Merkle tree (§7).

### §1.2 Signatures

- Curve: secp256k1. Signatures are made over 32-byte EIP-712 digests (§5.4).
- Wire format: exactly 65 bytes, `r || s || v`. `r` and `s` are 32-byte
  big-endian unsigned integers. `v` is one byte, MUST be 27 or 28.
- Low-s rule: with `n` the secp256k1 group order
  `0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141`,
  a signature is valid only if `1 <= s <= n / 2` (integer division, i.e.
  `s <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0`).
  Signers MUST produce low-s signatures. Verifiers MUST reject any signature
  with `s` above that bound, `r` or `s` equal to 0 or >= `n`, or `v` outside
  {27, 28}.
- `teeId` is the Ethereum address of the signer: the last 20 bytes of
  `keccak256(uncompressedPubkey[1..65])` (the 64 bytes of X and Y, dropping
  the 0x04 prefix). Canonical text form is lowercase hex with `0x` prefix.

### §1.3 Values

- `serverSeed`: exactly 32 bytes. Anything else is invalid.
- `clientSeed`: a string matching `^[A-Za-z0-9_-]{1,64}$`. This alphabet
  rejects canonicalization ambiguity (no Unicode, no whitespace, no `:`,
  which is the §2 message separator).
- `nonce`: uint64. Starts at 0 and increments by 1 per bet per
  `(epochId, clientSeed)` pair.
- `epochId`, `betId`, `timestamp`: uint64. `specVersion`: uint16, value 1 for
  this spec version. `payoutBp` and every drawn value: uint32.
- `chainId`: uint256 (it is an EIP-712 domain field, §5.1).

### §1.4 Integer text encoding

`dec(x)` is the shortest base-10 ASCII representation of the unsigned integer
`x`: no sign, no leading zeros, `"0"` for zero. Integers embedded in HMAC
messages (§2) always use `dec(x)`. Integers in JSON (rules, vectors) are
native JSON integers and MUST NOT be written as floats (`5000`, never
`5000.0` or `5e3`).

### §1.5 Byte and hex conventions

- All multi-byte integers in hashing and encoding contexts are big-endian.
- Hex strings in JSON are lowercase, `0x`-prefixed, full-width (bytes32 is
  always 66 characters).
- Byte array comparison (used in §7) is lexicographic on unsigned byte
  values, shorter-is-smaller never applies (operands are always 32 bytes).

## §2 Deterministic byte stream

Each bet consumes a private, infinite byte stream derived from
`(serverSeed, clientSeed, nonce)`:

```
block_i = HMAC-SHA256(key = serverSeed,
                      msg = UTF8(clientSeed || ":" || dec(nonce) || ":" || dec(i)))
stream  = block_0 || block_1 || block_2 || ...
```

- `||` is byte concatenation. The message is the UTF-8 encoding of the
  concatenated ASCII string. Example: clientSeed `alice`, nonce 7, block 2
  gives the message bytes of `"alice:7:2"`.
- `i` is the block index, an unsigned integer starting at 0.
- Blocks are 32 bytes each and MUST be produced lazily, only as consumed.
- The stream is read strictly left to right. Nothing is ever skipped except
  by the rejection rule in §3.

## §3 Unbiased integer draws

`drawInt(stream, min, max)` returns a uniformly distributed integer in
`[min, max]` using rejection sampling. Requirements: `0 <= min <= max`,
both integers, and `range = max - min + 1 <= 2^32`.

1. Read the next 4 bytes from the stream. Interpret them big-endian as an
   unsigned 32-bit integer `x`.
2. `limit = 2^32 - (2^32 mod range)`.
3. If `x >= limit`: discard `x` and repeat from step 1 (the rejection path).
   At least one golden vector MUST exercise this path.
4. Otherwise return `min + (x mod range)`.

When `range` is a power of two (including the full `2^32`), `limit = 2^32`
and nothing is ever rejected.

A bet with `count` draws (§4) performs `count` sequential `drawInt` calls
against the same stream, in draw order 0, 1, 2, and so on. Rejected samples
consume stream bytes exactly like accepted ones; there is no per-draw
realignment.

## §4 Rules (v0)

A rule is data, not code. The canonical form is a JSON AST:

```json
{
  "v": 0,
  "random": { "type": "int", "min": 0, "max": 9999, "count": 1 },
  "win": { "op": ">", "l": { "r": 0 }, "r": { "c": 5000 } },
  "payout_bp": 19800
}
```

### §4.1 Grammar

```
rule      = { "v": 0, "random": random, "win": boolExpr, "payout_bp": uint }
random    = { "type": "int", "min": uint, "max": uint, "count": uint }
operand   = { "r": uint }          draw reference, 0-based
          | { "c": uint }          integer constant
intExpr   = operand
          | { "op": "mod", "l": operand, "r": { "c": uint } }
boolExpr  = { "op": cmpOp, "l": intExpr, "r": intExpr }
          | { "op": "and", "args": [boolExpr, boolExpr, ...] }
          | { "op": "or",  "args": [boolExpr, boolExpr, ...] }
          | { "op": "not", "arg": boolExpr }
cmpOp     = ">" | ">=" | "<" | "<=" | "==" | "!="
```

- `{ "r": i }` evaluates to the i-th drawn value (0-based, `i < count`).
- `{ "c": n }` evaluates to the integer constant `n`.
- Comparison ops return bool. `and` / `or` / `not` return bool and take
  bool arguments only. `mod` returns an int; its right side MUST be a
  constant operand with value >= 1.
- `win` MUST evaluate to bool. Evaluation is total: a valid rule can never
  fail at evaluation time.
- `payout_bp` is the payout in basis points as an integer (19800 = 1.98x).
  A resolved bet pays `payout_bp` when `win` is true and 0 when false; the
  receipt's `payoutBp` field (§5) records exactly that resolved value.

### §4.2 Validity

A rule is invalid if ANY of the following holds. Validation MUST check all
of them; anything not explicitly allowed by §4.1 is invalid.

1. The rule is not a JSON object, or has keys other than exactly
   `v`, `random`, `win`, `payout_bp`.
2. `v` is not the integer 0.
3. `random` is not an object with exactly the keys `type`, `min`, `max`,
   `count`, or `random.type` is not the string `"int"`.
4. `min`, `max`, or `count` is not an integer; or `min < 0`; or
   `max > 4294967295`; or `min > max`; or `count < 1`; or `count > 16`.
5. `payout_bp` is not an integer in `[0, 4294967295]`.
6. Any operand object does not have exactly one key, or that key is not
   `r` or `c`.
7. A draw reference `{ "r": i }` where `i` is not an integer in
   `[0, count - 1]`.
8. A constant `{ "c": n }` where `n` is not an integer in
   `[0, 4294967295]`.
9. An expression object with an unknown `op`, or with keys other than
   exactly those its form requires (`op`/`l`/`r` for comparisons and `mod`,
   `op`/`args` for `and`/`or`, `op`/`arg` for `not`).
10. A `mod` whose `l` is not an operand, or whose `r` is not a constant
    operand, or whose constant is 0.
11. An `and` or `or` whose `args` is not an array of at least 2 boolExprs.
12. A comparison or `mod` argument that is a boolExpr; an `and`/`or`/`not`
    argument that is an intExpr or operand.
13. Any number anywhere that is not an integer, any null, any boolean
    literal, any string where a number or object is required. Validation
    operates on parsed values. A rule document whose source text writes a
    number as a float (`5.0`, `5e3`) is malformed at the transport layer
    (§1.4): implementations that parse rule text (such as the Go engine)
    MUST reject such tokens at parse time. Canonical bytes (§4.3) never
    contain them, so `ruleHash` is unaffected either way.
14. `win` nesting depth greater than 32 (an operand has depth 1, each
    expression adds 1).

### §4.3 Canonical JSON and rule hash

Canonical serialization of a valid rule:

- UTF-8 bytes.
- Object keys sorted lexicographically by byte value (all keys are ASCII).
- No whitespace of any kind.
- Integers in shortest decimal form (`dec(x)` of §1.4). No floats, no nulls.
- Strings serialized as JSON strings; the only strings that occur are from
  the fixed sets in §4.1 and never require escaping.

```
ruleHash = SHA256(canonicalBytes)
```

The example rule above canonicalizes to:

```
{"payout_bp":19800,"random":{"count":1,"max":9999,"min":0,"type":"int"},"v":0,"win":{"l":{"r":0},"op":">","r":{"c":5000}}}
```

### §4.4 Integer range guarantee

Every drawn value fits in uint32, every constant fits in uint32, and `mod`
can only shrink values. Therefore every intermediate value during evaluation
lies in `[0, 4294967295]`, comfortably inside the float64-safe integer range
`[0, 2^53)`. Implementations MUST reject (at validation time) any rule that
could produce a value outside `[0, 4294967295]`; under this grammar no valid
rule can.

## §5 Receipt (EIP-712)

Every resolved bet yields a receipt signed by the TEE identity key.

### §5.1 Domain

```
EIP712Domain(string name,string version,uint256 chainId)
```

with `name = "Foreseer"`, `version = "0"`. There is no `verifyingContract`
field in v0.1. `chainId` binds receipts to one chain (14 for Flare, 114 for
Coston2; test vectors use 114, see §9).

```
domainSeparator = keccak256(
    keccak256("EIP712Domain(string name,string version,uint256 chainId)")
 || keccak256("Foreseer")
 || keccak256("0")
 || uint256be(chainId))
```

`uint256be(x)` is `x` as a 32-byte big-endian word.

### §5.2 Type

```
Receipt(uint16 specVersion,bytes32 codeVersion,uint64 epochId,uint64 betId,bytes32 seedCommit,string clientSeed,uint64 nonce,bytes32 ruleHash,uint32[] draws,bool win,uint32 payoutBp,uint64 timestamp)
```

`typeHash = keccak256(UTF8(<the exact string above>))`. No spaces anywhere
in the type string.

Field semantics:

- `specVersion`: 1 for this spec version.
- `codeVersion`: hash of the TEE image producing the receipt. The reference
  implementation uses the fixed constant of §9.2.
- `epochId`: the epoch this bet belongs to.
- `betId`: sequential per epoch, starting at 0, in resolution order. Leaf
  `i` of the epoch Merkle tree (§7) is the receipt with `betId = i`.
- `seedCommit`: `SHA256(serverSeed)` of the epoch, binding the receipt to
  the onchain commitment.
- `clientSeed`, `nonce`: the §2 stream inputs for this bet.
- `ruleHash`: §4.3 hash of the rule the bet was resolved under.
- `draws`: the `count` drawn values, in draw order.
- `win`: the §4 evaluation result.
- `payoutBp`: `payout_bp` of the rule if `win`, else 0.
- `timestamp`: unix seconds, informational only. It is covered by the
  signature but MUST be excluded from fairness verification (§8): a verifier
  never recomputes or judges it.

### §5.3 encodeData

`structHash = keccak256(typeHash || enc(f1) || enc(f2) || ... || enc(f12))`
with fields in the declaration order of §5.2 and:

- uint16, uint32, uint64, uint256: `uint256be(value)`.
- bool: `uint256be(0)` or `uint256be(1)`.
- bytes32: the 32 bytes as-is.
- string: `keccak256(UTF8(value))`.
- uint32[]: `keccak256(uint256be(v0) || uint256be(v1) || ...)`; the empty
  array encodes as `keccak256("")` but cannot occur (`count >= 1`).

### §5.4 Digest and signature

```
digest = keccak256(0x19 || 0x01 || domainSeparator || structHash)
```

The TEE signs `digest` per §1.2. Verifiers recover the public key from
`(digest, r, s, v)` and derive `teeId`. A receipt verifies against an
expected TEE address iff recovery succeeds, the §1.2 checks pass, and the
recovered address equals the expected one.

## §6 Commit / reveal

### §6.1 Commitment

```
commit = SHA256(serverSeed)
```

Published onchain when the epoch opens (as `seedCommit`). A reveal is valid
iff `SHA256(revealedSeed) == commit`.

### §6.2 Outcome recomputation

Given the revealed seed, a verifier recomputes, for every receipt: the §2
stream from `(revealedSeed, clientSeed, nonce)`, the §3 draws per the rule,
the §4 win evaluation, and the resolved `payoutBp`. The receipt is valid iff
`draws`, `win`, and `payoutBp` all match exactly. The verifier MUST also
check that the supplied rule document hashes (§4.3) to the receipt's
`ruleHash`.

### §6.3 Epoch close signature

At epoch close the TEE signs an EIP-712 `EpochClose` struct under the §5.1
domain, with the same hashing and signature rules as §5.3 and §5.4:

```
EpochClose(uint16 specVersion,bytes32 codeVersion,uint64 epochId,bytes32 seedCommit,bytes32 serverSeed,bytes32 merkleRoot,uint64 receiptCount)
```

- `serverSeed`: the revealed 32-byte seed (as bytes32).
- `merkleRoot`: the §7 root over all `receiptCount` receipts of the epoch.
- Other fields as in §5.2.

The close signature is valid iff it recovers to the same `teeId` as the
epoch's receipts and `SHA256(serverSeed) == seedCommit`.

## §7 Epoch Merkle tree

### §7.1 Construction

- Leaf `i` = the EIP-712 digest (§5.4) of the receipt with `betId = i`.
  Leaves are in `betId` order.
- Parent of nodes `a`, `b`: `keccak256(sortedConcat(a, b))` where
  `sortedConcat` places the lexicographically smaller (§1.5) 32-byte value
  first. This is OpenZeppelin `MerkleProof` compatible.
- Levels are built bottom-up. At each level, nodes are paired left to right:
  `(0,1), (2,3), ...`. If a level has an odd number of nodes, the last node
  is promoted unchanged to the next level.
- For `n = 1` the root is the single leaf itself and its proof is the empty
  array.
- For `n = 0` (an epoch that closes with no receipts) the root is defined as
  32 zero bytes. No proofs exist.

### §7.2 Proofs

The proof for leaf `i` is the bottom-up list of sibling hashes; a promoted
node contributes no proof element at the level it was promoted. Verification:

```
h = leaf
for p in proof: h = keccak256(sortedConcat(h, p))
valid iff h == root
```

## §8 Verification checklist

The six player-facing checks, the functions that implement them, and
whether they run offline (pure, implemented in v0.1) or need chain reads
(interface only in v0.1):

| # | Check | Function | Mode |
| --- | --- | --- | --- |
| 1 | Receipt signature is valid and recovers the TEE address | `verifyReceiptSignature` | pure |
| 2 | That TEE address is registered by Flare attestation | `ChainReader.isTeeRegistered` | chain |
| 3 | Revealed seed matches the receipt's `seedCommit` (§6.1) | `verifyCommit` | pure |
| 4 | `seedCommit` matches the onchain epoch commitment | `ChainReader.getSeedCommit` | chain |
| 5 | Draws, win, payout recompute exactly from the seed (§6.2) | `verifyOutcome` | pure |
| 6 | Receipt digest proves into the epoch Merkle root (§7), and that root is anchored onchain | `verifyMerkleProof` + `ChainReader.getMerkleRoot` | pure + chain |

Checks 1, 3, 5, and the proof half of 6 are implemented in `foreseer-sdk`
v0.1 and need nothing but the receipt, rule, revealed seed, proof, and root.
The chain half is specified as a TypeScript interface only, with no
implementation and no chain library in v0.1:

```ts
interface ChainReader {
  isTeeRegistered(teeId: Hex): Promise<boolean>;
  getSeedCommit(epochId: bigint): Promise<Hex | null>;
  getMerkleRoot(epochId: bigint): Promise<Hex | null>;
}
```

## §9 Reference constants and golden vectors

### §9.1 Reference test key

The ReferenceTee default identity key (test-only, publicly known, never for
production):

```
privateKey = 0x0000000000000000000000000000000000000000000000000000000000000001
address    = 0x7e5f4552091a69125d5dfcb7b8c2659029395bdf
```

### §9.2 Reference codeVersion

```
codeVersion = SHA256(UTF8("foreseer-reference-tee-v0.1"))
            = 0x6094010faf9dafee4b20d2dd6d5bc2ffcbb480ee3d8f3226c5625d5076f7a28b
```

### §9.3 Vector fixtures

Unless a vector states otherwise:

- `chainId = 114` (Coston2).
- `serverSeed = 0x000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`
  (bytes 0x00 through 0x1f), so
  `seedCommit = 0x630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd`.
- Timestamps start at 1755000000 and increase by 1 per receipt.
- Signing key: §9.1.

### §9.4 Vector files

`spec/vectors/` holds language-neutral JSON, regenerated deterministically
(byte-identical output every run) by `packages/ts/scripts/gen-vectors.ts`
and copied verbatim into `packages/ts/test/vectors/` by `sync-vectors.ts`:

- `derive.json`: §2 blocks for several `(clientSeed, nonce)` inputs.
- `ints.json`: §3 draw sequences, including at least one case that hits the
  rejection path (verified via consumed byte counts).
- `rules.json`: valid rules with canonical bytes and hashes, plus invalid
  rules with the §4.2 reason.
- `receipts.json`: full receipts with structHash, digest, signature, and
  recovered address.
- `merkle.json`: trees of sizes 1, 2, 3, 5, 8, 33 with roots and all proofs.
- `e2e.json`: one full small epoch (open, bets, close) end to end.

A conforming Go implementation MUST reproduce every byte of every vector.
