import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { dice } from "foreseer-sdk";
import { openDb } from "../src/db";
import { Engine } from "../src/engine";
import { createApp } from "../src/app.module";

const ADMIN = "test-admin-key";
const db = openDb(":memory:");
let now = 10000;
const engine = new Engine({ db, epochSeconds: 3600, now: () => now });
let app: INestApplication;
let base = "";
const diceRule = dice({ target: 4999, mode: "over" });

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

describe("metrics", () => {
    it("reports the full shape with zeroed counters before traffic", async () => {
        const res = await call("GET", "/metrics");
        expect(res.status).toBe(200);
        expect(res.json).toEqual({
            uptimeSeconds: expect.any(Number),
            epochsTotal: 0,
            epochsOpen: 0,
            receiptsTotal: 0,
            operatorsTotal: 0,
            merkleCacheHits: 0,
            playsLastHour: 0,
        });
        expect(res.json.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it("moves counters after a play", async () => {
        const apiKey = (await call("POST", "/admin/operators", { name: "acme" }, { "x-admin-key": ADMIN })).json
            .apiKey as string;
        const hash = (await call("POST", "/rules", { rule: diceRule }, { "x-api-key": apiKey })).json
            .ruleHash as string;
        const played = await call("POST", "/play", { clientSeed: "alice", ruleHash: hash }, { "x-api-key": apiKey });
        expect(played.status).toBe(201);

        const res = await call("GET", "/metrics");
        expect(res.json).toMatchObject({
            epochsTotal: 1,
            epochsOpen: 1,
            receiptsTotal: 1,
            operatorsTotal: 1,
            playsLastHour: 1,
        });
    });

    it("drops playsLastHour as the injected clock advances", async () => {
        now += 4000;
        const res = await call("GET", "/metrics");
        expect(res.json.receiptsTotal).toBe(1);
        expect(res.json.playsLastHour).toBe(0);
    });

    it("counts merkle cache hits after repeat proofs", async () => {
        expect((await call("POST", "/admin/close", undefined, { "x-admin-key": ADMIN })).status).toBe(200);
        expect((await call("GET", "/metrics")).json.epochsOpen).toBe(0);
        await call("GET", "/epochs/1/proof/0");
        const before = (await call("GET", "/metrics")).json.merkleCacheHits as number;
        await call("GET", "/epochs/1/proof/0");
        const after = (await call("GET", "/metrics")).json.merkleCacheHits as number;
        expect(after).toBeGreaterThan(before);
    });
});
