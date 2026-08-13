import "reflect-metadata";
import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type Database from "better-sqlite3";
import type { Engine } from "./engine";
import { ApiExceptionFilter } from "./filters";
import { ADMIN_KEY, DB, ENGINE, PLAY_RATE, PRICE_PER_PLAY_WEI } from "./tokens";
import {
    AdminController,
    EpochsController,
    HealthController,
    MetricsController,
    PlayController,
    RulesController,
    VerifyController,
} from "./controllers";

export const BODY_LIMIT_BYTES = 65536;

export interface AppOptions {
    db: Database.Database;
    engine: Engine;
    adminKey: string;
    playLimit?: number;
    playWindowSeconds?: number;
    pricePerPlayWei?: string;
}

@Module({})
export class AppModule {
    static forRoot(options: AppOptions): DynamicModule {
        return {
            module: AppModule,
            controllers: [
                HealthController,
                MetricsController,
                AdminController,
                RulesController,
                PlayController,
                EpochsController,
                VerifyController,
            ],
            providers: [
                { provide: DB, useValue: options.db },
                { provide: ENGINE, useValue: options.engine },
                { provide: ADMIN_KEY, useValue: options.adminKey },
                {
                    provide: PLAY_RATE,
                    useValue: { limit: options.playLimit ?? 60, windowSeconds: options.playWindowSeconds ?? 10 },
                },
                { provide: PRICE_PER_PLAY_WEI, useValue: BigInt(options.pricePerPlayWei ?? "0").toString() },
                { provide: APP_FILTER, useClass: ApiExceptionFilter },
            ],
        };
    }
}

export async function createApp(options: AppOptions): Promise<NestExpressApplication> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(options), {
        logger: false,
        bodyParser: false,
    });
    app.enableCors();
    app.useBodyParser("json", { limit: BODY_LIMIT_BYTES });
    return app;
}
