import { MerkleTree, receiptDigest, toBytes, toHex } from "../../packages/ts/src/index.ts";
import {
    verifyCommit,
    verifyMerkleProof,
    verifyOutcome,
    verifyReceiptSignature,
} from "../../packages/ts/src/verify.ts";

function receiptFromJson(r) {
    return {
        specVersion: r.specVersion,
        codeVersion: r.codeVersion,
        epochId: BigInt(r.epochId),
        betId: BigInt(r.betId),
        seedCommit: r.seedCommit,
        clientSeed: r.clientSeed,
        nonce: BigInt(r.nonce),
        ruleHash: r.ruleHash,
        draws: r.draws,
        win: r.win,
        payoutBp: r.payoutBp,
        timestamp: BigInt(r.timestamp),
    };
}

// The four offline checks of FORESEER-SPEC section 8
export function runChecks(input) {
    const domain = { name: "Foreseer", version: "0", chainId: BigInt(input.chainId ?? 114) };
    const receipt = receiptFromJson(input.receipt);
    const signed = { receipt, signature: input.signature };

    const sig = verifyReceiptSignature(signed, domain, input.expectedTeeId);
    const commit = verifyCommit(input.serverSeed, receipt.seedCommit);
    const outcome = verifyOutcome(receipt, input.rule, input.serverSeed);
    const digest = receiptDigest(receipt, domain);
    const merkle = verifyMerkleProof(digest, input.proof.map(toBytes), toBytes(input.merkleRoot));

    return {
        teeId: sig.teeId,
        digest: toHex(digest),
        checks: {
            signature: { ok: sig.ok, detail: sig.ok ? `signed by ${sig.teeId}` : (sig.error ?? "invalid") },
            commit: {
                ok: commit,
                detail: commit ? "revealed seed matches the commitment" : "seed does not hash to seedCommit",
            },
            outcome: { ok: outcome.ok, detail: outcome.ok ? "draws, win, payout recomputed" : outcome.error },
            merkle: { ok: merkle, detail: merkle ? "digest proves into the root" : "proof does not reach the root" },
        },
        allGreen: sig.ok && commit && outcome.ok && merkle,
    };
}

// Builds widget inputs from the public server API
export async function loadFromServer(baseUrl, epochId, betId) {
    const get = async (path) => {
        const res = await fetch(`${baseUrl}${path}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body;
    };
    const epoch = await get(`/epochs/${epochId}`);
    if (epoch.serverSeed === null) throw new Error("epoch still open, verify after it closes");
    const receipts = await get(`/epochs/${epochId}/receipts?limit=1000`);
    const entry = receipts.receipts.find((r) => r.receipt.betId === betId);
    if (entry === undefined) throw new Error(`betId ${betId} not found in epoch ${epochId}`);
    const proof = await get(`/epochs/${epochId}/proof/${betId}`);
    const rule = await get(`/rules/${entry.receipt.ruleHash}`);
    const health = await get("/health");
    return {
        receipt: entry.receipt,
        signature: entry.signature,
        rule: rule.rule,
        serverSeed: epoch.serverSeed,
        seedCommit: epoch.seedCommit,
        merkleRoot: epoch.merkleRoot,
        proof: proof.proof,
        teeId: health.teeId,
        chainId: 114,
    };
}

export { MerkleTree, toHex };
