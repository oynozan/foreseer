import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { ApiError } from "./engine";
import type { OperatorRow } from "./db";
import { ADMIN_KEY, DB } from "./tokens";

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

@Injectable()
export class OperatorGuard implements CanActivate {
    constructor(@Inject(DB) private readonly db: Database.Database) {}

    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<ApiRequest>();
        const key = req.headers["x-api-key"];
        if (typeof key !== "string") throw new ApiError(401, "x-api-key header required");
        const row = this.db.prepare("SELECT * FROM operators WHERE api_key = ?").get(key) as OperatorRow | undefined;
        if (row === undefined) throw new ApiError(401, "unknown api key");
        req.operator = row;
        return true;
    }
}
