import "reflect-metadata";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDb } from "./db";
import { Engine } from "./engine";
import { createApp } from "./app.module";
import { rpcChain } from "./wallet";
import type { Hex } from "foreseer-sdk";

async function bootstrap(): Promise<void> {
    try {
        process.loadEnvFile();
    } catch {}
    const port = Number(process.env.PORT ?? 8787);
    const dbPath = process.env.FORESEER_DB ?? "data/foreseer.db";
    const epochSeconds = Number(process.env.FORESEER_EPOCH_SECONDS ?? 300);
    const adminKey = process.env.FORESEER_ADMIN_KEY ?? "dev-admin-key";
    const privateKey = process.env.FORESEER_TEE_KEY as Hex | undefined;
    const playLimit = Number(process.env.FORESEER_PLAY_LIMIT ?? 60);
    const playWindowSeconds = Number(process.env.FORESEER_PLAY_WINDOW_SECONDS ?? 10);
    const pricePerPlayWei = process.env.FORESEER_PRICE_PER_PLAY_WEI ?? "0";
    const chainRpc = process.env.FORESEER_CHAIN_RPC ?? "https://coston2-api.flare.network/ext/C/rpc";
    const treasury = process.env.FORESEER_TREASURY;

    // Dev defaults are public knowledge, refuse them unless asked for
    const allowDevDefaults = process.env.FORESEER_ALLOW_DEV_DEFAULTS === "1";
    const insecure: string[] = [];
    if (adminKey === "dev-admin-key") insecure.push("FORESEER_ADMIN_KEY is the published default");
    if (privateKey === undefined) insecure.push("FORESEER_TEE_KEY is unset, receipts would be signed by the public reference key");
    if (insecure.length > 0 && !allowDevDefaults) {
        for (const problem of insecure) console.error(`REFUSING TO START: ${problem}`);
        console.error("Set the variables above, or FORESEER_ALLOW_DEV_DEFAULTS=1 for a throwaway local run.");
        process.exit(1);
    }
    for (const problem of insecure) console.warn(`WARNING: ${problem}`);
    if (treasury === undefined) {
        console.warn("WARNING: FORESEER_TREASURY unset, wallet topups disabled");
    }
    if (treasury !== undefined && BigInt(pricePerPlayWei) === 0n) {
        console.warn("WARNING: treasury set but FORESEER_PRICE_PER_PLAY_WEI is 0, plays are free");
    }

    mkdirSync(dirname(dbPath), { recursive: true });
    const db = openDb(dbPath);
    const engine = new Engine({ db, epochSeconds, ...(privateKey === undefined ? {} : { privateKey }) });
    const epoch = engine.ensureEpoch();
    console.log(`epoch ${epoch.epoch_id} open, commit ${epoch.seed_commit}`);

    const timer = setInterval(() => {
        const t = engine.tick();
        if (t.closed !== null) console.log(`epoch ${t.closed} closed, epoch ${t.open} open`);
    }, 5000);

    const app = await createApp({
        db,
        engine,
        adminKey,
        playLimit,
        playWindowSeconds,
        pricePerPlayWei,
        ...(treasury === undefined ? {} : { chain: rpcChain(chainRpc, treasury) }),
    });
    await app.listen(port);
    console.log(`foreseer-server on http://localhost:${port} teeId=${engine.teeId} epoch=${epochSeconds}s`);

    function shutdown(): void {
        clearInterval(timer);
        void app.close().then(() => {
            db.close();
            process.exit(0);
        });
    }
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

void bootstrap();
