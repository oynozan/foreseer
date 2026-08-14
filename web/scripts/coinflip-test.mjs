// Coinflip core test: rule, preset parity, determinism, flip math, verification.
// Run: packages/ts/node_modules/.bin/tsx web/scripts/coinflip-test.mjs
import { coinflip, ruleHash, validateRule, resolveOutcome, receiptDigest, merkleProof, toBytes } from "foreseer-sdk";
import { ReferenceTee } from "foreseer-sdk/reference";
import { verifyEpoch, verifyMerkleProof } from "foreseer-sdk/verify";
import {
    COIN_RULE,
    COIN_RULE_HASH,
    HEADS,
    MIN_TURNS,
    TURN_SPREAD,
    faceOf,
    faceUpAt,
    flipTarget,
    payoutBp,
    restAfterFlip,
    turnsFromSignature,
} from "../lib/coinflip.ts";

let failures = 0;
const ok = (m) => console.log("ok   " + m);
const fail = (m) => {
    failures++;
    console.error("FAIL " + m);
};
const eq = (got, want, label) => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a === b) ok(label);
    else fail(`${label}: got ${a} want ${b}`);
};

// 1. rule validity, pinned hash, parity with the shipped preset
validateRule(COIN_RULE);
ok("rule validates");
eq(ruleHash(COIN_RULE), COIN_RULE_HASH, "rule hash matches the pinned literal");
eq(COIN_RULE, coinflip(), "rule is byte identical to the sdk coinflip preset");
eq(COIN_RULE.payout_bp, 19800, "coin rule pays 19800 bp");
eq(payoutBp(1, 2), 19800, "payoutBp(1, 2)");

// 2. determinism across two independent engines
const SEED = "0x" + "33".repeat(32);
const CLIENT = "demo_seed";
const FLIPS = 10;

function playAll() {
    const tee = new ReferenceTee({ serverSeed: SEED, now: () => 1700000000n });
    const epoch = tee.openEpoch();
    const signed = [];
    for (let i = 0; i < FLIPS; i++) signed.push(tee.play({ clientSeed: CLIENT, rule: COIN_RULE }));
    return { tee, epoch, signed };
}

const runA = playAll();
const runB = playAll();
const drawsA = runA.signed.map((s) => s.receipt.draws[0]);
eq(
    drawsA,
    runB.signed.map((s) => s.receipt.draws[0]),
    "two independent engines produce identical draws",
);
if (new Set(drawsA).size === 2) ok("both faces appear across ten flips");
else fail("every flip produced the same face: " + drawsA.join(","));

let recomputeOk = true;
for (let i = 0; i < FLIPS; i++) {
    const out = resolveOutcome(COIN_RULE, toBytes(SEED), CLIENT, BigInt(i));
    if (out.draws[0] !== drawsA[i] || out.win !== runA.signed[i].receipt.win) recomputeOk = false;
}
if (recomputeOk) ok("resolveOutcome agrees with every played receipt");
else fail("resolveOutcome disagreed with a receipt");

// 3. draws stay in the two face domain and win follows the rule
let domainOk = true;
for (const s of runA.signed) {
    const draw = s.receipt.draws[0];
    if (draw !== 0 && draw !== 1) domainOk = false;
    if (s.receipt.win !== (draw === HEADS)) domainOk = false;
    if (s.receipt.payoutBp !== (draw === HEADS ? 19800 : 0)) domainOk = false;
}
if (domainOk) ok("every receipt is a single bit with matching win and payout");
else fail("a receipt left the two face domain");
eq([faceOf(1), faceOf(0)], ["heads", "tails"], "draw 1 is heads, draw 0 is tails");

// 4. flip landing over every start, draw and signature byte
let landingOk = true;
let minTravel = Infinity;
let maxTravel = 0;
for (const fromDeg of [0, 180, 360, 540]) {
    for (const draw of [0, 1]) {
        for (let byte = 0; byte < 256; byte++) {
            const signature = "0x" + byte.toString(16).padStart(2, "0");
            const t = flipTarget({ fromDeg, draw, signature });
            const travel = t.targetDeg - fromDeg;
            if (faceUpAt(t.targetDeg) !== faceOf(draw)) landingOk = false;
            if (t.targetDeg % 180 !== 0) landingOk = false;
            if (travel <= 0) landingOk = false;
            if (t.turns < MIN_TURNS || t.turns >= MIN_TURNS + TURN_SPREAD) landingOk = false;
            const rest = restAfterFlip(t.targetDeg);
            if (rest !== 0 && rest !== 180) landingOk = false;
            if (faceUpAt(rest) !== faceUpAt(t.targetDeg)) landingOk = false;
            minTravel = Math.min(minTravel, travel);
            maxTravel = Math.max(maxTravel, travel);
        }
    }
}
if (landingOk) ok(`flip always lands the drawn face flat, travel ${minTravel} to ${maxTravel} degrees`);
else fail("flip landing math broke");

let turnsOk = true;
for (let byte = 0; byte < 256; byte++) {
    const sig = "0x" + byte.toString(16).padStart(2, "0");
    if (turnsFromSignature(sig) !== turnsFromSignature(sig)) turnsOk = false;
}
if (turnsOk) ok("turn count is pure and bounded");
else fail("turn count impure");

// 5. epoch verification, then a negative control
const close = runA.tee.closeEpoch();
const receipts = runA.signed;
const epochResult = verifyEpoch({
    receipts,
    rules: [COIN_RULE],
    domain: runA.tee.domain,
    serverSeed: close.serverSeed,
    seedCommit: runA.epoch.seedCommit,
    merkleRoot: close.merkleRoot,
    closeSignature: close.closeSignature,
    expectedTeeId: runA.tee.teeId,
});
if (epochResult.ok) ok(`verifyEpoch green over ${receipts.length} receipts`);
else fail("verifyEpoch failed: " + JSON.stringify(epochResult.failures ?? epochResult));

const leaves = receipts.map((s) => receiptDigest(s.receipt, runA.tee.domain));
let proofsOk = true;
let depth = 0;
for (let i = 0; i < leaves.length; i++) {
    const proof = merkleProof(leaves, i);
    depth = proof.length;
    if (!verifyMerkleProof(leaves[i], proof, toBytes(close.merkleRoot))) proofsOk = false;
}
if (proofsOk && depth > 0) ok(`every receipt proves into the root, proof depth ${depth}`);
else fail("a merkle proof failed");

const negative = verifyEpoch({
    receipts,
    rules: [COIN_RULE],
    domain: runA.tee.domain,
    serverSeed: "0x44" + "33".repeat(31),
    seedCommit: runA.epoch.seedCommit,
    merkleRoot: close.merkleRoot,
    closeSignature: close.closeSignature,
    expectedTeeId: runA.tee.teeId,
});
if (!negative.ok) ok("negative control: a flipped seed byte fails verification");
else fail("negative control passed, verification is not actually checking");

if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
}
console.log("coinflip core green");
