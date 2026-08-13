import type Database from "better-sqlite3";
import {
    MerkleTree,
    SPEC_VERSION,
    assertClientSeed,
    receiptDigest,
    ruleHash,
    seedCommit,
    signEpochClose,
    signReceipt,
    resolveOutcome,
    toBytes,
    toHex,
} from "foreseer.ts";
import { addressOfPrivateKey } from "foreseer.ts";
import { REFERENCE_CODE_VERSION, REFERENCE_TEST_KEY } from "foreseer.ts/reference";
import type { Eip712Domain, EpochClose, Hex, Receipt, Rule, SignedReceipt } from "foreseer.ts";
import type { EpochRow, ReceiptRow } from "./db";

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export interface EngineOptions {
    db: Database.Database;
    privateKey?: Hex;
    chainId?: bigint;
    epochSeconds?: number;
    now?: () => number;
}

export function rowToReceipt(row: ReceiptRow, epochSeedCommit: Hex): Receipt {
    return {
        specVersion: SPEC_VERSION,
        codeVersion: REFERENCE_CODE_VERSION,
        epochId: BigInt(row.epoch_id),
        betId: BigInt(row.bet_id),
        seedCommit: epochSeedCommit,
        clientSeed: row.client_seed,
        nonce: BigInt(row.nonce),
        ruleHash: row.rule_hash as Hex,
        draws: JSON.parse(row.draws) as number[],
        win: row.win === 1,
        payoutBp: row.payout_bp,
        timestamp: BigInt(row.timestamp),
    };
}

// Simulated TEE: seed lives in SQLite. Phase 3 moves it into the enclave.
export class Engine {
    readonly domain: Eip712Domain;
    readonly teeId: Hex;
    readonly epochSeconds: number;
    merkleCacheHits = 0;
    private readonly db: Database.Database;
    private readonly key: Uint8Array;
    private readonly now: () => number;
    private readonly merkleCache = new Map<number, { tree: MerkleTree; digests: Uint8Array[] }>();

    constructor(options: EngineOptions) {
        this.db = options.db;
        this.key = toBytes(options.privateKey ?? REFERENCE_TEST_KEY);
        this.teeId = addressOfPrivateKey(this.key);
        this.domain = { name: "Foreseer", version: "0", chainId: options.chainId ?? 114n };
        this.epochSeconds = options.epochSeconds ?? 300;
        this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
    }

    openEpochRow(): EpochRow | undefined {
        return this.db.prepare("SELECT * FROM epochs WHERE closed_at IS NULL ORDER BY epoch_id DESC LIMIT 1").get() as
            EpochRow | undefined;
    }

    epochRow(epochId: number): EpochRow | undefined {
        return this.db.prepare("SELECT * FROM epochs WHERE epoch_id = ?").get(epochId) as EpochRow | undefined;
    }

    ensureEpoch(): EpochRow {
        const open = this.openEpochRow();
        if (open !== undefined) return open;
        const seed = new Uint8Array(32);
        globalThis.crypto.getRandomValues(seed);
        const last = this.db.prepare("SELECT MAX(epoch_id) AS m FROM epochs").get() as { m: number | null };
        const epochId = (last.m ?? 0) + 1;
        this.db
            .prepare("INSERT INTO epochs (epoch_id, seed_commit, server_seed, opened_at) VALUES (?, ?, ?, ?)")
            .run(epochId, seedCommit(seed), toHex(seed), this.now());
        return this.epochRow(epochId)!;
    }

    play(input: { operatorId: number; clientSeed: string; rule: Rule; nonce?: number }): {
        signed: SignedReceipt;
        epochId: number;
        betId: number;
    } {
        try {
            assertClientSeed(input.clientSeed);
        } catch (e) {
            throw new ApiError(400, (e as Error).message);
        }
        const epoch = this.ensureEpoch();
        const seed = toBytes(epoch.server_seed as Hex);
        const nonceRow = this.db
            .prepare("SELECT COALESCE(MAX(nonce) + 1, 0) AS n FROM receipts WHERE epoch_id = ? AND client_seed = ?")
            .get(epoch.epoch_id, input.clientSeed) as { n: number };
        const nonce = nonceRow.n;
        if (input.nonce !== undefined && input.nonce !== nonce) {
            throw new ApiError(409, `nonce must be ${nonce} for this clientSeed`);
        }
        const betRow = this.db.prepare("SELECT COUNT(*) AS c FROM receipts WHERE epoch_id = ?").get(epoch.epoch_id) as {
            c: number;
        };
        const betId = betRow.c;
        const outcome = resolveOutcome(input.rule, seed, input.clientSeed, BigInt(nonce));
        const receipt: Receipt = {
            specVersion: SPEC_VERSION,
            codeVersion: REFERENCE_CODE_VERSION,
            epochId: BigInt(epoch.epoch_id),
            betId: BigInt(betId),
            seedCommit: epoch.seed_commit as Hex,
            clientSeed: input.clientSeed,
            nonce: BigInt(nonce),
            ruleHash: ruleHash(input.rule),
            draws: outcome.draws,
            win: outcome.win,
            payoutBp: outcome.payoutBp,
            timestamp: BigInt(this.now()),
        };
        const signed = signReceipt(receipt, this.domain, this.key);
        this.db
            .prepare(
                "INSERT INTO receipts (epoch_id, bet_id, operator_id, client_seed, nonce, rule_hash, draws, win, payout_bp, timestamp, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
                epoch.epoch_id,
                betId,
                input.operatorId,
                input.clientSeed,
                nonce,
                receipt.ruleHash,
                JSON.stringify(outcome.draws),
                outcome.win ? 1 : 0,
                outcome.payoutBp,
                Number(receipt.timestamp),
                signed.signature,
            );
        return { signed, epochId: epoch.epoch_id, betId };
    }

    receiptRows(epochId: number, clientSeed?: string): ReceiptRow[] {
        if (clientSeed !== undefined) {
            return this.db
                .prepare("SELECT * FROM receipts WHERE epoch_id = ? AND client_seed = ? ORDER BY bet_id")
                .all(epochId, clientSeed) as unknown as ReceiptRow[];
        }
        return this.db
            .prepare("SELECT * FROM receipts WHERE epoch_id = ? ORDER BY bet_id")
            .all(epochId) as unknown as ReceiptRow[];
    }

    receiptPage(
        epochId: number,
        clientSeed: string | undefined,
        limit: number,
        offset: number,
    ): { rows: ReceiptRow[]; total: number } {
        const where = clientSeed === undefined ? "epoch_id = ?" : "epoch_id = ? AND client_seed = ?";
        const args = clientSeed === undefined ? [epochId] : [epochId, clientSeed];
        const total = (
            this.db.prepare(`SELECT COUNT(*) AS c FROM receipts WHERE ${where}`).get(...args) as { c: number }
        ).c;
        const rows = this.db
            .prepare(`SELECT * FROM receipts WHERE ${where} ORDER BY bet_id LIMIT ? OFFSET ?`)
            .all(...args, limit, offset) as unknown as ReceiptRow[];
        return { rows, total };
    }

    closeOpen(): { epochId: number; merkleRoot: Hex; receiptCount: number; closeSignature: Hex } | null {
        const epoch = this.openEpochRow();
        if (epoch === undefined) return null;
        const rows = this.receiptRows(epoch.epoch_id);
        const digests = rows.map((row) => receiptDigest(rowToReceipt(row, epoch.seed_commit as Hex), this.domain));
        const root = toHex(new MerkleTree(digests).root);
        const close: EpochClose = {
            specVersion: SPEC_VERSION,
            codeVersion: REFERENCE_CODE_VERSION,
            epochId: BigInt(epoch.epoch_id),
            seedCommit: epoch.seed_commit as Hex,
            serverSeed: epoch.server_seed as Hex,
            merkleRoot: root,
            receiptCount: BigInt(rows.length),
        };
        const closeSignature = signEpochClose(close, this.domain, this.key);
        this.db
            .prepare(
                "UPDATE epochs SET closed_at = ?, merkle_root = ?, receipt_count = ?, close_signature = ? WHERE epoch_id = ?",
            )
            .run(this.now(), root, rows.length, closeSignature, epoch.epoch_id);
        return { epochId: epoch.epoch_id, merkleRoot: root, receiptCount: rows.length, closeSignature };
    }

    tick(): { closed: number | null; open: number } {
        const open = this.openEpochRow();
        let closed: number | null = null;
        if (open !== undefined && this.now() >= open.opened_at + this.epochSeconds) {
            closed = this.closeOpen()!.epochId;
        }
        return { closed, open: this.ensureEpoch().epoch_id };
    }

    // LRU cap 8, closed epochs never change
    private cachedTree(epoch: EpochRow): { tree: MerkleTree; digests: Uint8Array[] } {
        const hit = this.merkleCache.get(epoch.epoch_id);
        if (hit !== undefined) {
            this.merkleCacheHits += 1;
            this.merkleCache.delete(epoch.epoch_id);
            this.merkleCache.set(epoch.epoch_id, hit);
            return hit;
        }
        const rows = this.receiptRows(epoch.epoch_id);
        const digests = rows.map((row) => receiptDigest(rowToReceipt(row, epoch.seed_commit as Hex), this.domain));
        const entry = { tree: new MerkleTree(digests), digests };
        this.merkleCache.set(epoch.epoch_id, entry);
        if (this.merkleCache.size > 8) this.merkleCache.delete(this.merkleCache.keys().next().value!);
        return entry;
    }

    proofFor(epochId: number, betId: number): { digest: Hex; proof: Hex[]; merkleRoot: Hex } {
        const epoch = this.epochRow(epochId);
        if (epoch === undefined) throw new ApiError(404, "unknown epoch");
        if (epoch.closed_at === null) throw new ApiError(409, "epoch still open, proofs exist after close");
        const { tree, digests } = this.cachedTree(epoch);
        if (betId < 0 || betId >= digests.length) throw new ApiError(404, "unknown betId");
        return {
            digest: toHex(digests[betId]!),
            proof: tree.proof(betId).map(toHex),
            merkleRoot: epoch.merkle_root as Hex,
        };
    }
}
