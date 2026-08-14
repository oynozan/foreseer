import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import {
    isValidRule,
    recoverSigner,
    ruleHash,
    receiptDigest,
    toBytes,
    verifyCommit,
    verifyMerkleProof,
} from "foreseer-sdk";
import { verifyOutcome } from "foreseer-sdk/verify";
import { REFERENCE_CODE_VERSION } from "foreseer-sdk/reference";
import type { Hex, Receipt, Rule } from "foreseer-sdk";
import { ApiError, rowToReceipt } from "./engine";
import type { Engine } from "./engine";
import type { DepositRow, EpochRow, OperatorRow, RuleRow } from "./db";
import { AdminGuard, OperatorGuard, PlayRateGuard } from "./guards";
import type { ApiRequest } from "./guards";
import { parseWallet } from "./wallet";
import type { ChainGateway, WalletSessions } from "./wallet";
import { CHAIN, DB, ENGINE, PRICE_PER_PLAY_WEI, SESSIONS } from "./tokens";

const HASH = /^0x[0-9a-f]{64}$/;

interface Funds {
    plays: number;
    depositedWei: bigint;
    spentWei: bigint;
    balanceWei: bigint;
}

// Plays are charged at their recorded price, never re-priced
function playCharges(db: Database.Database, operatorId: number, from?: number, to?: number): { plays: number; wei: bigint } {
    const ranged = from !== undefined;
    const rows = db
        .prepare(
            `SELECT price_wei AS p, COUNT(*) AS c FROM receipts WHERE operator_id = ?${
                ranged ? " AND timestamp BETWEEN ? AND ?" : ""
            } GROUP BY price_wei`,
        )
        .all(...(ranged ? [operatorId, from, to] : [operatorId])) as { p: string; c: number }[];
    return rows.reduce(
        (acc, row) => ({ plays: acc.plays + row.c, wei: acc.wei + BigInt(row.p) * BigInt(row.c) }),
        { plays: 0, wei: 0n },
    );
}

function operatorFunds(db: Database.Database, operatorId: number): Funds {
    const charges = playCharges(db, operatorId);
    const rows = db.prepare("SELECT amount_wei FROM deposits WHERE operator_id = ?").all(operatorId) as {
        amount_wei: string;
    }[];
    const depositedWei = rows.reduce((acc, row) => acc + BigInt(row.amount_wei), 0n);
    return {
        plays: charges.plays,
        depositedWei,
        spentWei: charges.wei,
        balanceWei: depositedWei - charges.wei,
    };
}

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
        codeVersion: REFERENCE_CODE_VERSION,
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
    constructor(
        @Inject(ENGINE) private readonly engine: Engine,
        @Inject(CHAIN) private readonly chain: ChainGateway | null,
    ) {}

    @Get("health")
    health() {
        return {
            ok: true,
            teeId: this.engine.teeId,
            chainId: Number(this.engine.domain.chainId),
            treasury: this.chain === null ? null : this.chain.treasury,
        };
    }
}

// Wall-clock start, captured at module init
const startedAtMs = Date.now();

@Controller()
export class MetricsController {
    constructor(
        @Inject(DB) private readonly db: Database.Database,
        @Inject(ENGINE) private readonly engine: Engine,
    ) {}

    @Get("metrics")
    metrics() {
        const count = (sql: string, ...args: number[]): number =>
            (this.db.prepare(sql).get(...args) as { c: number }).c;
        return {
            uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
            epochsTotal: count("SELECT COUNT(*) AS c FROM epochs"),
            epochsOpen: count("SELECT COUNT(*) AS c FROM epochs WHERE closed_at IS NULL"),
            receiptsTotal: count("SELECT COUNT(*) AS c FROM receipts"),
            operatorsTotal: count("SELECT COUNT(*) AS c FROM operators"),
            merkleCacheHits: this.engine.merkleCacheHits,
            playsLastHour: count(
                "SELECT COUNT(*) AS c FROM receipts WHERE timestamp > ?",
                this.engine.nowSeconds() - 3600,
            ),
        };
    }
}

interface BillingRow {
    operatorId: number;
    name: string;
    ownerWallet: string | null;
    plays: number;
    wins: number;
    payoutBpSum: number;
}

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
    constructor(
        @Inject(DB) private readonly db: Database.Database,
        @Inject(ENGINE) private readonly engine: Engine,
        @Inject(PRICE_PER_PLAY_WEI) private readonly pricePerPlayWei: string,
    ) {}

    @Post("operators")
    createOperator(@Body() body: unknown) {
        const b = body as { name?: unknown; ownerWallet?: unknown };
        const name = b?.name;
        if (typeof name !== "string" || name.length < 1 || name.length > 64) {
            throw new ApiError(400, "name must be a 1..64 char string");
        }
        const wallet = b?.ownerWallet === undefined ? null : parseWallet(b.ownerWallet);
        const apiKey = `fsk_${randomBytes(24).toString("hex")}`;
        const keyHash = createHash("sha256").update(apiKey, "utf8").digest("hex");
        try {
            this.db
                .prepare("INSERT INTO operators (name, api_key_hash, created_at, owner_wallet) VALUES (?, ?, ?, ?)")
                .run(name, keyHash, Math.floor(Date.now() / 1000), wallet);
        } catch {
            throw new ApiError(409, "operator name already exists");
        }
        const row = this.db.prepare("SELECT * FROM operators WHERE name = ?").get(name) as unknown as OperatorRow;
        return { id: row.id, name: row.name, ownerWallet: row.owner_wallet, apiKey };
    }

    @Post("operators/:id/active")
    @HttpCode(200)
    setActive(@Param("id") idRaw: string, @Body() body: unknown) {
        const id = intParam(idRaw);
        const active = (body as { active?: unknown })?.active;
        if (typeof active !== "boolean") throw new ApiError(400, "active must be a boolean");
        const result = this.db.prepare("UPDATE operators SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
        if (result.changes === 0) throw new ApiError(404, "unknown operator");
        return { operatorId: id, active };
    }

    @Post("close")
    @HttpCode(200)
    close() {
        const closed = this.engine.closeOpen();
        if (closed === null) throw new ApiError(409, "no open epoch");
        return closed;
    }

    @Get("billing")
    billing(@Query("from") fromRaw?: unknown, @Query("to") toRaw?: unknown) {
        const from = intQuery(fromRaw, 0, 0, Number.MAX_SAFE_INTEGER, "from must be >= 0");
        const to = intQuery(toRaw, this.engine.nowSeconds(), 0, Number.MAX_SAFE_INTEGER, "to must be >= 0");
        const rows = this.db
            .prepare(
                "SELECT o.id AS operatorId, o.name AS name, o.owner_wallet AS ownerWallet, COUNT(r.epoch_id) AS plays, COALESCE(SUM(r.win), 0) AS wins, COALESCE(SUM(r.payout_bp), 0) AS payoutBpSum FROM operators o LEFT JOIN receipts r ON r.operator_id = o.id AND r.timestamp BETWEEN ? AND ? GROUP BY o.id, o.name, o.owner_wallet ORDER BY o.id",
            )
            .all(from, to) as unknown as BillingRow[];
        const operators = rows.map((row) => {
            const funds = operatorFunds(this.db, row.operatorId);
            const ranged = playCharges(this.db, row.operatorId, from, to);
            return {
                ...row,
                amountDueWei: ranged.wei.toString(),
                depositedWei: funds.depositedWei.toString(),
                balanceWei: funds.balanceWei.toString(),
            };
        });
        const totals = operators.reduce(
            (acc, row) => ({
                plays: acc.plays + row.plays,
                amountDueWei: acc.amountDueWei + BigInt(row.amountDueWei),
                depositedWei: acc.depositedWei + BigInt(row.depositedWei),
            }),
            { plays: 0, amountDueWei: 0n, depositedWei: 0n },
        );
        return {
            from,
            to,
            pricePerPlayWei: this.pricePerPlayWei,
            operators,
            totals: {
                plays: totals.plays,
                amountDueWei: totals.amountDueWei.toString(),
                depositedWei: totals.depositedWei.toString(),
            },
        };
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
        @Inject(PRICE_PER_PLAY_WEI) private readonly pricePerPlayWei: string,
    ) {}

    @Post()
    @UseGuards(OperatorGuard, PlayRateGuard)
    play(@Req() req: ApiRequest, @Body() body: unknown) {
        const b = body as { clientSeed?: unknown; ruleHash?: unknown; nonce?: unknown };
        if (typeof b?.clientSeed !== "string") throw new ApiError(400, "clientSeed required");
        if (typeof b?.ruleHash !== "string") throw new ApiError(400, "ruleHash required");
        if (b.nonce !== undefined && !Number.isSafeInteger(b.nonce)) throw new ApiError(400, "bad nonce");
        const price = BigInt(this.pricePerPlayWei);
        // Wallet-tied operators are prepaid, key-only operators are invoiced
        if (req.operator!.owner_wallet !== null && price > 0n) {
            const funds = operatorFunds(this.db, req.operator!.id);
            if (funds.balanceWei < price) {
                throw new ApiError(402, "insufficient balance, top up via POST /billing/topup");
            }
        }
        const rule = loadRule(this.db, b.ruleHash);
        const played = this.engine.play({
            operatorId: req.operator!.id,
            clientSeed: b.clientSeed,
            rule,
            nonce: b.nonce as number | undefined,
            priceWei: this.pricePerPlayWei,
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

@Controller("auth")
export class AuthController {
    constructor(@Inject(SESSIONS) private readonly sessions: WalletSessions) {}

    @Get("nonce")
    nonce(@Query("wallet") walletRaw?: unknown) {
        const wallet = parseWallet(walletRaw);
        return { wallet, ...this.sessions.issueNonce(wallet) };
    }

    @Post("login")
    @HttpCode(200)
    login(@Body() body: unknown) {
        const b = body as { wallet?: unknown; signature?: unknown };
        const wallet = parseWallet(b?.wallet);
        if (typeof b?.signature !== "string") throw new ApiError(400, "signature required");
        return { wallet, ...this.sessions.login(wallet, b.signature) };
    }
}

@Controller("billing")
export class BillingController {
    constructor(
        @Inject(DB) private readonly db: Database.Database,
        @Inject(CHAIN) private readonly chain: ChainGateway | null,
        @Inject(SESSIONS) private readonly sessions: WalletSessions,
        @Inject(PRICE_PER_PLAY_WEI) private readonly pricePerPlayWei: string,
    ) {}

    private funds(operatorId: number): Funds {
        return operatorFunds(this.db, operatorId);
    }

    @Post("topup")
    @HttpCode(200)
    @UseGuards(OperatorGuard)
    async topup(@Req() req: ApiRequest, @Body() body: unknown) {
        const operator = req.operator!;
        if (operator.owner_wallet === null) throw new ApiError(400, "operator has no owner wallet");
        if (this.chain === null) throw new ApiError(503, "treasury not configured");
        const txHash = (body as { txHash?: unknown })?.txHash;
        if (typeof txHash !== "string" || !HASH.test(txHash)) throw new ApiError(400, "txHash must be a 0x hash");
        const tx = await this.chain.fetchTx(txHash);
        if (tx === null) throw new ApiError(404, "transaction not found");
        if (!tx.confirmed) throw new ApiError(409, "transaction not confirmed yet");
        if (!tx.success) throw new ApiError(400, "transaction failed onchain");
        if (tx.to !== this.chain.treasury) throw new ApiError(400, "transaction does not pay the treasury");
        if (tx.from !== operator.owner_wallet) throw new ApiError(403, "transaction not sent by the owner wallet");
        if (tx.valueWei <= 0n) throw new ApiError(400, "transaction transfers no value");
        try {
            this.db
                .prepare(
                    "INSERT INTO deposits (tx_hash, operator_id, from_wallet, amount_wei, created_at) VALUES (?, ?, ?, ?, ?)",
                )
                .run(txHash, operator.id, tx.from, tx.valueWei.toString(), Math.floor(Date.now() / 1000));
        } catch {
            throw new ApiError(409, "transaction already credited");
        }
        const funds = this.funds(operator.id);
        return {
            creditedWei: tx.valueWei.toString(),
            depositedWei: funds.depositedWei.toString(),
            spentWei: funds.spentWei.toString(),
            balanceWei: funds.balanceWei.toString(),
        };
    }

    @Get("balance")
    @UseGuards(OperatorGuard)
    balance(@Req() req: ApiRequest) {
        const funds = this.funds(req.operator!.id);
        return {
            pricePerPlayWei: this.pricePerPlayWei,
            plays: funds.plays,
            depositedWei: funds.depositedWei.toString(),
            spentWei: funds.spentWei.toString(),
            balanceWei: funds.balanceWei.toString(),
        };
    }

    @Get("me")
    me(@Req() req: ApiRequest) {
        const token = req.headers["x-owner-token"];
        const wallet = typeof token === "string" ? this.sessions.walletFor(token) : null;
        if (wallet === null) throw new ApiError(401, "wallet login required");
        const rows = this.db
            .prepare("SELECT * FROM operators WHERE owner_wallet = ? ORDER BY id")
            .all(wallet) as unknown as OperatorRow[];
        if (rows.length === 0) throw new ApiError(404, "no Foreseer service tied to this wallet");
        const operators = rows.map((operator) => {
            const stats = this.db
                .prepare(
                    "SELECT COUNT(*) AS plays, COALESCE(SUM(win), 0) AS wins, COALESCE(SUM(payout_bp), 0) AS payoutBpSum, COUNT(DISTINCT epoch_id) AS epochsUsed FROM receipts WHERE operator_id = ?",
                )
                .get(operator.id) as { plays: number; wins: number; payoutBpSum: number; epochsUsed: number };
            const deposits = this.db
                .prepare("SELECT * FROM deposits WHERE operator_id = ? ORDER BY created_at DESC")
                .all(operator.id) as unknown as DepositRow[];
            const recent = this.db
                .prepare(
                    "SELECT epoch_id, bet_id, client_seed, win, payout_bp, timestamp FROM receipts WHERE operator_id = ? ORDER BY timestamp DESC, epoch_id DESC, bet_id DESC LIMIT 20",
                )
                .all(operator.id) as {
                epoch_id: number;
                bet_id: number;
                client_seed: string;
                win: number;
                payout_bp: number;
                timestamp: number;
            }[];
            const funds = this.funds(operator.id);
            return {
                operatorId: operator.id,
                name: operator.name,
                createdAt: operator.created_at,
                ...stats,
                depositedWei: funds.depositedWei.toString(),
                spentWei: funds.spentWei.toString(),
                balanceWei: funds.balanceWei.toString(),
                deposits: deposits.map((d) => ({
                    txHash: d.tx_hash,
                    fromWallet: d.from_wallet,
                    amountWei: d.amount_wei,
                    createdAt: d.created_at,
                })),
                recent: recent.map((r) => ({
                    epochId: r.epoch_id,
                    betId: r.bet_id,
                    clientSeed: r.client_seed,
                    win: r.win === 1,
                    payoutBp: r.payout_bp,
                    timestamp: r.timestamp,
                })),
            };
        });
        return { wallet, pricePerPlayWei: this.pricePerPlayWei, operators };
    }
}
