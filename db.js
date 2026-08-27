// db.js — persistence layer, built entirely on Node's built-in node:sqlite (no dependencies).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// DATA_DIR lets us point at a persistent Railway volume (e.g. "/data") in production;
// without it, everything here lives on the container's ephemeral disk and is wiped on redeploy.
const DATA_ROOT = process.env.DATA_DIR || __dirname;
const DATA_DIR = path.join(DATA_ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true }); // some deploy methods (e.g. GitHub's web upload) drop empty dirs

const DB_PATH = path.join(DATA_DIR, 'rita.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    birthday_month INTEGER,
    birthday_day INTEGER,
    bio TEXT DEFAULT '',
    invite_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, friend_id)
  );

  CREATE TABLE IF NOT EXISTS moments (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    photo_path TEXT,
    rating INTEGER NOT NULL,
    note TEXT DEFAULT '',
    location TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    moment_id TEXT NOT NULL,
    claimer_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(moment_id, claimer_id)
  );
`);

// Migration: older deployments may not have avatar_path yet. Safe to re-run.
try {
  db.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT DEFAULT \'\'');
} catch {
  // column already exists — fine
}

// Migration: older deployments may not have moments.link yet. Safe to re-run.
try {
  db.exec('ALTER TABLE moments ADD COLUMN link TEXT DEFAULT \'\'');
} catch {
  // column already exists — fine
}

function uuid() {
  return crypto.randomUUID();
}

function inviteCode() {
  return crypto.randomBytes(5).toString('hex'); // 10-char code
}

module.exports = { db, uuid, inviteCode };
