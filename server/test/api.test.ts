import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { dice, receiptDigest, recoverSigner, toBytes, verifyCommit, verifyMerkleProof } from "@foreseer/sdk";
import { verifyOutcome } from "@foreseer/sdk/verify";
import type { Hex, Receipt } from "@foreseer/sdk";
import { openDb } from "../src/db";
import { Engine } from "../src/engine";
import { createApp } from "../src/app.module";

const ADMIN = "test-admin-key";
const db = openDb(":memory:");
const engine = new Engine({ db, epochSeconds: 3600 });
let app: INestApplication;
let base = "";
let apiKey = "";
const diceRule = dice({ target: 4999, mode: "over" });

function jsonReceipt(r: Record<string, unknown>): Receipt {
    return {
        specVersion: r.specVersion as number,
        codeVersion: r.codeVersion as Hex,
        epochId: BigInt(r.epochId as number),
        betId: BigInt(r.betId as number),
        seedCommit: r.seedCommit as Hex,
        clientSeed: r.clientSeed as string,
        nonce: BigInt(r.nonce as number),
        ruleHash: r.ruleHash as Hex,
        draws: r.draws as number[],
        win: r.win as boolean,
        payoutBp: r.payoutBp as number,
        timestamp: BigInt(r.timestamp as number),
    };
}

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
}

beforeAll(async () => {
    app = await createApp({ db, engine, adminKey: ADMIN });
    await app.listen(0);
    const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address() as AddressInfo;
    base = `http://localhost:${address.port}`;
});

afterAll(async () => {
    await app.close();
    db.close();
});

describe("api", () => {
    it("health reports the tee identity", async () => {
        const res = await call("GET", "/health");
        expect(res.status).toBe(200);
        expect(res.json).toEqual({ ok: true, teeId: engine.teeId, chainId: 114 });
    });

    it("serves public reads with open CORS", async () => {
        const res = await fetch(`${base}/health`, { headers: { origin: "http://widget.example" } });
        expect(res.status).toBe(200);
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
        const preflight = await fetch(`${base}/health`, {
            method: "OPTIONS",
            headers: { origin: "http://widget.example", "access-control-request-method": "GET" },
        });
        expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    });

    it("admin auth is required to create operators", async () => {
        expect((await call("POST", "/admin/operators", { name: "acme" })).status).toBe(401);
        expect((await call("POST", "/admin/operators", { name: "acme" }, { "x-admin-key": "wrong" })).status).toBe(401);
        const ok = await call("POST", "/admin/operators", { name: "acme" }, { "x-admin-key": ADMIN });
        expect(ok.status).toBe(201);
        expect(ok.json.apiKey).toMatch(/^fsk_[0-9a-f]{48}$/);
        apiKey = ok.json.apiKey;
        expect((await call("POST", "/admin/operators", { name: "acme" }, { "x-admin-key": ADMIN })).status).toBe(409);
    });

    it("rules require an operator key and validity", async () => {
        expect((await call("POST", "/rules", { rule: diceRule })).status).toBe(401);
        const bad = await call("POST", "/rules", { rule: { v: 1 } }, { "x-api-key": apiKey });
        expect(bad.status).toBe(400);
        const ok = await call("POST", "/rules", { rule: diceRule }, { "x-api-key": apiKey });
        expect(ok.status).toBe(201);
        const fetched = await call("GET", `/rules/${ok.json.ruleHash}`);
        expect(fetched.status).toBe(200);
        expect(fetched.json.rule).toEqual(diceRule);
    });

    it("plays bets whose receipts verify client-side", async () => {
        const ruleHashHex = (await call("POST", "/rules", { rule: diceRule }, { "x-api-key": apiKey })).json.ruleHash;
        expect((await call("POST", "/play", { clientSeed: "alice", ruleHash: ruleHashHex })).status).toBe(401);
        expect(
            (await call("POST", "/play", { clientSeed: "a!", ruleHash: ruleHashHex }, { "x-api-key": apiKey })).status,
        ).toBe(400);
        expect(
            (
                await call(
                    "POST",
                    "/play",
                    { clientSeed: "alice", ruleHash: "0x" + "00".repeat(32) },
                    { "x-api-key": apiKey },
                )
            ).status,
        ).toBe(404);
        const played = await call(
            "POST",
            "/play",
            { clientSeed: "alice", ruleHash: ruleHashHex },
            { "x-api-key": apiKey },
        );
        expect(played.status).toBe(201);
        expect(played.json.betId).toBe(0);
        const receipt = jsonReceipt(played.json.receipt);
        const digest = receiptDigest(receipt, engine.domain);
        expect(recoverSigner(digest, played.json.signature)).toBe(engine.teeId);
        const again = await call(
            "POST",
            "/play",
            { clientSeed: "alice", ruleHash: ruleHashHex },
            { "x-api-key": apiKey },
        );
        expect(again.json.receipt.nonce).toBe(1);
        const conflict = await call(
            "POST",
            "/play",
            { clientSeed: "alice", ruleHash: ruleHashHex, nonce: 0 },
            { "x-api-key": apiKey },
        );
        expect(conflict.status).toBe(409);
    });

    it("keeps the server seed hidden while the epoch is open", async () => {
        const current = await call("GET", "/epochs/current");
        const info = await call("GET", `/epochs/${current.json.epochId}`);
        expect(info.json.serverSeed).toBeNull();
        expect(info.json.seedCommit).toBe(current.json.seedCommit);
    });

    it("close reveals the seed and serves verifying proofs", async () => {
        const epochId = (await call("GET", "/epochs/current")).json.epochId as number;
        const closed = await call("POST", "/admin/close", undefined, { "x-admin-key": ADMIN });
        expect(closed.status).toBe(200);
        expect(closed.json.receiptCount).toBeGreaterThan(0);

        const info = await call("GET", `/epochs/${epochId}`);
        expect(info.json.serverSeed).toMatch(/^0x[0-9a-f]{64}$/);
        expect(verifyCommit(info.json.serverSeed, info.json.seedCommit)).toBe(true);

        const receipts = await call("GET", `/epochs/${epochId}/receipts?clientSeed=alice`);
        expect(receipts.json.receipts.length).toBe(2);
        const first = jsonReceipt(receipts.json.receipts[0].receipt);
        expect(verifyOutcome(first, diceRule, info.json.serverSeed).ok).toBe(true);

        const proof = await call("GET", `/epochs/${epochId}/proof/0`);
        expect(proof.status).toBe(200);
        expect(
            verifyMerkleProof(
                toBytes(proof.json.digest),
                proof.json.proof.map(toBytes),
                toBytes(proof.json.merkleRoot),
            ),
        ).toBe(true);

        const verdict = await call("GET", `/verify/${epochId}/0`);
        expect(verdict.json.allGreen).toBe(true);
        expect(verdict.json.checks).toEqual({ signature: true, commit: true, outcome: true, merkle: true });
    });

    it("rejects bodies over 64 KiB with 413", async () => {
        const res = await call(
            "POST",
            "/play",
            { clientSeed: "alice", ruleHash: "0x00", padding: "x".repeat(70000) },
            { "x-api-key": apiKey },
        );
        expect(res.status).toBe(413);
        expect(res.json).toEqual({ error: "body too large" });
    });

    it("paginates receipts with total, limit, offset", async () => {
        const ruleHashHex = (await call("POST", "/rules", { rule: diceRule }, { "x-api-key": apiKey })).json.ruleHash;
        for (let i = 0; i < 5; i++) {
            await call("POST", "/play", { clientSeed: "carol", ruleHash: ruleHashHex }, { "x-api-key": apiKey });
        }
        const epochId = (await call("GET", "/epochs/current")).json.epochId as number;

        const first = await call("GET", `/epochs/${epochId}/receipts?clientSeed=carol&limit=2`);
        expect(first.status).toBe(200);
        expect(first.json.total).toBe(5);
        expect(first.json.limit).toBe(2);
        expect(first.json.offset).toBe(0);
        expect(first.json.receipts.length).toBe(2);
        expect(first.json.receipts[0].receipt.nonce).toBe(0);

        const second = await call("GET", `/epochs/${epochId}/receipts?clientSeed=carol&limit=2&offset=2`);
        expect(second.json.total).toBe(5);
        expect(second.json.offset).toBe(2);
        expect(second.json.receipts.length).toBe(2);
        expect(second.json.receipts[0].receipt.nonce).toBe(2);

        const tail = await call("GET", `/epochs/${epochId}/receipts?clientSeed=carol&limit=2&offset=4`);
        expect(tail.json.receipts.length).toBe(1);

        const defaults = await call("GET", `/epochs/${epochId}/receipts`);
        expect(defaults.json.limit).toBe(100);
        expect(defaults.json.offset).toBe(0);
        expect(defaults.json.total).toBe(defaults.json.receipts.length);
    });

    it("rejects invalid pagination params", async () => {
        const epochId = (await call("GET", "/epochs/current")).json.epochId as number;
        const badLimit = await call("GET", `/epochs/${epochId}/receipts?limit=0`);
        expect(badLimit.status).toBe(400);
        expect(badLimit.json).toEqual({ error: "limit must be 1..1000" });
        const badOffset = await call("GET", `/epochs/${epochId}/receipts?offset=-1`);
        expect(badOffset.status).toBe(400);
        expect(badOffset.json).toEqual({ error: "offset must be >= 0" });
    });

    it("unknown routes 404", async () => {
        expect((await call("GET", "/nope")).status).toBe(404);
    });
});
