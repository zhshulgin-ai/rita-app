// db.js — persistence layer, built entirely on Node's built-in node:sqlite (no dependencies).
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'data', 'rita.db');
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

function uuid() {
  return crypto.randomUUID();
}

function inviteCode() {
  return crypto.randomBytes(5).toString('hex'); // 10-char code
}

module.exports = { db, uuid, inviteCode };
