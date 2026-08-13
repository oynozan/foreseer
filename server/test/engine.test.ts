import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { dice, coinflip, toBytes, verifyCommit } from "foreseer.ts";
import { verifyEpoch } from "foreseer.ts/verify";
import type { Hex, SignedReceipt } from "foreseer.ts";
import { openDb } from "../src/db";
import { Engine, ApiError, rowToReceipt } from "../src/engine";

const diceRule = dice({ target: 4999, mode: "over" });
const flipRule = coinflip();

function collectSigned(engine: Engine, epochId: number): SignedReceipt[] {
    const epoch = engine.epochRow(epochId)!;
    return engine.receiptRows(epochId).map((row) => ({
        receipt: rowToReceipt(row, epoch.seed_commit as Hex),
        signature: row.signature as Hex,
    }));
}

describe("engine", () => {
    it("plays a full epoch that verifies offline", () => {
        const db = openDb(":memory:");
        const engine = new Engine({ db, epochSeconds: 300 });
        const opened = engine.ensureEpoch();
        for (let i = 0; i < 30; i++) {
            engine.play({ operatorId: 1, clientSeed: `p${i % 4}`, rule: i % 2 ? diceRule : flipRule });
        }
        const closed = engine.closeOpen()!;
        expect(closed.receiptCount).toBe(30);
        const epoch = engine.epochRow(opened.epoch_id)!;
        expect(verifyCommit(epoch.server_seed as Hex, epoch.seed_commit as Hex)).toBe(true);
        const res = verifyEpoch({
            receipts: collectSigned(engine, opened.epoch_id),
            rules: [diceRule, flipRule],
            domain: engine.domain,
            serverSeed: epoch.server_seed as Hex,
            merkleRoot: closed.merkleRoot,
            closeSignature: closed.closeSignature,
            expectedTeeId: engine.teeId,
        });
        expect(res.failures).toEqual([]);
        expect(res.ok).toBe(true);
    });

    it("enforces nonce sequencing per clientSeed", () => {
        const db = openDb(":memory:");
        const engine = new Engine({ db });
        engine.play({ operatorId: 1, clientSeed: "alice", rule: diceRule, nonce: 0 });
        expect(() => engine.play({ operatorId: 1, clientSeed: "alice", rule: diceRule, nonce: 0 })).toThrow(ApiError);
        const second = engine.play({ operatorId: 1, clientSeed: "alice", rule: diceRule, nonce: 1 });
        expect(second.signed.receipt.nonce).toBe(1n);
        const other = engine.play({ operatorId: 1, clientSeed: "bob", rule: diceRule });
        expect(other.signed.receipt.nonce).toBe(0n);
        expect(other.betId).toBe(2);
    });

    it("survives a restart mid-epoch (state lives in SQLite)", () => {
        const dir = mkdtempSync(join(tmpdir(), "foreseer-"));
        const path = join(dir, "restart.db");
        const dbA = openDb(path);
        const engineA = new Engine({ db: dbA, epochSeconds: 300 });
        const opened = engineA.ensureEpoch();
        engineA.play({ operatorId: 1, clientSeed: "alice", rule: diceRule });
        engineA.play({ operatorId: 1, clientSeed: "bob", rule: flipRule });
        engineA.play({ operatorId: 1, clientSeed: "alice", rule: diceRule });
        dbA.close();

        const dbB = openDb(path);
        const engineB = new Engine({ db: dbB, epochSeconds: 300 });
        expect(engineB.ensureEpoch().epoch_id).toBe(opened.epoch_id);
        const fourth = engineB.play({ operatorId: 1, clientSeed: "alice", rule: diceRule });
        expect(fourth.betId).toBe(3);
        expect(fourth.signed.receipt.nonce).toBe(2n);
        const closed = engineB.closeOpen()!;
        expect(closed.receiptCount).toBe(4);

        const epoch = engineB.epochRow(opened.epoch_id)!;
        const res = verifyEpoch({
            receipts: collectSigned(engineB, opened.epoch_id),
            rules: [diceRule, flipRule],
            domain: engineB.domain,
            serverSeed: epoch.server_seed as Hex,
            merkleRoot: closed.merkleRoot,
            closeSignature: closed.closeSignature,
            expectedTeeId: engineB.teeId,
        });
        expect(res.failures).toEqual([]);
        dbB.close();
        rmSync(dir, { recursive: true, force: true });
    });

    it("tick closes expired epochs and opens the next", () => {
        const db = openDb(":memory:");
        let clock = 1000;
        const engine = new Engine({ db, epochSeconds: 60, now: () => clock });
        const first = engine.ensureEpoch();
        engine.play({ operatorId: 1, clientSeed: "alice", rule: diceRule });
        expect(engine.tick()).toEqual({ closed: null, open: first.epoch_id });
        clock += 61;
        const t = engine.tick();
        expect(t.closed).toBe(first.epoch_id);
        expect(t.open).toBe(first.epoch_id + 1);
        expect(engine.epochRow(first.epoch_id)!.closed_at).toBe(clock);
        expect(engine.epochRow(first.epoch_id)!.receipt_count).toBe(1);
    });

    it("proofs only exist after close and verify against the root", () => {
        const db = openDb(":memory:");
        const engine = new Engine({ db });
        const opened = engine.ensureEpoch();
        for (let i = 0; i < 5; i++) engine.play({ operatorId: 1, clientSeed: "alice", rule: diceRule });
        expect(() => engine.proofFor(opened.epoch_id, 0)).toThrow("still open");
        engine.closeOpen();
        const proof = engine.proofFor(opened.epoch_id, 3);
        expect(proof.proof.length).toBeGreaterThan(0);
        expect(() => engine.proofFor(opened.epoch_id, 5)).toThrow("unknown betId");
    });

    it("uses a fresh random seed per epoch", () => {
        const db = openDb(":memory:");
        const engine = new Engine({ db, epochSeconds: 60 });
        const a = engine.ensureEpoch();
        engine.closeOpen();
        const b = engine.ensureEpoch();
        expect(b.epoch_id).toBe(a.epoch_id + 1);
        expect(b.seed_commit).not.toBe(a.seed_commit);
        expect(toBytes(b.server_seed as Hex)).toHaveLength(32);
    });
});
