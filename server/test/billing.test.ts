import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { dice } from "foreseer.ts";
import { openDb } from "../src/db";
import { Engine } from "../src/engine";
import { createApp } from "../src/app.module";

const ADMIN = "test-admin-key";
const PRICE = "1000000000000000000";
const db = openDb(":memory:");
let now = 1000;
const engine = new Engine({ db, epochSeconds: 3600, now: () => now });
let app: INestApplication;
let base = "";
let keyA = "";
let keyB = "";
const diceRule = dice({ target: 4999, mode: "over" });
const playsA: { win: boolean; payoutBp: number }[] = [];
const playsB: { win: boolean; payoutBp: number }[] = [];

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
}

async function play(key: string, hash: string, seed: string, bucket: { win: boolean; payoutBp: number }[]) {
    const res = await call("POST", "/play", { clientSeed: seed, ruleHash: hash }, { "x-api-key": key });
    expect(res.status).toBe(201);
    bucket.push({ win: res.json.receipt.win, payoutBp: res.json.receipt.payoutBp });
}

beforeAll(async () => {
    app = await createApp({ db, engine, adminKey: ADMIN, pricePerPlayWei: PRICE });
    await app.listen(0);
    const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address() as AddressInfo;
    base = `http://localhost:${address.port}`;

    keyA = (await call("POST", "/admin/operators", { name: "op-a" }, { "x-admin-key": ADMIN })).json.apiKey;
    keyB = (await call("POST", "/admin/operators", { name: "op-b" }, { "x-admin-key": ADMIN })).json.apiKey;
    const hash = (await call("POST", "/rules", { rule: diceRule }, { "x-api-key": keyA })).json.ruleHash as string;
    now = 1000;
    await play(keyA, hash, "alice", playsA);
    now = 2000;
    await play(keyA, hash, "alice", playsA);
    now = 5000;
    await play(keyB, hash, "bob", playsB);
});

afterAll(async () => {
    await app.close();
    db.close();
});

const sum = (rows: { payoutBp: number }[]) => rows.reduce((acc, row) => acc + row.payoutBp, 0);
const wins = (rows: { win: boolean }[]) => rows.filter((row) => row.win).length;

describe("billing report", () => {
    it("requires the admin key", async () => {
        expect((await call("GET", "/admin/billing")).status).toBe(401);
        expect((await call("GET", "/admin/billing", undefined, { "x-admin-key": "wrong" })).status).toBe(401);
    });

    it("rejects garbage range params", async () => {
        const bad = await call("GET", "/admin/billing?from=abc", undefined, { "x-admin-key": ADMIN });
        expect(bad.status).toBe(400);
        expect(bad.json).toEqual({ error: "from must be >= 0" });
        expect((await call("GET", "/admin/billing?from=-5", undefined, { "x-admin-key": ADMIN })).status).toBe(400);
        expect((await call("GET", "/admin/billing?to=1.5", undefined, { "x-admin-key": ADMIN })).status).toBe(400);
    });

    it("defaults to the full range and bills per play in BigInt wei", async () => {
        const res = await call("GET", "/admin/billing", undefined, { "x-admin-key": ADMIN });
        expect(res.status).toBe(200);
        expect(res.json.from).toBe(0);
        expect(res.json.to).toBe(5000);
        expect(res.json.pricePerPlayWei).toBe(PRICE);
        expect(res.json.operators).toEqual([
            {
                operatorId: 1,
                name: "op-a",
                plays: 2,
                wins: wins(playsA),
                payoutBpSum: sum(playsA),
                amountDueWei: "2000000000000000000",
            },
            {
                operatorId: 2,
                name: "op-b",
                plays: 1,
                wins: wins(playsB),
                payoutBpSum: sum(playsB),
                amountDueWei: "1000000000000000000",
            },
        ]);
    });

    it("filters by range and omits operators with zero plays", async () => {
        const res = await call("GET", "/admin/billing?from=1500&to=4000", undefined, { "x-admin-key": ADMIN });
        expect(res.status).toBe(200);
        expect(res.json.from).toBe(1500);
        expect(res.json.to).toBe(4000);
        expect(res.json.operators.length).toBe(1);
        expect(res.json.operators[0].operatorId).toBe(1);
        expect(res.json.operators[0].plays).toBe(1);
        expect(res.json.operators[0].amountDueWei).toBe("1000000000000000000");
    });
});
