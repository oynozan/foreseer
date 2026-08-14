import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const envPath = fileURLToPath(new URL(".env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

export const cfg = {
    api: process.env.FORESEER_API ?? "http://localhost:8787",
    adminKey: process.env.FORESEER_ADMIN_KEY ?? "dev-admin-key",
    operatorKey: process.env.DEMO_OPERATOR_KEY,
    walletKey: process.env.DEMO_WALLET_KEY,
    rpc: process.env.CHAIN_RPC ?? "https://coston2-api.flare.network/ext/C/rpc",
    verifyUrl: process.env.DEMO_VERIFY_URL ?? "http://localhost:3000/verify",
    funderKey: process.env.FUNDER_KEY,
    port: Number(process.env.DEMO_PORT ?? 8788),
};

export async function apiRaw(method, path, body, headers = {}) {
    const res = await fetch(`${cfg.api}${path}`, {
        method,
        headers: { "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
}

export async function api(method, path, body, headers = {}) {
    const res = await apiRaw(method, path, body, headers);
    if (res.status >= 400) {
        throw new Error(`${method} ${path} failed: ${res.status} ${res.json?.error ?? ""}`);
    }
    return res.json;
}

export function operatorHeaders() {
    if (cfg.operatorKey === undefined) throw new Error("DEMO_OPERATOR_KEY missing, run: node setup.mjs");
    return { "x-api-key": cfg.operatorKey };
}
