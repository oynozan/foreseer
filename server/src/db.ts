import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    api_key_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (
    rule_hash TEXT PRIMARY KEY,
    operator_id INTEGER NOT NULL REFERENCES operators(id),
    rule_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS epochs (
    epoch_id INTEGER PRIMARY KEY,
    seed_commit TEXT NOT NULL,
    server_seed TEXT NOT NULL,
    opened_at INTEGER NOT NULL,
    closed_at INTEGER,
    merkle_root TEXT,
    receipt_count INTEGER,
    close_signature TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    wallet TEXT NOT NULL,
    expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deposits (
    tx_hash TEXT PRIMARY KEY,
    operator_id INTEGER NOT NULL REFERENCES operators(id),
    from_wallet TEXT NOT NULL,
    amount_wei TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS receipts (
    epoch_id INTEGER NOT NULL,
    bet_id INTEGER NOT NULL,
    operator_id INTEGER NOT NULL,
    client_seed TEXT NOT NULL,
    nonce INTEGER NOT NULL,
    rule_hash TEXT NOT NULL,
    draws TEXT NOT NULL,
    win INTEGER NOT NULL,
    payout_bp INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    signature TEXT NOT NULL,
    price_wei TEXT NOT NULL DEFAULT '0',
    PRIMARY KEY (epoch_id, bet_id)
);
CREATE INDEX IF NOT EXISTS receipts_by_seed ON receipts(epoch_id, client_seed);
`;

export function openDb(path: string): Database.Database {
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    const cols = db.prepare("PRAGMA table_info(operators)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "owner_wallet")) {
        db.exec("ALTER TABLE operators ADD COLUMN owner_wallet TEXT");
    }
    if (!cols.some((c) => c.name === "active")) {
        db.exec("ALTER TABLE operators ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
    }
    const receiptCols = db.prepare("PRAGMA table_info(receipts)").all() as { name: string }[];
    if (!receiptCols.some((c) => c.name === "price_wei")) {
        db.exec("ALTER TABLE receipts ADD COLUMN price_wei TEXT NOT NULL DEFAULT '0'");
    }
    return db;
}

export interface OperatorRow {
    id: number;
    name: string;
    api_key_hash: string;
    created_at: number;
    owner_wallet: string | null;
    active: number;
}

export interface DepositRow {
    tx_hash: string;
    operator_id: number;
    from_wallet: string;
    amount_wei: string;
    created_at: number;
}

export interface RuleRow {
    rule_hash: string;
    operator_id: number;
    rule_json: string;
    created_at: number;
}

export interface EpochRow {
    epoch_id: number;
    seed_commit: string;
    server_seed: string;
    opened_at: number;
    closed_at: number | null;
    merkle_root: string | null;
    receipt_count: number | null;
    close_signature: string | null;
}

export interface ReceiptRow {
    epoch_id: number;
    bet_id: number;
    operator_id: number;
    client_seed: string;
    nonce: number;
    rule_hash: string;
    draws: string;
    win: number;
    payout_bp: number;
    timestamp: number;
    signature: string;
    price_wei: string;
}
