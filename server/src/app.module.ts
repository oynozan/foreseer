import "reflect-metadata";
import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import type Database from "better-sqlite3";
import type { Engine } from "./engine";
import { ApiExceptionFilter } from "./filters";
import { ADMIN_KEY, DB, ENGINE } from "./tokens";
import {
    AdminController,
    EpochsController,
    HealthController,
    PlayController,
    RulesController,
    VerifyController,
} from "./controllers";

export interface AppOptions {
    db: Database.Database;
    engine: Engine;
    adminKey: string;
}

@Module({})
export class AppModule {
    static forRoot(options: AppOptions): DynamicModule {
        return {
            module: AppModule,
            controllers: [
                HealthController,
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
                { provide: APP_FILTER, useClass: ApiExceptionFilter },
            ],
        };
    }
}
