import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { dice } from "foreseer.ts";
import { openDb } from "../src/db";
import { Engine } from "../src/engine";
import { createApp } from "../src/app.module";

const ADMIN = "test-admin-key";
const db = openDb(":memory:");
const engine = new Engine({ db, epochSeconds: 3600 });
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
    app = await createApp({ db, engine, adminKey: ADMIN, playLimit: 3, playWindowSeconds: 60 });
    await app.listen(0);
    const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address() as AddressInfo;
    base = `http://localhost:${address.port}`;
});

afterAll(async () => {
    await app.close();
    db.close();
});

describe("play rate limit", () => {
    it("blocks the 4th play in a window, other operators unaffected", async () => {
        const a = await call("POST", "/admin/operators", { name: "op-a" }, { "x-admin-key": ADMIN });
        const b = await call("POST", "/admin/operators", { name: "op-b" }, { "x-admin-key": ADMIN });
        const keyA = a.json.apiKey as string;
        const keyB = b.json.apiKey as string;
        const hash = (await call("POST", "/rules", { rule: diceRule }, { "x-api-key": keyA })).json.ruleHash as string;

        for (let i = 0; i < 3; i++) {
            const ok = await call("POST", "/play", { clientSeed: "alice", ruleHash: hash }, { "x-api-key": keyA });
            expect(ok.status).toBe(201);
        }
        const blocked = await call("POST", "/play", { clientSeed: "alice", ruleHash: hash }, { "x-api-key": keyA });
        expect(blocked.status).toBe(429);
        expect(blocked.json).toEqual({ error: "rate limit exceeded, retry later" });

        const other = await call("POST", "/play", { clientSeed: "bob", ruleHash: hash }, { "x-api-key": keyB });
        expect(other.status).toBe(201);
    });
});
