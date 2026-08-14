// Consistent online backup of the epoch database, WAL included.
// Usage: node scripts/backup.mjs [outDir]   (default: backups/)
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.FORESEER_DB ?? "data/foreseer.db";
const outDir = process.argv[2] ?? "backups";
const keep = Number(process.env.FORESEER_BACKUP_KEEP ?? 24);

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = join(outDir, `foreseer-${stamp}.db`);

// .backup() checkpoints the WAL, a file copy does not
const db = new Database(dbPath, { readonly: true });
await db.backup(target);
db.close();

const written = statSync(target).size;
console.log(`backup written: ${target} (${(written / 1024).toFixed(1)} KiB)`);

const backups = readdirSync(outDir)
    .filter((f) => f.startsWith("foreseer-") && f.endsWith(".db"))
    .sort()
    .reverse();
for (const stale of backups.slice(keep)) {
    unlinkSync(join(outDir, stale));
    console.log(`pruned ${stale}`);
}

// A backup nobody restored is a hope, not a backup
const check = new Database(target, { readonly: true });
const epochs = check.prepare("SELECT COUNT(*) AS c FROM epochs").get();
const receipts = check.prepare("SELECT COUNT(*) AS c FROM receipts").get();
const integrity = check.pragma("integrity_check", { simple: true });
check.close();
if (integrity !== "ok") {
    console.error(`integrity check FAILED: ${integrity}`);
    process.exit(1);
}
console.log(`verified: integrity ok, ${epochs.c} epochs, ${receipts.c} receipts`);
