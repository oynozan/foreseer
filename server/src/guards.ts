import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { ApiError } from "./engine";
import type { OperatorRow } from "./db";
import { ADMIN_KEY, DB, PLAY_RATE, READ_RATE } from "./tokens";

export interface ApiRequest {
    headers: Record<string, string | string[] | undefined>;
    operator?: OperatorRow;
}

@Injectable()
export class AdminGuard implements CanActivate {
    private readonly adminDigest: Buffer;

    constructor(@Inject(ADMIN_KEY) adminKey: string) {
        this.adminDigest = createHash("sha256").update(adminKey, "utf8").digest();
    }

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<ApiRequest>();
        const given = req.headers["x-admin-key"];
        const digest = createHash("sha256")
            .update(typeof given === "string" ? given : "", "utf8")
            .digest();
        if (!timingSafeEqual(digest, this.adminDigest)) throw new ApiError(401, "admin key required");
        return true;
    }
}

export interface PlayRateOptions {
    limit: number;
    windowSeconds: number;
}

// Fixed window counter per operator, in memory
@Injectable()
export class PlayRateGuard implements CanActivate {
    private readonly windows = new Map<number, { window: number; count: number }>();

    constructor(@Inject(PLAY_RATE) private readonly rate: PlayRateOptions) {}

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<ApiRequest>();
        const id = req.operator!.id;
        const window = Math.floor(Date.now() / (this.rate.windowSeconds * 1000));
        const entry = this.windows.get(id);
        if (entry === undefined || entry.window !== window) {
            this.windows.set(id, { window, count: 1 });
            return true;
        }
        if (entry.count >= this.rate.limit) throw new ApiError(429, "rate limit exceeded, retry later");
        entry.count += 1;
        return true;
    }
}

// Fixed window per client ip, only for callers with no verified credential
@Injectable()
export class ReadRateGuard implements CanActivate {
    private readonly windows = new Map<string, { window: number; count: number }>();
    private readonly adminDigest: Buffer;

    constructor(
        @Inject(READ_RATE) private readonly rate: PlayRateOptions,
        @Inject(DB) private readonly db: Database.Database,
        @Inject(ADMIN_KEY) adminKey: string,
    ) {
        this.adminDigest = createHash("sha256").update(adminKey, "utf8").digest();
    }

    private credentialed(req: ApiRequest): boolean {
        const admin = req.headers["x-admin-key"];
        if (typeof admin === "string") {
            const digest = createHash("sha256").update(admin, "utf8").digest();
            if (timingSafeEqual(digest, this.adminDigest)) return true;
        }
        const key = req.headers["x-api-key"];
        if (typeof key !== "string") return false;
        const keyHash = createHash("sha256").update(key, "utf8").digest("hex");
        const row = this.db.prepare("SELECT active FROM operators WHERE api_key_hash = ?").get(keyHash) as
            | { active: number }
            | undefined;
        return row !== undefined && row.active === 1;
    }

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<ApiRequest & { ip?: string }>();
        if (this.credentialed(req)) return true;
        const forwarded = req.headers["x-forwarded-for"];
        const ip = (typeof forwarded === "string" ? forwarded.split(",")[0]!.trim() : req.ip) ?? "unknown";
        const window = Math.floor(Date.now() / (this.rate.windowSeconds * 1000));
        const entry = this.windows.get(ip);
        if (entry === undefined || entry.window !== window) {
            if (this.windows.size > 50000) this.windows.clear();
            this.windows.set(ip, { window, count: 1 });
            return true;
        }
        if (entry.count >= this.rate.limit) throw new ApiError(429, "rate limit exceeded, retry later");
        entry.count += 1;
        return true;
    }
}

@Injectable()
export class OperatorGuard implements CanActivate {
    constructor(@Inject(DB) private readonly db: Database.Database) {}

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<ApiRequest>();
        const key = req.headers["x-api-key"];
        if (typeof key !== "string") throw new ApiError(401, "x-api-key header required");
        const keyHash = createHash("sha256").update(key, "utf8").digest("hex");
        const row = this.db.prepare("SELECT * FROM operators WHERE api_key_hash = ?").get(keyHash) as
            OperatorRow | undefined;
        if (row === undefined) throw new ApiError(401, "unknown api key");
        if (row.active === 0) throw new ApiError(403, "operator suspended");
        req.operator = row;
        return true;
    }
}
