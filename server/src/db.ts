import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    api_key TEXT NOT NULL UNIQUE,
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
    PRIMARY KEY (epoch_id, bet_id)
);
CREATE INDEX IF NOT EXISTS receipts_by_seed ON receipts(epoch_id, client_seed);
`;

export function openDb(path: string): DatabaseSync {
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(SCHEMA);
    return db;
}

export interface OperatorRow {
    id: number;
    name: string;
    api_key: string;
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
}
