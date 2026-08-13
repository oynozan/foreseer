import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
    isValidRule,
    recoverSigner,
    ruleHash,
    receiptDigest,
    toBytes,
    verifyCommit,
    verifyMerkleProof,
} from "foreseer.ts";
import { verifyOutcome } from "foreseer.ts/verify";
import type { Hex, Receipt, Rule } from "foreseer.ts";
import { ApiError, Engine, rowToReceipt } from "./engine.js";
import type { EpochRow, OperatorRow, RuleRow } from "./db.js";

export interface ApiOptions {
    db: DatabaseSync;
    engine: Engine;
    adminKey: string;
}

type Handler = (ctx: { req: IncomingMessage; params: string[]; query: URLSearchParams; body: unknown }) => {
    status?: number;
    json: unknown;
};

interface Route {
    method: string;
    pattern: RegExp;
    handler: Handler;
}

function receiptJson(receipt: Receipt, signature: string) {
    return {
        receipt: {
            specVersion: receipt.specVersion,
            codeVersion: receipt.codeVersion,
            epochId: Number(receipt.epochId),
            betId: Number(receipt.betId),
            seedCommit: receipt.seedCommit,
            clientSeed: receipt.clientSeed,
            nonce: Number(receipt.nonce),
            ruleHash: receipt.ruleHash,
            draws: receipt.draws,
            win: receipt.win,
            payoutBp: receipt.payoutBp,
            timestamp: Number(receipt.timestamp),
        },
        signature,
    };
}

function epochJson(row: EpochRow) {
    const closed = row.closed_at !== null;
    return {
        epochId: row.epoch_id,
        seedCommit: row.seed_commit,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        serverSeed: closed ? row.server_seed : null,
        merkleRoot: row.merkle_root,
        receiptCount: row.receipt_count,
        closeSignature: row.close_signature,
    };
}

export function createApi({ db, engine, adminKey }: ApiOptions): Server {
    const adminDigest = createHash("sha256").update(adminKey, "utf8").digest();

    function requireAdmin(req: IncomingMessage): void {
        const given = req.headers["x-admin-key"];
        const digest = createHash("sha256")
            .update(typeof given === "string" ? given : "", "utf8")
            .digest();
        if (!timingSafeEqual(digest, adminDigest)) throw new ApiError(401, "admin key required");
    }

    function requireOperator(req: IncomingMessage): OperatorRow {
        const key = req.headers["x-api-key"];
        if (typeof key !== "string") throw new ApiError(401, "x-api-key header required");
        const row = db.prepare("SELECT * FROM operators WHERE api_key = ?").get(key) as OperatorRow | undefined;
        if (row === undefined) throw new ApiError(401, "unknown api key");
        return row;
    }

    function loadRule(hash: string): Rule {
        const row = db.prepare("SELECT * FROM rules WHERE rule_hash = ?").get(hash) as RuleRow | undefined;
        if (row === undefined) throw new ApiError(404, "unknown ruleHash, register it via POST /rules");
        return JSON.parse(row.rule_json) as Rule;
    }

    const routes: Route[] = [
        {
            method: "GET",
            pattern: /^\/health$/,
            handler: () => ({ json: { ok: true, teeId: engine.teeId, chainId: Number(engine.domain.chainId) } }),
        },
        {
            method: "POST",
            pattern: /^\/admin\/operators$/,
            handler: ({ req, body }) => {
                requireAdmin(req);
                const name = (body as { name?: unknown })?.name;
                if (typeof name !== "string" || name.length < 1 || name.length > 64) {
                    throw new ApiError(400, "name must be a 1..64 char string");
                }
                const apiKey = `fsk_${randomBytes(24).toString("hex")}`;
                try {
                    db.prepare("INSERT INTO operators (name, api_key, created_at) VALUES (?, ?, ?)").run(
                        name,
                        apiKey,
                        Math.floor(Date.now() / 1000),
                    );
                } catch {
                    throw new ApiError(409, "operator name already exists");
                }
                const row = db.prepare("SELECT * FROM operators WHERE name = ?").get(name) as unknown as OperatorRow;
                return { status: 201, json: { id: row.id, name: row.name, apiKey } };
            },
        },
        {
            method: "POST",
            pattern: /^\/admin\/close$/,
            handler: ({ req }) => {
                requireAdmin(req);
                const closed = engine.closeOpen();
                if (closed === null) throw new ApiError(409, "no open epoch");
                return { json: closed };
            },
        },
        {
            method: "POST",
            pattern: /^\/rules$/,
            handler: ({ req, body }) => {
                const operator = requireOperator(req);
                const rule = (body as { rule?: unknown })?.rule;
                if (!isValidRule(rule)) throw new ApiError(400, "invalid rule (FORESEER-SPEC section 4.2)");
                const hash = ruleHash(rule);
                db.prepare(
                    "INSERT INTO rules (rule_hash, operator_id, rule_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(rule_hash) DO NOTHING",
                ).run(hash, operator.id, JSON.stringify(rule), Math.floor(Date.now() / 1000));
                return { status: 201, json: { ruleHash: hash } };
            },
        },
        {
            method: "GET",
            pattern: /^\/rules\/(0x[0-9a-f]{64})$/,
            handler: ({ params }) => ({ json: { ruleHash: params[0], rule: loadRule(params[0]!) } }),
        },
        {
            method: "POST",
            pattern: /^\/play$/,
            handler: ({ req, body }) => {
                const operator = requireOperator(req);
                const b = body as { clientSeed?: unknown; ruleHash?: unknown; nonce?: unknown };
                if (typeof b?.clientSeed !== "string") throw new ApiError(400, "clientSeed required");
                if (typeof b?.ruleHash !== "string") throw new ApiError(400, "ruleHash required");
                if (b.nonce !== undefined && !Number.isSafeInteger(b.nonce)) throw new ApiError(400, "bad nonce");
                const rule = loadRule(b.ruleHash);
                const played = engine.play({
                    operatorId: operator.id,
                    clientSeed: b.clientSeed,
                    rule,
                    nonce: b.nonce as number | undefined,
                });
                return {
                    status: 201,
                    json: {
                        epochId: played.epochId,
                        betId: played.betId,
                        ...receiptJson(played.signed.receipt, played.signed.signature),
                    },
                };
            },
        },
        {
            method: "GET",
            pattern: /^\/epochs\/current$/,
            handler: () => {
                const row = engine.ensureEpoch();
                return {
                    json: {
                        epochId: row.epoch_id,
                        seedCommit: row.seed_commit,
                        openedAt: row.opened_at,
                        closesAt: row.opened_at + engine.epochSeconds,
                    },
                };
            },
        },
        {
            method: "GET",
            pattern: /^\/epochs\/(\d+)$/,
            handler: ({ params }) => {
                const row = engine.epochRow(Number(params[0]));
                if (row === undefined) throw new ApiError(404, "unknown epoch");
                return { json: epochJson(row) };
            },
        },
        {
            method: "GET",
            pattern: /^\/epochs\/(\d+)\/receipts$/,
            handler: ({ params, query }) => {
                const epochId = Number(params[0]);
                const epoch = engine.epochRow(epochId);
                if (epoch === undefined) throw new ApiError(404, "unknown epoch");
                const clientSeed = query.get("clientSeed") ?? undefined;
                const rows = engine.receiptRows(epochId, clientSeed);
                return {
                    json: {
                        epochId,
                        receipts: rows.map((row) =>
                            receiptJson(rowToReceipt(row, epoch.seed_commit as Hex), row.signature),
                        ),
                    },
                };
            },
        },
        {
            method: "GET",
            pattern: /^\/epochs\/(\d+)\/proof\/(\d+)$/,
            handler: ({ params }) => ({ json: engine.proofFor(Number(params[0]), Number(params[1])) }),
        },
        {
            method: "GET",
            pattern: /^\/verify\/(\d+)\/(\d+)$/,
            handler: ({ params }) => {
                const epochId = Number(params[0]);
                const betId = Number(params[1]);
                const epoch = engine.epochRow(epochId);
                if (epoch === undefined) throw new ApiError(404, "unknown epoch");
                const row = engine.receiptRows(epochId).find((r) => r.bet_id === betId);
                if (row === undefined) throw new ApiError(404, "unknown betId");
                const receipt = rowToReceipt(row, epoch.seed_commit as Hex);
                const digest = receiptDigest(receipt, engine.domain);
                let signature = false;
                try {
                    signature = recoverSigner(digest, row.signature as Hex) === engine.teeId;
                } catch {
                    signature = false;
                }
                if (epoch.closed_at === null) {
                    return { json: { epochId, betId, closed: false, checks: { signature } } };
                }
                const seed = epoch.server_seed as Hex;
                const rule = loadRule(row.rule_hash);
                const proof = engine.proofFor(epochId, betId);
                const checks = {
                    signature,
                    commit: verifyCommit(seed, receipt.seedCommit),
                    outcome: verifyOutcome(receipt, rule, seed).ok,
                    merkle: verifyMerkleProof(digest, proof.proof.map(toBytes), toBytes(proof.merkleRoot)),
                };
                return {
                    json: { epochId, betId, closed: true, checks, allGreen: Object.values(checks).every(Boolean) },
                };
            },
        },
    ];

    async function readBody(req: IncomingMessage): Promise<unknown> {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
            size += (chunk as Buffer).length;
            if (size > 65536) throw new ApiError(413, "body too large");
            chunks.push(chunk as Buffer);
        }
        if (chunks.length === 0) return undefined;
        try {
            return JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
            throw new ApiError(400, "body must be JSON");
        }
    }

    return createServer((req: IncomingMessage, res: ServerResponse) => {
        void (async () => {
            const url = new URL(req.url ?? "/", "http://localhost");
            const route = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
            let status = 200;
            let payload: unknown;
            try {
                if (route === undefined) throw new ApiError(404, "no such route");
                const body = req.method === "POST" ? await readBody(req) : undefined;
                const params = route.pattern.exec(url.pathname)!.slice(1);
                const out = route.handler({ req, params, query: url.searchParams, body });
                status = out.status ?? 200;
                payload = out.json;
            } catch (e) {
                status = e instanceof ApiError ? e.status : 500;
                payload = { error: e instanceof Error ? e.message : "internal error" };
            }
            res.writeHead(status, { "content-type": "application/json" });
            res.end(JSON.stringify(payload));
        })();
    });
}
