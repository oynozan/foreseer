import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDb } from "./db.js";
import { Engine } from "./engine.js";
import { createApi } from "./api.js";
import type { Hex } from "foreseer.ts";

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.FORESEER_DB ?? "data/foreseer.db";
const epochSeconds = Number(process.env.FORESEER_EPOCH_SECONDS ?? 300);
const adminKey = process.env.FORESEER_ADMIN_KEY ?? "dev-admin-key";
const privateKey = process.env.FORESEER_TEE_KEY as Hex | undefined;

if (adminKey === "dev-admin-key") {
    console.warn("WARNING: using the default admin key, set FORESEER_ADMIN_KEY");
}
if (privateKey === undefined) {
    console.warn("WARNING: using the public reference test key, set FORESEER_TEE_KEY");
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

const server = createApi({ db, engine, adminKey });
server.listen(port, () => {
    console.log(`foreseer-server on http://localhost:${port} teeId=${engine.teeId} epoch=${epochSeconds}s`);
});

function shutdown(): void {
    clearInterval(timer);
    server.close(() => {
        db.close();
        process.exit(0);
    });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
