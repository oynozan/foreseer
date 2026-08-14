import { randomBytes } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type Database from "better-sqlite3";
import { recoverSigner } from "foreseer-sdk";
import type { Hex } from "foreseer-sdk";
import { ApiError } from "./engine";

export const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

export function parseWallet(value: unknown): string {
    if (typeof value !== "string" || !WALLET_RE.test(value)) {
        throw new ApiError(400, "wallet must be a 0x address");
    }
    return value.toLowerCase();
}

export function loginMessage(wallet: string, nonce: string): string {
    return `Foreseer wallet login\nWallet: ${wallet}\nNonce: ${nonce}`;
}

// EIP-191 personal_sign digest
export function personalDigest(message: string): Uint8Array {
    const body = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
    const all = new Uint8Array(prefix.length + body.length);
    all.set(prefix);
    all.set(body, prefix.length);
    return keccak_256(all);
}

export function recoverWallet(message: string, signature: string): Hex | null {
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
    const sig = signature.toLowerCase();
    const v = parseInt(sig.slice(-2), 16);
    const normalized = (v === 0 || v === 1 ? sig.slice(0, -2) + (v + 27).toString(16) : sig) as Hex;
    try {
        return recoverSigner(personalDigest(message), normalized);
    } catch {
        return null;
    }
}

interface Entry {
    value: string;
    expires: number;
}

const MAP_CAP = 10000;

// Prune expired, then evict oldest so maps stay bounded
function prune(map: Map<string, Entry>, now: number): void {
    for (const [key, entry] of map) {
        if (entry.expires < now) map.delete(key);
    }
    while (map.size >= MAP_CAP) map.delete(map.keys().next().value!);
}

// Sessions survive a restart when a database is supplied
export class WalletSessions {
    private readonly nonces = new Map<string, Entry>();
    private readonly tokens = new Map<string, Entry>();
    private readonly db: Database.Database | undefined;

    constructor(
        private readonly now: () => number = () => Math.floor(Date.now() / 1000),
        private readonly nonceTtl = 300,
        private readonly tokenTtl = 86400,
        db?: Database.Database,
    ) {
        this.db = db;
        if (db !== undefined) {
            const rows = db.prepare("SELECT token, wallet, expires FROM sessions WHERE expires >= ?").all(this.now()) as {
                token: string;
                wallet: string;
                expires: number;
            }[];
            for (const row of rows) this.tokens.set(row.token, { value: row.wallet, expires: row.expires });
        }
    }

    issueNonce(wallet: string): { nonce: string; message: string } {
        prune(this.nonces, this.now());
        const nonce = randomBytes(16).toString("hex");
        this.nonces.set(wallet, { value: nonce, expires: this.now() + this.nonceTtl });
        return { nonce, message: loginMessage(wallet, nonce) };
    }

    login(wallet: string, signature: string): { token: string; expiresAt: number } {
        const entry = this.nonces.get(wallet);
        if (entry === undefined || entry.expires < this.now()) {
            throw new ApiError(401, "no pending nonce, request a new one");
        }
        const recovered = recoverWallet(loginMessage(wallet, entry.value), signature);
        if (recovered !== wallet) throw new ApiError(401, "signature does not match wallet");
        this.nonces.delete(wallet);
        prune(this.tokens, this.now());
        const token = `fst_${randomBytes(24).toString("hex")}`;
        const expiresAt = this.now() + this.tokenTtl;
        this.tokens.set(token, { value: wallet, expires: expiresAt });
        if (this.db !== undefined) {
            this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(this.now());
            this.db
                .prepare("INSERT OR REPLACE INTO sessions (token, wallet, expires) VALUES (?, ?, ?)")
                .run(token, wallet, expiresAt);
        }
        return { token, expiresAt };
    }

    walletFor(token: string): string | null {
        const entry = this.tokens.get(token);
        if (entry === undefined || entry.expires < this.now()) return null;
        return entry.value;
    }
}

export interface ChainTx {
    from: string;
    to: string | null;
    valueWei: bigint;
    confirmed: boolean;
    success: boolean;
}

export interface ChainGateway {
    treasury: string;
    fetchTx(txHash: string): Promise<ChainTx | null>;
}

export function rpcChain(rpcUrl: string, treasury: string): ChainGateway {
    async function rpc(method: string, params: unknown[]): Promise<unknown> {
        let res: Response;
        try {
            res = await fetch(rpcUrl, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
            });
        } catch {
            throw new ApiError(502, "chain rpc unavailable");
        }
        if (!res.ok) throw new ApiError(502, "chain rpc unavailable");
        const body = (await res.json()) as { result?: unknown; error?: unknown };
        if (body.error !== undefined) throw new ApiError(502, "chain rpc error");
        return body.result;
    }
    return {
        treasury: treasury.toLowerCase(),
        async fetchTx(txHash: string): Promise<ChainTx | null> {
            const tx = (await rpc("eth_getTransactionByHash", [txHash])) as
                | { from: string; to: string | null; value: string }
                | null
                | undefined;
            if (tx === null || tx === undefined) return null;
            const receipt = (await rpc("eth_getTransactionReceipt", [txHash])) as
                | { blockNumber: string | null; status: string }
                | null
                | undefined;
            const mined = receipt !== null && receipt !== undefined && receipt.blockNumber !== null;
            return {
                from: tx.from.toLowerCase(),
                to: tx.to === null ? null : tx.to.toLowerCase(),
                valueWei: BigInt(tx.value),
                confirmed: mined,
                success: mined && receipt.status === "0x1",
            };
        },
    };
}
