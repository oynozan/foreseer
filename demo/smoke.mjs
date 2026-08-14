import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JsonRpcProvider, Wallet, parseEther } from "ethers";
import { cfg } from "./config.mjs";

const demoDir = fileURLToPath(new URL(".", import.meta.url));
const serverDir = join(demoDir, "..", "server");
const tsxCli = join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
assert.ok(existsSync(tsxCli), "server deps missing, run pnpm install in server/");
assert.ok(cfg.funderKey, "FUNDER_KEY required in demo/.env for the smoke test");

const FORESEER = "http://localhost:8790";
const CASINO = "http://localhost:8791";
const ADMIN = "smoke-admin";
const PRICE = parseEther("0.01");

const provider = new JsonRpcProvider(cfg.rpc);
const funder = new Wallet(cfg.funderKey, provider);
const owner = Wallet.createRandom().connect(provider);
console.log(`treasury ${funder.address}, demo owner wallet ${owner.address}`);

rmSync(join(demoDir, "data"), { recursive: true, force: true });
mkdirSync(join(demoDir, "data"), { recursive: true });

const children = [];
function boot(args, cwd, env) {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
    children.push(child);
    return child;
}
async function waitFor(url) {
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`timeout waiting for ${url}`);
}
async function call(base, method, path, body, headers = {}) {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
}

try {
    boot([tsxCli, "src/main.ts"], serverDir, {
        PORT: "8790",
        FORESEER_DB: join(demoDir, "data", "smoke.db"),
        FORESEER_ADMIN_KEY: ADMIN,
        FORESEER_EPOCH_SECONDS: "3600",
        FORESEER_PRICE_PER_PLAY_WEI: PRICE.toString(),
        FORESEER_CHAIN_RPC: cfg.rpc,
        FORESEER_TREASURY: funder.address,
    });
    await waitFor(`${FORESEER}/health`);

    const created = await call(FORESEER, "POST", "/admin/operators", {
        name: `smoke-${owner.address.slice(2, 10).toLowerCase()}`,
        ownerWallet: owner.address.toLowerCase(),
    }, { "x-admin-key": ADMIN });
    assert.equal(created.status, 201);
    const apiKey = created.json.apiKey;
    console.log("PASS operator provisioned with owner wallet");

    console.log("funding owner wallet with 0.5 (real chain tx)");
    await (await funder.sendTransaction({ to: owner.address, value: parseEther("0.5") })).wait();
    console.log("paying 0.2 to the treasury (real chain tx)");
    const payment = await owner.sendTransaction({ to: funder.address, value: parseEther("0.2") });
    await payment.wait();
    const topup = await call(FORESEER, "POST", "/billing/topup", { txHash: payment.hash }, { "x-api-key": apiKey });
    assert.equal(topup.status, 200);
    assert.equal(topup.json.balanceWei, parseEther("0.2").toString());
    console.log("PASS real treasury payment credited");

    boot([join(demoDir, "server.mjs")], demoDir, {
        FORESEER_API: FORESEER,
        DEMO_OPERATOR_KEY: apiKey,
        DEMO_PORT: "8791",
    });
    await waitFor(`${CASINO}/api/state`);

    const bets = [{ type: "red" }, { type: "black" }, { type: "straight", number: 17 }];
    const spins = [];
    for (const bet of bets) {
        const spun = await call(CASINO, "POST", "/api/spin", { clientSeed: "smoke_player", bet });
        assert.equal(spun.status, 200, JSON.stringify(spun.json));
        assert.ok(spun.json.number >= 0 && spun.json.number <= 36);
        assert.ok(typeof spun.json.signature === "string");
        spins.push(spun.json);
        console.log(`PASS spin ${bet.type}: rolled ${spun.json.number} ${spun.json.color}, win ${spun.json.win}`);
    }

    const closed = await call(FORESEER, "POST", "/admin/close", undefined, { "x-admin-key": ADMIN });
    assert.equal(closed.status, 200);
    for (const spun of spins) {
        const verified = await call(CASINO, "GET", `/api/verify/${spun.epochId}/${spun.betId}`);
        assert.equal(verified.json.allGreen, true, JSON.stringify(verified.json));
    }
    console.log("PASS all spins verify allGreen after epoch close");

    const wallet = owner.address.toLowerCase();
    const nonce = await call(FORESEER, "GET", `/auth/nonce?wallet=${wallet}`);
    const signature = await owner.signMessage(nonce.json.message);
    const login = await call(FORESEER, "POST", "/auth/login", { wallet, signature });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const me = await call(FORESEER, "GET", "/billing/me", undefined, { "x-owner-token": login.json.token });
    assert.equal(me.status, 200);
    const op = me.json.operators[0];
    assert.equal(op.plays, 3);
    assert.equal(op.deposits.length, 1);
    assert.equal(op.balanceWei, parseEther("0.17").toString());
    console.log(`PASS wallet dashboard: ${op.plays} plays, balance ${op.balanceWei} wei`);
    console.log("SMOKE PASS");
} finally {
    for (const child of children) child.kill();
}
