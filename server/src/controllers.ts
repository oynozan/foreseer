import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
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
import { ApiError, rowToReceipt } from "./engine";
import type { Engine } from "./engine";
import type { EpochRow, OperatorRow, RuleRow } from "./db";
import { AdminGuard, OperatorGuard, PlayRateGuard } from "./guards";
import type { ApiRequest } from "./guards";
import { DB, ENGINE } from "./tokens";

const HASH = /^0x[0-9a-f]{64}$/;

function intParam(value: string): number {
    if (!/^\d+$/.test(value)) throw new ApiError(404, "no such route");
    return Number(value);
}

function intQuery(value: unknown, fallback: number, min: number, max: number, message: string): number {
    if (value === undefined) return fallback;
    const n = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new ApiError(400, message);
    return n;
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

function loadRule(db: Database.Database, hash: string): Rule {
    const row = db.prepare("SELECT * FROM rules WHERE rule_hash = ?").get(hash) as RuleRow | undefined;
    if (row === undefined) throw new ApiError(404, "unknown ruleHash, register it via POST /rules");
    return JSON.parse(row.rule_json) as Rule;
}

@Controller()
export class HealthController {
    constructor(@Inject(ENGINE) private readonly engine: Engine) {}

    @Get("health")
    health() {
        return { ok: true, teeId: this.engine.teeId, chainId: Number(this.engine.domain.chainId) };
    }
}

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
    constructor(
        @Inject(DB) private readonly db: Database.Database,
        @Inject(ENGINE) private readonly engine: Engine,
    ) {}

    @Post("operators")
    createOperator(@Body() body: unknown) {
        const name = (body as { name?: unknown })?.name;
        if (typeof name !== "string" || name.length < 1 || name.length > 64) {
            throw new ApiError(400, "name must be a 1..64 char string");
        }
        const apiKey = `fsk_${randomBytes(24).toString("hex")}`;
        try {
            this.db
                .prepare("INSERT INTO operators (name, api_key, created_at) VALUES (?, ?, ?)")
                .run(name, apiKey, Math.floor(Date.now() / 1000));
        } catch {
            throw new ApiError(409, "operator name already exists");
        }
        const row = this.db.prepare("SELECT * FROM operators WHERE name = ?").get(name) as unknown as OperatorRow;
        return { id: row.id, name: row.name, apiKey };
    }

    @Post("close")
    @HttpCode(200)
    close() {
        const closed = this.engine.closeOpen();
        if (closed === null) throw new ApiError(409, "no open epoch");
        return closed;
    }
}

@Controller("rules")
export class RulesController {
    constructor(@Inject(DB) private readonly db: Database.Database) {}

    @Post()
    @UseGuards(OperatorGuard)
    register(@Req() req: ApiRequest, @Body() body: unknown) {
        const rule = (body as { rule?: unknown })?.rule;
        if (!isValidRule(rule)) throw new ApiError(400, "invalid rule (FORESEER-SPEC section 4.2)");
        const hash = ruleHash(rule);
        this.db
            .prepare(
                "INSERT INTO rules (rule_hash, operator_id, rule_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(rule_hash) DO NOTHING",
            )
            .run(hash, req.operator!.id, JSON.stringify(rule), Math.floor(Date.now() / 1000));
        return { ruleHash: hash };
    }

    @Get(":ruleHash")
    fetchRule(@Param("ruleHash") hash: string) {
        if (!HASH.test(hash)) throw new ApiError(404, "no such route");
        return { ruleHash: hash, rule: loadRule(this.db, hash) };
    }
}

@Controller("play")
export class PlayController {
    constructor(
        @Inject(DB) private readonly db: Database.Database,
        @Inject(ENGINE) private readonly engine: Engine,
    ) {}

    @Post()
    @UseGuards(OperatorGuard, PlayRateGuard)
    play(@Req() req: ApiRequest, @Body() body: unknown) {
        const b = body as { clientSeed?: unknown; ruleHash?: unknown; nonce?: unknown };
        if (typeof b?.clientSeed !== "string") throw new ApiError(400, "clientSeed required");
        if (typeof b?.ruleHash !== "string") throw new ApiError(400, "ruleHash required");
        if (b.nonce !== undefined && !Number.isSafeInteger(b.nonce)) throw new ApiError(400, "bad nonce");
        const rule = loadRule(this.db, b.ruleHash);
        const played = this.engine.play({
            operatorId: req.operator!.id,
            clientSeed: b.clientSeed,
            rule,
            nonce: b.nonce as number | undefined,
        });
        return {
            epochId: played.epochId,
            betId: played.betId,
            ...receiptJson(played.signed.receipt, played.signed.signature),
        };
    }
}

@Controller("epochs")
export class EpochsController {
    constructor(@Inject(ENGINE) private readonly engine: Engine) {}

    @Get("current")
    current() {
        const row = this.engine.ensureEpoch();
        return {
            epochId: row.epoch_id,
            seedCommit: row.seed_commit,
            openedAt: row.opened_at,
            closesAt: row.opened_at + this.engine.epochSeconds,
        };
    }

    @Get(":id")
    byId(@Param("id") id: string) {
        const row = this.engine.epochRow(intParam(id));
        if (row === undefined) throw new ApiError(404, "unknown epoch");
        return epochJson(row);
    }

    @Get(":id/receipts")
    receipts(
        @Param("id") id: string,
        @Query("clientSeed") clientSeedRaw?: unknown,
        @Query("limit") limitRaw?: unknown,
        @Query("offset") offsetRaw?: unknown,
    ) {
        const epochId = intParam(id);
        const epoch = this.engine.epochRow(epochId);
        if (epoch === undefined) throw new ApiError(404, "unknown epoch");
        const clientSeed = typeof clientSeedRaw === "string" ? clientSeedRaw : undefined;
        const limit = intQuery(limitRaw, 100, 1, 1000, "limit must be 1..1000");
        const offset = intQuery(offsetRaw, 0, 0, Number.MAX_SAFE_INTEGER, "offset must be >= 0");
        const page = this.engine.receiptPage(epochId, clientSeed, limit, offset);
        return {
            epochId,
            total: page.total,
            limit,
            offset,
            receipts: page.rows.map((row) => receiptJson(rowToReceipt(row, epoch.seed_commit as Hex), row.signature)),
        };
    }

    @Get(":id/proof/:betId")
    proof(@Param("id") id: string, @Param("betId") betId: string) {
        return this.engine.proofFor(intParam(id), intParam(betId));
    }
}

@Controller("verify")
export class VerifyController {
    constructor(
        @Inject(DB) private readonly db: Database.Database,
        @Inject(ENGINE) private readonly engine: Engine,
    ) {}

    @Get(":epochId/:betId")
    verify(@Param("epochId") epochIdRaw: string, @Param("betId") betIdRaw: string) {
        const epochId = intParam(epochIdRaw);
        const betId = intParam(betIdRaw);
        const epoch = this.engine.epochRow(epochId);
        if (epoch === undefined) throw new ApiError(404, "unknown epoch");
        const row = this.engine.receiptRows(epochId).find((r) => r.bet_id === betId);
        if (row === undefined) throw new ApiError(404, "unknown betId");
        const receipt = rowToReceipt(row, epoch.seed_commit as Hex);
        const digest = receiptDigest(receipt, this.engine.domain);
        let signature = false;
        try {
            signature = recoverSigner(digest, row.signature as Hex) === this.engine.teeId;
        } catch {
            signature = false;
        }
        if (epoch.closed_at === null) {
            return { epochId, betId, closed: false, checks: { signature } };
        }
        const seed = epoch.server_seed as Hex;
        const rule = loadRule(this.db, row.rule_hash);
        const proof = this.engine.proofFor(epochId, betId);
        const checks = {
            signature,
            commit: verifyCommit(seed, receipt.seedCommit),
            outcome: verifyOutcome(receipt, rule, seed).ok,
            merkle: verifyMerkleProof(digest, proof.proof.map(toBytes), toBytes(proof.merkleRoot)),
        };
        return { epochId, betId, closed: true, checks, allGreen: Object.values(checks).every(Boolean) };
    }
}
