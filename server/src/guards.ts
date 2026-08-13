import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { ApiError } from "./engine";
import type { OperatorRow } from "./db";
import { ADMIN_KEY, DB, PLAY_RATE } from "./tokens";

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
        req.operator = row;
        return true;
    }
}
