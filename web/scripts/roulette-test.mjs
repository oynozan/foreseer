// Roulette core test: rule, determinism, landing math, epoch verification.
// Run: packages/ts/node_modules/.bin/tsx web/scripts/roulette-test.mjs
import { ruleHash, validateRule, resolveOutcome, receiptDigest, merkleProof, toBytes } from "foreseer-sdk";
import { ReferenceTee } from "foreseer-sdk/reference";
import { verifyEpoch, verifyMerkleProof } from "foreseer-sdk/verify";
import {
    GEO,
    ORANGE_BAND_RULE,
    ORANGE_BAND_RULE_HASH,
    POCKET_COUNT,
    SLOT,
    cellUnderMarker,
    jitterFromSignature,
    payoutBp,
    pocketAtCell,
    restAfterSettle,
    spinTarget,
    toneOf,
    translateXFor,
} from "../lib/roulette.ts";

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

// 1. rule validity and pinned hash
validateRule(ORANGE_BAND_RULE);
ok("rule validates");
eq(ruleHash(ORANGE_BAND_RULE), ORANGE_BAND_RULE_HASH, "rule hash matches the pinned literal");

// 2. payout math
eq(ORANGE_BAND_RULE.payout_bp, 21214, "orange band pays 21214 bp");
eq(payoutBp(7, 15), 21214, "payoutBp(7, 15)");
eq(payoutBp(1, 15), 148500, "payoutBp(1, 15)");

// 3. determinism across two independent engines
const SEED = "0x" + "11".repeat(32);
const CLIENT = "demo_seed";
const SPINS = 10;

function playAll() {
    const tee = new ReferenceTee({ serverSeed: SEED, now: () => 1700000000n });
    const epoch = tee.openEpoch();
    const signed = [];
    for (let i = 0; i < SPINS; i++) signed.push(tee.play({ clientSeed: CLIENT, rule: ORANGE_BAND_RULE }));
    return { tee, epoch, signed };
}

const runA = playAll();
const runB = playAll();
const drawsA = runA.signed.map((s) => s.receipt.draws[0]);
const drawsB = runB.signed.map((s) => s.receipt.draws[0]);
eq(drawsA, drawsB, "two independent engines produce identical draws");
eq(
    runA.signed.map((s) => Number(s.receipt.nonce)),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    "nonce auto increments per clientSeed",
);

// the recomputation path a verifier uses must agree with the play path
let recomputeOk = true;
for (let i = 0; i < SPINS; i++) {
    const out = resolveOutcome(ORANGE_BAND_RULE, toBytes(SEED), CLIENT, BigInt(i));
    if (out.draws[0] !== drawsA[i] || out.win !== runA.signed[i].receipt.win) recomputeOk = false;
}
if (recomputeOk) ok("resolveOutcome agrees with every played receipt");
else fail("resolveOutcome disagreed with a receipt");

// 4. win and payout agreement with the band
let bandOk = true;
for (const s of runA.signed) {
    const pocket = s.receipt.draws[0];
    const expectWin = pocket >= 1 && pocket <= 7;
    const expectPay = expectWin ? 21214 : 0;
    if (s.receipt.win !== expectWin || s.receipt.payoutBp !== expectPay) bandOk = false;
    if (pocket < 0 || pocket >= POCKET_COUNT) bandOk = false;
}
if (bandOk) ok("win and payout match the orange band for every receipt");
else fail("a receipt disagreed with the band");

// tones: exactly 1 green, 7 primary, 7 dark
const tones = { green: 0, primary: 0, dark: 0 };
for (let p = 0; p < POCKET_COUNT; p++) tones[toneOf(p)]++;
eq(tones, { green: 1, primary: 7, dark: 7 }, "wheel is 1 green, 7 primary, 7 dark");

// no two neighbours share a tone anywhere in the infinite repeat
let neighbourOk = true;
for (let i = 0; i < POCKET_COUNT; i++) {
    if (toneOf(pocketAtCell(i)) === toneOf(pocketAtCell(i + 1))) neighbourOk = false;
}
if (neighbourOk) ok("no two adjacent cells share a tone across the wrap");
else fail("adjacent cells share a tone");

// 5. landing round trip over every pocket, jitter byte, start cell, pitch
let roundTripOk = true;
let worstDrift = 0;
const pitches = [
    { pitch: GEO.pitch, cellWidth: GEO.cell },
    { pitch: GEO.pitchNarrow, cellWidth: GEO.cellNarrow },
];
for (const geo of pitches) {
    for (let pocket = 0; pocket < POCKET_COUNT; pocket++) {
        for (let byte = 0; byte < 256; byte++) {
            const signature = "0x" + byte.toString(16).padStart(2, "0");
            for (let startCell = GEO.baseCell; startCell < GEO.baseCell + POCKET_COUNT; startCell++) {
                const t = spinTarget({ startCell, pocket, signature });
                const x = translateXFor({ cell: t.targetCell, jitter: t.jitter, ...geo });
                const back = cellUnderMarker({ translateX: x, ...geo });
                if (Math.round(back) !== t.targetCell) roundTripOk = false;
                if (pocketAtCell(t.targetCell) !== pocket) roundTripOk = false;
                worstDrift = Math.max(worstDrift, Math.abs(back - t.targetCell));
            }
        }
    }
}
if (roundTripOk) ok(`landing round trip holds, worst drift ${worstDrift.toFixed(4)} cells`);
else fail("landing round trip broke");
if (worstDrift <= GEO.maxJitter + 1e-9) ok("drift stays inside the jitter bound");
else fail(`drift ${worstDrift} exceeds ${GEO.maxJitter}`);

// travel is always a long spin, never a jump
let travelOk = true;
for (let pocket = 0; pocket < POCKET_COUNT; pocket++) {
    const t = spinTarget({ startCell: GEO.initialCell, pocket, signature: "0x00" });
    if (t.travelCells < GEO.loops * POCKET_COUNT || t.travelCells > GEO.loops * POCKET_COUNT + POCKET_COUNT - 1) {
        travelOk = false;
    }
}
if (travelOk) ok("every spin travels 120 to 134 cells");
else fail("travel distance out of range");

// 6. periodicity and the modulo reset
let periodOk = true;
for (let i = 0; i < GEO.cellCount - POCKET_COUNT; i++) {
    if (pocketAtCell(i) !== pocketAtCell(i + POCKET_COUNT)) periodOk = false;
}
for (let t = GEO.baseCell; t <= 200; t++) {
    const rest = restAfterSettle(t);
    if (pocketAtCell(rest) !== pocketAtCell(t)) periodOk = false;
    if (rest < GEO.baseCell || rest >= GEO.baseCell + POCKET_COUNT) periodOk = false;
}
if (periodOk) ok("pattern has period 15 and the settle reset is pixel equivalent");
else fail("periodicity or reset broke");

// strip is long enough for the widest viewport
const halfCells = Math.ceil(1920 / GEO.pitchNarrow);
const maxTarget = GEO.baseCell + POCKET_COUNT - 1 + GEO.loops * POCKET_COUNT + POCKET_COUNT - 1;
if (GEO.baseCell - halfCells >= 0 && maxTarget + halfCells < GEO.cellCount) {
    ok(`strip has runway, max target ${maxTarget} plus ${halfCells} under ${GEO.cellCount}`);
} else {
    fail(`strip too short: ${maxTarget} + ${halfCells} vs ${GEO.cellCount}`);
}

// 7. jitter purity and bound
let jitterOk = true;
for (let byte = 0; byte < 256; byte++) {
    const sig = "0x" + byte.toString(16).padStart(2, "0");
    const a = jitterFromSignature(sig);
    if (a !== jitterFromSignature(sig)) jitterOk = false;
    if (Math.abs(a) > GEO.maxJitter + 1e-9) jitterOk = false;
}
if (jitterOk) ok("jitter is pure and bounded");
else fail("jitter impure or out of bounds");

// slot table is a true inverse of the order
let slotOk = true;
for (let p = 0; p < POCKET_COUNT; p++) if (pocketAtCell(SLOT[p]) !== p) slotOk = false;
if (slotOk) ok("slot table inverts the wheel order");
else fail("slot table is not an inverse");

// 8. epoch verification, then a negative control
const close = runA.tee.closeEpoch();
const receipts = runA.signed;
const epochResult = verifyEpoch({
    receipts,
    rules: [ORANGE_BAND_RULE],
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

const forgedSeed = "0x22" + "11".repeat(31);
const negative = verifyEpoch({
    receipts,
    rules: [ORANGE_BAND_RULE],
    domain: runA.tee.domain,
    serverSeed: forgedSeed,
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
console.log("roulette core green");
