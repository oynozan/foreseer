import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
    CLIENT_SEED_RE,
    pocketColor,
    receiptDigest,
    recoverSigner,
    resolveOutcome,
    roulette,
    ruleHash,
    seedCommit as hashSeed,
    toBytes,
    toHex,
    verifyCommit,
    verifyMerkleProof,
} from "foreseer-sdk";
import { verifyReceiptSignature } from "foreseer-sdk/verify";
import { api, apiRaw, cfg, operatorHeaders } from "./config.mjs";

const FLAT_BETS = ["red", "black", "even", "odd", "low", "high"];

export function ruleFor(bet) {
    try {
        if (bet?.type === "straight") return roulette({ type: "straight", number: bet.number });
        if (FLAT_BETS.includes(bet?.type)) return roulette({ type: bet.type });
        if (bet?.type === "dozen" || bet?.type === "column") return roulette({ type: bet.type, index: bet.index });
    } catch {
        return null;
    }
    return null;
}

export const colorOf = pocketColor;

const health = await api("GET", "/health");
const domain = { name: "Foreseer", version: "0", chainId: BigInt(health.chainId) };
console.log(`foreseer at ${cfg.api}, teeId ${health.teeId}, chainId ${health.chainId}`);

const registered = new Set();
async function ensureRegistered(rule) {
    const hash = ruleHash(rule);
    if (!registered.has(hash)) {
        await api("POST", "/rules", { rule }, operatorHeaders());
        registered.add(hash);
    }
    return hash;
}

function toReceipt(json) {
    return {
        ...json,
        epochId: BigInt(json.epochId),
        betId: BigInt(json.betId),
        nonce: BigInt(json.nonce),
        timestamp: BigInt(json.timestamp),
    };
}

async function spin(body) {
    if (typeof body?.clientSeed !== "string" || !CLIENT_SEED_RE.test(body.clientSeed)) {
        return { status: 400, json: { error: "clientSeed must match ^[A-Za-z0-9_-]{1,64}$" } };
    }
    const rule = ruleFor(body.bet);
    if (rule === null) {
        return { status: 400, json: { error: "bet must be straight 0..36, red, black, even, odd, low, high, dozen or column" } };
    }
    const hash = await ensureRegistered(rule);
    const played = await apiRaw("POST", "/play", { clientSeed: body.clientSeed, ruleHash: hash }, operatorHeaders());
    if (played.status === 402) return { status: 402, json: { error: "casino balance empty, run: node topup.mjs" } };
    if (played.status !== 201) return { status: 502, json: { error: `foreseer /play failed: ${played.status}` } };
    const { receipt, signature, epochId, betId } = played.json;
    // The casino trusts nothing unsigned: check before paying out
    const check = verifyReceiptSignature({ receipt: toReceipt(receipt), signature }, domain, health.teeId);
    if (!check.ok) return { status: 502, json: { error: `receipt signature rejected: ${check.error}` } };
    const number = receipt.draws[0];
    return {
        status: 200,
        json: {
            epochId,
            betId,
            nonce: receipt.nonce,
            number,
            color: colorOf(number),
            win: receipt.win,
            payoutBp: receipt.payoutBp,
            receipt,
            signature,
        },
    };
}

// Evidence, not booleans: recompute every check and show the values
async function proofFor(epochId, betId) {
    const epoch = await apiRaw("GET", `/epochs/${epochId}`);
    if (epoch.status !== 200) return { status: 404, json: { error: "unknown epoch" } };
    const page = await apiRaw("GET", `/epochs/${epochId}/receipts?limit=1000`);
    const entry = (page.json.receipts ?? []).find((r) => r.receipt.betId === betId);
    if (entry === undefined) return { status: 404, json: { error: "unknown bet in this epoch" } };
    const receipt = toReceipt(entry.receipt);
    const digest = receiptDigest(receipt, domain);
    let recovered = null;
    try {
        recovered = recoverSigner(digest, entry.signature);
    } catch {}
    const closed = epoch.json.closedAt !== null;
    const out = {
        closed,
        epochId,
        betId,
        apiBase: cfg.api,
        receipt: entry.receipt,
        signature: entry.signature,
        digest: toHex(digest),
        signer: { recovered, expected: health.teeId, ok: recovered === health.teeId },
        commitment: { seedCommit: entry.receipt.seedCommit, serverSeed: null, seedHash: null, ok: null },
        outcome: {
            clientSeed: entry.receipt.clientSeed,
            nonce: entry.receipt.nonce,
            ruleHash: entry.receipt.ruleHash,
            receiptDraws: entry.receipt.draws,
            recomputedDraws: null,
            recomputedWin: null,
            recomputedPayoutBp: null,
            ruleMatches: null,
            ok: null,
        },
        merkle: { merkleRoot: epoch.json.merkleRoot, proof: null, receiptCount: epoch.json.receiptCount, ok: null },
        closesAt: null,
    };
    if (!closed) {
        const current = await apiRaw("GET", "/epochs/current");
        if (current.status === 200 && current.json.epochId === epochId) out.closesAt = current.json.closesAt;
        return { status: 200, json: out };
    }
    const serverSeed = epoch.json.serverSeed;
    out.commitment.serverSeed = serverSeed;
    out.commitment.seedHash = hashSeed(toBytes(serverSeed));
    out.commitment.ok = verifyCommit(serverSeed, entry.receipt.seedCommit);
    const ruleRes = await apiRaw("GET", `/rules/${entry.receipt.ruleHash}`);
    if (ruleRes.status === 200) {
        const rule = ruleRes.json.rule;
        out.outcome.ruleMatches = ruleHash(rule) === entry.receipt.ruleHash;
        const redo = resolveOutcome(rule, toBytes(serverSeed), entry.receipt.clientSeed, BigInt(entry.receipt.nonce));
        out.outcome.recomputedDraws = redo.draws;
        out.outcome.recomputedWin = redo.win;
        out.outcome.recomputedPayoutBp = redo.payoutBp;
        out.outcome.ok =
            out.outcome.ruleMatches &&
            JSON.stringify(redo.draws) === JSON.stringify(entry.receipt.draws) &&
            redo.win === entry.receipt.win &&
            redo.payoutBp === entry.receipt.payoutBp;
    }
    const proofRes = await apiRaw("GET", `/epochs/${epochId}/proof/${betId}`);
    if (proofRes.status === 200) {
        out.merkle.merkleRoot = proofRes.json.merkleRoot;
        out.merkle.proof = proofRes.json.proof;
        out.merkle.ok = verifyMerkleProof(
            digest,
            proofRes.json.proof.map(toBytes),
            toBytes(proofRes.json.merkleRoot),
        );
    }
    return { status: 200, json: out };
}

const staticDir = fileURLToPath(new URL("static", import.meta.url));
const p5Path = fileURLToPath(new URL("node_modules/p5/lib/p5.min.js", import.meta.url));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

async function serveStatic(res, urlPath) {
    const rel = urlPath === "/" ? "index.html" : urlPath.slice(1);
    const file = normalize(join(staticDir, rel));
    if (!file.startsWith(staticDir)) return send(res, 404, { error: "not found" });
    try {
        const data = await readFile(urlPath === "/p5.min.js" ? p5Path : file);
        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        res.end(data);
    } catch {
        send(res, 404, { error: "not found" });
    }
}

function send(res, status, json) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(json));
}

function readBody(req) {
    return new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => {
            data += chunk;
            if (data.length > 16384) req.destroy();
        });
        req.on("end", () => {
            try {
                resolve(JSON.parse(data));
            } catch {
                resolve(undefined);
            }
        });
    });
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
        if (req.method === "POST" && url.pathname === "/api/spin") {
            const out = await spin(await readBody(req));
            return send(res, out.status, out.json);
        }
        if (req.method === "GET" && url.pathname === "/api/state") {
            const [epoch, balance] = await Promise.all([
                api("GET", "/epochs/current"),
                api("GET", "/billing/balance", undefined, operatorHeaders()),
            ]);
            return send(res, 200, { epoch, balance, teeId: health.teeId, chainId: health.chainId });
        }
        const verifyMatch = url.pathname.match(/^\/api\/verify\/(\d+)\/(\d+)$/);
        if (req.method === "GET" && verifyMatch) {
            const out = await apiRaw("GET", `/verify/${verifyMatch[1]}/${verifyMatch[2]}`);
            return send(res, out.status, out.json);
        }
        const proofMatch = url.pathname.match(/^\/api\/proof\/(\d+)\/(\d+)$/);
        if (req.method === "GET" && proofMatch) {
            const out = await proofFor(Number(proofMatch[1]), Number(proofMatch[2]));
            return send(res, out.status, out.json);
        }
        if (req.method === "GET") return serveStatic(res, url.pathname);
        return send(res, 404, { error: "not found" });
    } catch (err) {
        return send(res, 502, { error: err.message });
    }
});

server.listen(cfg.port, () => {
    console.log(`demo casino on http://localhost:${cfg.port}`);
});
