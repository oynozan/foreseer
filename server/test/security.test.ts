import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dice } from "@foreseer/sdk";
import { openDb } from "../src/db";
import { Engine } from "../src/engine";
import { createApp } from "../src/app.module";
import type { INestApplication } from "@nestjs/common";

const ADMIN = "security-admin-key";
const db = openDb(":memory:");
const engine = new Engine({ db, epochSeconds: 3600 });
let app: INestApplication;
let base = "";
let apiKey = "";
let ruleHashHex = "";
const diceRule = dice({ target: 4999, mode: "over" });

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
}

function tables(): string[] {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[])
        .map((r) => r.name)
        .filter((n) => !n.startsWith("sqlite_"));
}

beforeAll(async () => {
    app = await createApp({ db, engine, adminKey: ADMIN, playLimit: 1000, playWindowSeconds: 60 });
    await app.listen(0);
    base = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;
    const op = await call("POST", "/admin/operators", { name: "sec-op" }, { "x-admin-key": ADMIN });
    apiKey = op.json.apiKey;
    const rule = await call("POST", "/rules", { rule: diceRule }, { "x-api-key": apiKey });
    ruleHashHex = rule.json.ruleHash;
});

afterAll(async () => {
    await app.close();
    db.close();
});

describe("sql injection resistance", () => {
    const PAYLOADS = [
        `'; DROP TABLE receipts; --`,
        `Robert"); DROP TABLE operators;--`,
        `' OR '1'='1`,
        `1; DELETE FROM epochs`,
        `x' UNION SELECT server_seed, 1, 2, 3 FROM epochs --`,
    ];

    it("operator names with SQL metacharacters are stored inertly", async () => {
        const before = tables();
        for (const name of PAYLOADS) {
            const res = await call("POST", "/admin/operators", { name }, { "x-admin-key": ADMIN });
            expect(res.status).toBe(201);
            expect(res.json.name).toBe(name);
        }
        expect(tables()).toEqual(before);
        const listed = db.prepare("SELECT COUNT(*) AS c FROM operators").get() as { c: number };
        expect(listed.c).toBe(1 + PAYLOADS.length);
    });

    it("clientSeed query filters are parameterized, not concatenated", async () => {
        await call("POST", "/play", { clientSeed: "honest", ruleHash: ruleHashHex }, { "x-api-key": apiKey });
        const epochId = (await call("GET", "/epochs/current")).json.epochId;
        for (const payload of PAYLOADS) {
            const res = await call("GET", `/epochs/${epochId}/receipts?clientSeed=${encodeURIComponent(payload)}`);
            expect(res.status).toBe(200);
            expect(res.json.total).toBe(0);
        }
        const honest = await call("GET", `/epochs/${epochId}/receipts?clientSeed=honest`);
        expect(honest.json.total).toBe(1);
        expect(tables().includes("receipts")).toBe(true);
    });

    it("clientSeed in plays is rejected by charset before touching state", async () => {
        for (const payload of PAYLOADS) {
            const res = await call(
                "POST",
                "/play",
                { clientSeed: payload, ruleHash: ruleHashHex },
                { "x-api-key": apiKey },
            );
            expect(res.status).toBe(400);
        }
    });

    it("path and query params reject non-numeric SQL fragments", async () => {
        expect((await call("GET", "/epochs/1%20OR%201=1")).status).toBe(404);
        expect((await call("GET", "/rules/0x27%20UNION%20SELECT")).status).toBe(404);
        const bad = await call("GET", "/admin/billing?from=0%20OR%201=1", undefined, { "x-admin-key": ADMIN });
        expect(bad.status).toBe(400);
    });
});

describe("credential handling", () => {
    it("stores only a sha256 hash of the api key at rest", () => {
        const rows = db.prepare("SELECT api_key_hash FROM operators").all() as { api_key_hash: string }[];
        for (const row of rows) {
            expect(row.api_key_hash).toMatch(/^[0-9a-f]{64}$/);
            expect(row.api_key_hash).not.toContain("fsk_");
        }
        const dump = JSON.stringify(db.prepare("SELECT * FROM operators").all());
        expect(dump).not.toContain(apiKey);
    });

    it("authenticates with the plaintext key against the stored hash", async () => {
        const ok = await call(
            "POST",
            "/play",
            { clientSeed: "hashcheck", ruleHash: ruleHashHex },
            { "x-api-key": apiKey },
        );
        expect(ok.status).toBe(201);
        const bad = await call(
            "POST",
            "/play",
            { clientSeed: "hashcheck", ruleHash: ruleHashHex },
            {
                "x-api-key": "fsk_" + "0".repeat(48),
            },
        );
        expect(bad.status).toBe(401);
    });
});

describe("information disclosure", () => {
    it("unexpected internal errors return a generic 500", async () => {
        const broken = openDb(":memory:");
        const brokenEngine = new Engine({ db: broken, epochSeconds: 3600 });
        const app2 = await createApp({ db: broken, engine: brokenEngine, adminKey: "x" });
        await app2.listen(0);
        const base2 = `http://localhost:${(app2.getHttpServer().address() as AddressInfo).port}`;
        broken.close();
        const res = await fetch(`${base2}/metrics`);
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: "internal error" });
        await app2.close();
    });

    it("does not reveal the server seed of an open epoch", async () => {
        const epochId = (await call("GET", "/epochs/current")).json.epochId;
        const info = await call("GET", `/epochs/${epochId}`);
        expect(info.json.serverSeed).toBeNull();
    });
});
