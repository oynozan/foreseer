import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { addressOfPrivateKey, dice, signDigest, toBytes } from "foreseer-sdk";
import { openDb } from "../src/db";
import { Engine } from "../src/engine";
import { createApp } from "../src/app.module";
import { personalDigest, WalletSessions } from "../src/wallet";

const ADMIN = "test-admin-key";
const OWNER_KEY = toBytes("0x0000000000000000000000000000000000000000000000000000000000000004");
const OWNER = addressOfPrivateKey(OWNER_KEY);
const db = openDb(":memory:");
const engine = new Engine({ db, epochSeconds: 3600 });
let app: INestApplication;
let base = "";
let key = "";
let ruleHash = "";

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as any };
}

beforeAll(async () => {
    app = await createApp({ db, engine, adminKey: ADMIN, readLimit: 8, readWindowSeconds: 3600 });
    await app.listen(0);
    base = `http://localhost:${((app.getHttpServer() as any).address() as AddressInfo).port}`;
    const made = await call("POST", "/admin/operators", { name: "op", ownerWallet: OWNER }, { "x-admin-key": ADMIN });
    key = made.json.apiKey;
    ruleHash = (await call("POST", "/rules", { rule: dice({ target: 4999, mode: "over" }) }, { "x-api-key": key })).json
        .ruleHash;
});

afterAll(async () => {
    await app.close();
    db.close();
});

describe("operator suspension", () => {
    it("suspends and restores an operator", async () => {
        expect((await call("POST", "/play", { clientSeed: "a", ruleHash }, { "x-api-key": key })).status).toBe(201);

        const off = await call("POST", "/admin/operators/1/active", { active: false }, { "x-admin-key": ADMIN });
        expect(off.status).toBe(200);
        const blocked = await call("POST", "/play", { clientSeed: "a", ruleHash }, { "x-api-key": key });
        expect(blocked.status).toBe(403);
        expect(blocked.json).toEqual({ error: "operator suspended" });

        await call("POST", "/admin/operators/1/active", { active: true }, { "x-admin-key": ADMIN });
        expect((await call("POST", "/play", { clientSeed: "a", ruleHash }, { "x-api-key": key })).status).toBe(201);
    });

    it("validates the request", async () => {
        expect((await call("POST", "/admin/operators/1/active", {}, { "x-admin-key": ADMIN })).status).toBe(400);
        expect((await call("POST", "/admin/operators/999/active", { active: false }, { "x-admin-key": ADMIN })).status).toBe(
            404,
        );
        expect((await call("POST", "/admin/operators/1/active", { active: false })).status).toBe(401);
    });
});

describe("public reads are rate limited", () => {
    it("429s an unauthenticated flood but never a credentialed caller", async () => {
        const codes: number[] = [];
        for (let i = 0; i < 20; i++) codes.push((await call("GET", "/epochs/current")).status);
        expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);

        // an operator key must sail past the ip limit that just tripped
        const keyed: number[] = [];
        for (let i = 0; i < 20; i++) {
            keyed.push((await call("GET", "/epochs/current", undefined, { "x-api-key": key })).status);
        }
        expect(keyed.every((c) => c === 200)).toBe(true);
        expect((await call("GET", "/metrics", undefined, { "x-admin-key": ADMIN })).status).toBe(200);
    });
});

describe("sessions survive a restart", () => {
    it("reloads live tokens from the database", () => {
        const sessions = new WalletSessions(undefined, undefined, undefined, db);
        const issued = sessions.issueNonce(OWNER);
        const token = sessions.login(OWNER, signDigest(personalDigest(issued.message), OWNER_KEY)).token;
        expect(sessions.walletFor(token)).toBe(OWNER);

        const restarted = new WalletSessions(undefined, undefined, undefined, db);
        expect(restarted.walletFor(token)).toBe(OWNER);
        expect(restarted.walletFor("fst_nonexistent")).toBe(null);
    });
});
