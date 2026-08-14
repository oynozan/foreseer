import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { addressOfPrivateKey, dice, signDigest, toBytes } from "foreseer-sdk";
import { openDb } from "../src/db";
import { Engine } from "../src/engine";
import { createApp } from "../src/app.module";
import { personalDigest, WalletSessions } from "../src/wallet";
import type { ChainGateway, ChainTx } from "../src/wallet";

const ADMIN = "test-admin-key";
const PRICE = "1000000000000000000";
const TREASURY = "0x00000000000000000000000000000000000000fe";
const OWNER_KEY = toBytes("0x0000000000000000000000000000000000000000000000000000000000000002");
const OWNER = addressOfPrivateKey(OWNER_KEY);
const STRANGER_KEY = toBytes("0x0000000000000000000000000000000000000000000000000000000000000003");
const STRANGER = addressOfPrivateKey(STRANGER_KEY);

const txs = new Map<string, ChainTx>();
const chain: ChainGateway = { treasury: TREASURY, fetchTx: async (hash) => txs.get(hash) ?? null };

const db = openDb(":memory:");
let now = 1000;
const engine = new Engine({ db, epochSeconds: 3600, now: () => now });
let app: INestApplication;
let base = "";
let casinoKey = "";
let legacyKey = "";
let ruleHash = "";
let ownerToken = "";

const tx = (hash: string, over: Partial<ChainTx> = {}): string => {
    txs.set(hash, {
        from: OWNER,
        to: TREASURY,
        valueWei: 2000000000000000000n,
        confirmed: true,
        success: true,
        ...over,
    });
    return hash;
};
const hash = (n: number): string => `0x${n.toString(16).padStart(64, "0")}`;

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as any };
}

async function login(wallet: string, key: Uint8Array): Promise<{ status: number; json: any }> {
    const nonce = await call("GET", `/auth/nonce?wallet=${wallet}`);
    expect(nonce.status).toBe(200);
    const signature = signDigest(personalDigest(nonce.json.message), key);
    return call("POST", "/auth/login", { wallet, signature });
}

async function loginReplay(wallet: string, key: Uint8Array) {
    const nonce = await call("GET", `/auth/nonce?wallet=${wallet}`);
    const signature = signDigest(personalDigest(nonce.json.message), key);
    const first = await call("POST", "/auth/login", { wallet, signature });
    const replay = await call("POST", "/auth/login", { wallet, signature });
    return { first, replay };
}

beforeAll(async () => {
    app = await createApp({
        db,
        engine,
        adminKey: ADMIN,
        pricePerPlayWei: PRICE,
        chain,
        sessions: new WalletSessions(),
    });
    await app.listen(0);
    const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address() as AddressInfo;
    base = `http://localhost:${address.port}`;
    const casino = await call("POST", "/admin/operators", { name: "casino", ownerWallet: OWNER }, { "x-admin-key": ADMIN });
    expect(casino.json.ownerWallet).toBe(OWNER);
    casinoKey = casino.json.apiKey;
    legacyKey = (await call("POST", "/admin/operators", { name: "legacy" }, { "x-admin-key": ADMIN })).json.apiKey;
    ruleHash = (await call("POST", "/rules", { rule: dice({ target: 4999, mode: "over" }) }, { "x-api-key": casinoKey }))
        .json.ruleHash;
});

afterAll(async () => {
    await app.close();
    db.close();
});

describe("wallet login", () => {
    it("rejects malformed wallets", async () => {
        expect((await call("GET", "/auth/nonce?wallet=nope")).status).toBe(400);
        expect((await call("GET", "/auth/nonce")).status).toBe(400);
        expect((await call("POST", "/auth/login", { wallet: OWNER })).status).toBe(400);
    });

    it("rejects a login with no pending nonce", async () => {
        const res = await call("POST", "/auth/login", { wallet: STRANGER, signature: `0x${"11".repeat(65)}` });
        expect(res.status).toBe(401);
        expect(res.json).toEqual({ error: "no pending nonce, request a new one" });
    });

    it("rejects a signature from the wrong key", async () => {
        const nonce = await call("GET", `/auth/nonce?wallet=${OWNER}`);
        const signature = signDigest(personalDigest(nonce.json.message), STRANGER_KEY);
        const res = await call("POST", "/auth/login", { wallet: OWNER, signature });
        expect(res.status).toBe(401);
        expect(res.json).toEqual({ error: "signature does not match wallet" });
    });

    it("logs in with a fresh nonce and issues a token", async () => {
        const res = await login(OWNER, OWNER_KEY);
        expect(res.status).toBe(200);
        expect(res.json.wallet).toBe(OWNER);
        expect(res.json.token).toMatch(/^fst_[0-9a-f]{48}$/);
        ownerToken = res.json.token;
    });

    it("rejects a replayed login signature: nonces are single use", async () => {
        const { first, replay } = await loginReplay(OWNER, OWNER_KEY);
        expect(first.status).toBe(200);
        expect(replay.status).toBe(401);
        expect(replay.json).toEqual({ error: "no pending nonce, request a new one" });
    });

    it("expires nonces and tokens by TTL", () => {
        let t = 1000;
        const sessions = new WalletSessions(() => t, 300, 86400);
        const issued = sessions.issueNonce(OWNER);
        t = 1301;
        const stale = signDigest(personalDigest(issued.message), OWNER_KEY);
        expect(() => sessions.login(OWNER, stale)).toThrowError("no pending nonce, request a new one");
        const fresh = sessions.issueNonce(OWNER);
        const session = sessions.login(OWNER, signDigest(personalDigest(fresh.message), OWNER_KEY));
        expect(sessions.walletFor(session.token)).toBe(OWNER);
        t = session.expiresAt + 1;
        expect(sessions.walletFor(session.token)).toBe(null);
    });

    it("normalizes v bytes 0 and 1 from wallet extensions", async () => {
        const nonce = await call("GET", `/auth/nonce?wallet=${OWNER}`);
        const signature = signDigest(personalDigest(nonce.json.message), OWNER_KEY);
        const v = parseInt(signature.slice(-2), 16) - 27;
        const res = await call("POST", "/auth/login", {
            wallet: OWNER,
            signature: signature.slice(0, -2) + v.toString(16).padStart(2, "0"),
        });
        expect(res.status).toBe(200);
    });
});

describe("prepaid balance", () => {
    it("blocks a wallet-tied operator with no balance", async () => {
        const res = await call("POST", "/play", { clientSeed: "alice", ruleHash }, { "x-api-key": casinoKey });
        expect(res.status).toBe(402);
        expect(res.json).toEqual({ error: "insufficient balance, top up via POST /billing/topup" });
    });

    it("still lets key-only operators play on invoice", async () => {
        const res = await call("POST", "/play", { clientSeed: "legacy", ruleHash }, { "x-api-key": legacyKey });
        expect(res.status).toBe(201);
    });

    it("rejects topups that fail chain verification", async () => {
        const topup = (txHash: string) => call("POST", "/billing/topup", { txHash }, { "x-api-key": casinoKey });
        expect((await topup("garbage")).status).toBe(400);
        expect((await topup(hash(99))).status).toBe(404);
        expect((await topup(tx(hash(1), { confirmed: false, success: false }))).status).toBe(409);
        expect((await topup(tx(hash(2), { success: false }))).status).toBe(400);
        expect((await topup(tx(hash(3), { to: STRANGER }))).status).toBe(400);
        expect((await topup(tx(hash(4), { from: STRANGER }))).status).toBe(403);
        expect((await topup(tx(hash(5), { valueWei: 0n }))).status).toBe(400);
    });

    it("rejects topups for operators with no owner wallet", async () => {
        const res = await call("POST", "/billing/topup", { txHash: hash(6) }, { "x-api-key": legacyKey });
        expect(res.status).toBe(400);
        expect(res.json).toEqual({ error: "operator has no owner wallet" });
    });

    it("credits a verified treasury payment exactly once", async () => {
        const txHash = tx(hash(7));
        const res = await call("POST", "/billing/topup", { txHash }, { "x-api-key": casinoKey });
        expect(res.status).toBe(200);
        expect(res.json).toEqual({
            creditedWei: "2000000000000000000",
            depositedWei: "2000000000000000000",
            spentWei: "0",
            balanceWei: "2000000000000000000",
        });
        expect((await call("POST", "/billing/topup", { txHash }, { "x-api-key": casinoKey })).status).toBe(409);
    });

    it("lets the operator play until the balance runs out", async () => {
        now = 2000;
        const play = () => call("POST", "/play", { clientSeed: "alice", ruleHash }, { "x-api-key": casinoKey });
        expect((await play()).status).toBe(201);
        now = 3000;
        expect((await play()).status).toBe(201);
        const broke = await play();
        expect(broke.status).toBe(402);
    });

    it("reports the operator balance", async () => {
        const res = await call("GET", "/billing/balance", undefined, { "x-api-key": casinoKey });
        expect(res.status).toBe(200);
        expect(res.json).toEqual({
            pricePerPlayWei: PRICE,
            plays: 2,
            depositedWei: "2000000000000000000",
            spentWei: "2000000000000000000",
            balanceWei: "0",
        });
    });
});

describe("owner dashboard data", () => {
    it("requires a wallet token", async () => {
        expect((await call("GET", "/billing/me")).status).toBe(401);
        expect((await call("GET", "/billing/me", undefined, { "x-owner-token": "fst_bogus" })).status).toBe(401);
    });

    it("404s for wallets tied to nothing", async () => {
        const res = await login(STRANGER, STRANGER_KEY);
        const me = await call("GET", "/billing/me", undefined, { "x-owner-token": res.json.token });
        expect(me.status).toBe(404);
        expect(me.json).toEqual({ error: "no Foreseer service tied to this wallet" });
    });

    it("returns full service data for the owner wallet", async () => {
        const res = await call("GET", "/billing/me", undefined, { "x-owner-token": ownerToken });
        expect(res.status).toBe(200);
        expect(res.json.wallet).toBe(OWNER);
        expect(res.json.pricePerPlayWei).toBe(PRICE);
        expect(res.json.operators.length).toBe(1);
        const op = res.json.operators[0];
        expect(op.name).toBe("casino");
        expect(op.plays).toBe(2);
        expect(op.epochsUsed).toBe(1);
        expect(op.depositedWei).toBe("2000000000000000000");
        expect(op.spentWei).toBe("2000000000000000000");
        expect(op.balanceWei).toBe("0");
        expect(op.deposits).toEqual([
            { txHash: hash(7), fromWallet: OWNER, amountWei: "2000000000000000000", createdAt: op.deposits[0].createdAt },
        ]);
        expect(op.recent.length).toBe(2);
        expect(op.recent[0].clientSeed).toBe("alice");
        expect(op.recent[0].timestamp).toBe(3000);
    });

    it("never re-prices old plays when the price changes", async () => {
        const db2 = openDb(":memory:");
        const engine2 = new Engine({ db: db2, epochSeconds: 3600, now: () => 100 });
        const boot = async (price: string) => {
            const app2 = await createApp({ db: db2, engine: engine2, adminKey: ADMIN, pricePerPlayWei: price, chain });
            await app2.listen(0);
            const a = (app2.getHttpServer() as { address(): AddressInfo }).address();
            return { app2, base2: `http://localhost:${a.port}` };
        };
        const req = async (base2: string, method: string, path: string, body?: unknown, headers = {}) => {
            const res = await fetch(`${base2}${path}`, {
                method,
                headers: { "content-type": "application/json", ...headers },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
            return { status: res.status, json: (await res.json()) as any };
        };
        const one = await boot("1000000000000000000");
        const made = await req(one.base2, "POST", "/admin/operators", { name: "reprice", ownerWallet: OWNER }, {
            "x-admin-key": ADMIN,
        });
        const key = made.json.apiKey;
        const rule = await req(one.base2, "POST", "/rules", { rule: dice({ target: 4999, mode: "over" }) }, {
            "x-api-key": key,
        });
        await req(one.base2, "POST", "/billing/topup", { txHash: tx(hash(50), { valueWei: 8000000000000000000n }) }, {
            "x-api-key": key,
        });
        await req(one.base2, "POST", "/play", { clientSeed: "p", ruleHash: rule.json.ruleHash }, { "x-api-key": key });
        await req(one.base2, "POST", "/play", { clientSeed: "p", ruleHash: rule.json.ruleHash }, { "x-api-key": key });
        await one.app2.close();
        const three = await boot("3000000000000000000");
        const before = await req(three.base2, "GET", "/billing/balance", undefined, { "x-api-key": key });
        expect(before.json.spentWei).toBe("2000000000000000000");
        expect(before.json.balanceWei).toBe("6000000000000000000");
        await req(three.base2, "POST", "/play", { clientSeed: "p", ruleHash: rule.json.ruleHash }, { "x-api-key": key });
        const after = await req(three.base2, "GET", "/billing/balance", undefined, { "x-api-key": key });
        expect(after.json.spentWei).toBe("5000000000000000000");
        expect(after.json.balanceWei).toBe("3000000000000000000");
        await three.app2.close();
        db2.close();
    });

    it("shows wallets and balances in the admin billing report", async () => {
        const res = await call("GET", "/admin/billing", undefined, { "x-admin-key": ADMIN });
        expect(res.status).toBe(200);
        const casino = res.json.operators.find((o: any) => o.name === "casino");
        expect(casino.ownerWallet).toBe(OWNER);
        expect(casino.plays).toBe(2);
        expect(casino.amountDueWei).toBe("2000000000000000000");
        expect(casino.depositedWei).toBe("2000000000000000000");
        expect(casino.balanceWei).toBe("0");
        const legacy = res.json.operators.find((o: any) => o.name === "legacy");
        expect(legacy.ownerWallet).toBe(null);
        expect(legacy.balanceWei).toBe("-1000000000000000000");
        expect(res.json.totals).toEqual({
            plays: 3,
            amountDueWei: "3000000000000000000",
            depositedWei: "2000000000000000000",
        });
    });
});
