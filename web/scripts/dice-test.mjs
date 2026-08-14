// Dice core test: preset parity, determinism, track math, verification.
// Run: packages/ts/node_modules/.bin/tsx web/scripts/dice-test.mjs
import { dice, ruleHash, validateRule, resolveOutcome, receiptDigest, merkleProof, toBytes } from "foreseer-sdk";
import { ReferenceTee } from "foreseer-sdk/reference";
import { verifyEpoch, verifyMerkleProof } from "foreseer-sdk/verify";
import {
    DEFAULT_MODE,
    DEFAULT_TARGET,
    MAX_DRAW,
    MAX_TARGET,
    MIN_TARGET,
    OUTCOMES,
    THUMB_PX,
    clampTarget,
    diceRule,
    isHit,
    offsetPx,
    payoutBp,
    rollFraction,
    rollLabel,
    targetFraction,
    trackOffset,
    zoneGradient,
    targetUnits,
    winCount,
} from "../lib/dice.ts";

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

// 1. every selectable rule matches the shipped preset exactly
let parityOk = true;
let validateOk = true;
for (let p = MIN_TARGET; p <= MAX_TARGET; p++) {
    for (const mode of ["under", "over"]) {
        const mine = diceRule(p, mode);
        const theirs = dice({ target: targetUnits(p), mode });
        if (JSON.stringify(mine) !== JSON.stringify(theirs)) parityOk = false;
        try {
            validateRule(mine);
        } catch {
            validateOk = false;
        }
    }
}
if (parityOk) ok(`all ${MAX_TARGET * 2} selectable rules equal the sdk dice preset`);
else fail("a dice rule drifted from the sdk preset");
if (validateOk) ok("every selectable rule validates");
else fail("a dice rule failed validation");

eq(
    ruleHash(diceRule(DEFAULT_TARGET, DEFAULT_MODE)),
    "0x7939b82e6b02921475a471681eeacef7b1f41b2457e8e4898f65c113e7016a87",
    "default rule hash is pinned",
);
eq(diceRule(50, "over").payout_bp, payoutBp(4999, OUTCOMES), "over 50 pays the 99 percent rtp");
eq(diceRule(50, "under").payout_bp, payoutBp(5000, OUTCOMES), "under 50 pays the 99 percent rtp");
eq(winCount(1, "under"), 100, "under 1 wins on 100 outcomes");
eq(winCount(99, "over"), 99, "over 99 wins on 99 outcomes");
eq([clampTarget(0), clampTarget(120), clampTarget(50.4)], [1, 99, 50], "target clamps into 1..99");

// 2. determinism across two independent engines
const SEED = "0x" + "55".repeat(32);
const CLIENT = "demo_seed";
const ROLLS = 10;
const RULE = diceRule(DEFAULT_TARGET, DEFAULT_MODE);

function playAll() {
    const tee = new ReferenceTee({ serverSeed: SEED, now: () => 1700000000n });
    const epoch = tee.openEpoch();
    const signed = [];
    for (let i = 0; i < ROLLS; i++) signed.push(tee.play({ clientSeed: CLIENT, rule: RULE }));
    return { tee, epoch, signed };
}

const runA = playAll();
const drawsA = runA.signed.map((s) => s.receipt.draws[0]);
eq(
    drawsA,
    playAll().signed.map((s) => s.receipt.draws[0]),
    "two independent engines produce identical rolls",
);

let recomputeOk = true;
for (let i = 0; i < ROLLS; i++) {
    const out = resolveOutcome(RULE, toBytes(SEED), CLIENT, BigInt(i));
    if (out.draws[0] !== drawsA[i] || out.win !== runA.signed[i].receipt.win) recomputeOk = false;
}
if (recomputeOk) ok("resolveOutcome agrees with every played receipt");
else fail("resolveOutcome disagreed with a receipt");

// 3. the ui verdict must equal the receipt verdict, never approximate it
let hitOk = true;
let domainOk = true;
for (const s of runA.signed) {
    const draw = s.receipt.draws[0];
    if (draw < 0 || draw > MAX_DRAW) domainOk = false;
    if (isHit(draw, DEFAULT_TARGET, DEFAULT_MODE) !== s.receipt.win) hitOk = false;
}
if (domainOk) ok("every roll lands in 0..9999");
else fail("a roll left the outcome domain");
if (hitOk) ok("isHit matches the receipt win flag on every roll");
else fail("isHit disagreed with a receipt");

// exhaustive: the boundary is the place this breaks
let boundaryOk = true;
for (let p = MIN_TARGET; p <= MAX_TARGET; p++) {
    const t = targetUnits(p);
    for (const draw of [t - 1, t, t + 1]) {
        if (isHit(draw, p, "over") !== draw > t) boundaryOk = false;
        if (isHit(draw, p, "under") !== draw < t) boundaryOk = false;
        if (isHit(t, p, "over") || isHit(t, p, "under")) boundaryOk = false;
    }
}
if (boundaryOk) ok("landing exactly on the target never counts as a hit");
else fail("boundary handling is wrong");

// 4. labels and track geometry
eq([rollLabel(0), rollLabel(7), rollLabel(1234), rollLabel(9999)], ["0.00", "0.07", "12.34", "99.99"], "roll labels");
let trackOk = true;
for (const width of [280, 372, 560, 1152]) {
    for (let draw = 0; draw <= MAX_DRAW; draw += 7) {
        const px = offsetPx(rollFraction(draw), width);
        if (px < THUMB_PX / 2 - 1e-9 || px > width - THUMB_PX / 2 + 1e-9) trackOk = false;
        // the pixel side of the threshold must equal the arithmetic side
        for (let p = MIN_TARGET; p <= MAX_TARGET; p += 7) {
            const tPx = offsetPx(targetFraction(p), width);
            if (px > tPx !== isHit(draw, p, "over")) trackOk = false;
            if (px < tPx !== isHit(draw, p, "under")) trackOk = false;
        }
    }
}
if (trackOk) ok("every mark lands on the same side of the threshold as the receipt");
else fail("track geometry puts a mark on the wrong side");
eq(offsetPx(0, 500), THUMB_PX / 2, "fraction 0 sits at the thumb centre");
eq(offsetPx(1, 500), 500 - THUMB_PX / 2, "fraction 1 sits at the far thumb centre");

// the zone edge is drawn from the same offset the marks use
let gradientOk = true;
for (let p = MIN_TARGET; p <= MAX_TARGET; p++) {
    const stop = trackOffset(targetFraction(p));
    for (const mode of ["under", "over"]) {
        const g = zoneGradient(p, mode);
        if (!g.includes(stop)) gradientOk = false;
        const winFirst = g.indexOf("var(--color-primary)") < g.indexOf("var(--color-line)");
        if (winFirst !== (mode === "under")) gradientOk = false;
    }
}
if (gradientOk) ok("the zone edge uses the mark offset and colours the selected side");
else fail("zone gradient drifted from the track offset");

// 5. epoch verification, then a negative control
const close = runA.tee.closeEpoch();
const receipts = runA.signed;
const epochResult = verifyEpoch({
    receipts,
    rules: [RULE],
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
    rules: [RULE],
    domain: runA.tee.domain,
    serverSeed: "0x66" + "55".repeat(31),
    seedCommit: runA.epoch.seedCommit,
    merkleRoot: close.merkleRoot,
    closeSignature: close.closeSignature,
    expectedTeeId: runA.tee.teeId,
});
if (!negative.ok) ok("negative control: a flipped seed byte fails verification");
else fail("negative control passed, verification is not actually checking");

// 6. mixed rules in one epoch, the way the demo plays them
const mixTee = new ReferenceTee({ serverSeed: SEED, now: () => 1700000000n });
const mixEpoch = mixTee.openEpoch();
const mixRules = [diceRule(12, "under"), diceRule(77, "over"), diceRule(50, "under")];
const mixSigned = mixRules.map((rule) => mixTee.play({ clientSeed: CLIENT, rule }));
const mixClose = mixTee.closeEpoch();
const mixed = verifyEpoch({
    receipts: mixSigned,
    rules: mixRules,
    domain: mixTee.domain,
    serverSeed: mixClose.serverSeed,
    seedCommit: mixEpoch.seedCommit,
    merkleRoot: mixClose.merkleRoot,
    closeSignature: mixClose.closeSignature,
    expectedTeeId: mixTee.teeId,
});
if (mixed.ok) ok("an epoch mixing three different dice rules verifies");
else fail("mixed rule epoch failed: " + JSON.stringify(mixed.failures ?? mixed));
let mixHitOk = true;
mixSigned.forEach((s, i) => {
    const p = [12, 77, 50][i];
    const m = ["under", "over", "under"][i];
    if (isHit(s.receipt.draws[0], p, m) !== s.receipt.win) mixHitOk = false;
});
if (mixHitOk) ok("each mixed roll agrees with its own rule");
else fail("a mixed roll disagreed with its rule");

if (failures) {
    console.error(failures + " check(s) failed");
    process.exit(1);
}
console.log("dice core green");
