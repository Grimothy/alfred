import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'alfred.db')

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

export const db = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 1,
      poster_path TEXT,
      backdrop_path TEXT,
      use_tmdb INTEGER DEFAULT 0,
      tmdb_company_id INTEGER,
      tmdb_network_id INTEGER,
      tmdb_company_ids TEXT,
      tmdb_network_ids TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS collection_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
      field TEXT NOT NULL DEFAULT 'studio',
      value TEXT NOT NULL,
      content_type TEXT DEFAULT 'all',
      match_type TEXT DEFAULT 'any',
      tags TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      status TEXT,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS tmdb_company_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_name TEXT NOT NULL UNIQUE,
      tmdb_company_id INTEGER NOT NULL,
      last_refreshed INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  // Migrations — ALTER TABLE ignores columns that already exist
  const migrations = [
    'ALTER TABLE collections ADD COLUMN poster_path TEXT',
    'ALTER TABLE collections ADD COLUMN backdrop_path TEXT',
    'ALTER TABLE collections ADD COLUMN use_tmdb INTEGER DEFAULT 0',
    'ALTER TABLE collections ADD COLUMN tmdb_company_id INTEGER',
    'ALTER TABLE collections ADD COLUMN tmdb_network_id INTEGER',
    'ALTER TABLE collection_rules ADD COLUMN content_type TEXT DEFAULT "all"',
    'ALTER TABLE collection_rules ADD COLUMN match_type TEXT DEFAULT "any"',
    'ALTER TABLE collection_rules ADD COLUMN tags TEXT DEFAULT ""',
    'ALTER TABLE collections ADD COLUMN remove_from_emby INTEGER DEFAULT 1',
    'ALTER TABLE collections ADD COLUMN tmdb_company_ids TEXT',
    'ALTER TABLE collections ADD COLUMN tmdb_network_ids TEXT',
  ]
  for (const sql of migrations) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  // Seed default settings if not present
  const defaults: Record<string, string> = {
    emby_host: '',
    emby_api_key: '',
    sync_schedule: '0 3 * * *',
    sync_enabled: 'false',
    tmdb_api_key: '',
  }

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  )
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, value)
  }
}
