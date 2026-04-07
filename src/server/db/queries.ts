import { db } from './schema'

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    key,
    value
  )
}

export function setSettings(settings: Record<string, string>): void {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  )
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, value)
    }
  })
  tx()
}

// ── Collections ───────────────────────────────────────────────────────────────

export interface CollectionRow {
  id: number
  name: string
  enabled: number
  poster_path: string | null
  backdrop_path: string | null
  created_at: string
}

export interface RuleRow {
  id: number
  collection_id: number
  field: string
  value: string
  content_type: string
  match_type: string
  tags: string
}

export interface RuleInput {
  field: string
  value: string
  content_type?: string
  match_type?: string
  tags?: string
}

export interface CollectionWithRules extends CollectionRow {
  rules: RuleRow[]
}

export function getCollections(): CollectionWithRules[] {
  const collections = db
    .prepare('SELECT * FROM collections ORDER BY name')
    .all() as CollectionRow[]
  const rules = db.prepare('SELECT * FROM collection_rules').all() as RuleRow[]

  return collections.map((c) => ({
    ...c,
    rules: rules.filter((r) => r.collection_id === c.id),
  }))
}

export function getCollectionById(id: number): CollectionWithRules | undefined {
  const c = db
    .prepare('SELECT * FROM collections WHERE id = ?')
    .get(id) as CollectionRow | undefined
  if (!c) return undefined
  const rules = db
    .prepare('SELECT * FROM collection_rules WHERE collection_id = ?')
    .all(id) as RuleRow[]
  return { ...c, rules }
}

export function createCollection(
  name: string,
  rules: RuleInput[]
): CollectionWithRules {
  const tx = db.transaction(() => {
    const result = db
      .prepare('INSERT INTO collections (name) VALUES (?)')
      .run(name)
    const id = result.lastInsertRowid as number
    const stmt = db.prepare(
      'INSERT INTO collection_rules (collection_id, field, value, content_type, match_type, tags) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const rule of rules) {
      stmt.run(
        id,
        rule.field,
        rule.value,
        rule.content_type ?? 'all',
        rule.match_type ?? 'any',
        rule.tags ?? ''
      )
    }
    return id
  })
  const id = tx()
  return getCollectionById(id)!
}

export function updateCollection(
  id: number,
  name: string,
  rules: RuleInput[],
  enabled?: number
): CollectionWithRules | undefined {
  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE collections SET name = ?' +
        (enabled !== undefined ? ', enabled = ?' : '') +
        ' WHERE id = ?'
    ).run(...(enabled !== undefined ? [name, enabled, id] : [name, id]))
    db.prepare('DELETE FROM collection_rules WHERE collection_id = ?').run(id)
    const stmt = db.prepare(
      'INSERT INTO collection_rules (collection_id, field, value, content_type, match_type, tags) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const rule of rules) {
      stmt.run(
        id,
        rule.field,
        rule.value,
        rule.content_type ?? 'all',
        rule.match_type ?? 'any',
        rule.tags ?? ''
      )
    }
  })
  tx()
  return getCollectionById(id)
}

export function toggleCollection(id: number, enabled: boolean): void {
  db.prepare('UPDATE collections SET enabled = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    id
  )
}

export function deleteCollection(id: number): void {
  db.prepare('DELETE FROM collections WHERE id = ?').run(id)
}

export function setCollectionImagePath(
  id: number,
  imageType: 'poster' | 'backdrop',
  filePath: string | null
): void {
  const col = imageType === 'poster' ? 'poster_path' : 'backdrop_path'
  db.prepare(`UPDATE collections SET ${col} = ? WHERE id = ?`).run(filePath, id)
}

// ── Sync History ──────────────────────────────────────────────────────────────

export interface SyncHistoryRow {
  id: number
  started_at: string
  completed_at: string | null
  status: string
  summary: string | null
}

export function startSyncRecord(): number {
  const result = db
    .prepare(
      "INSERT INTO sync_history (status) VALUES ('running')"
    )
    .run()
  return result.lastInsertRowid as number
}

export function completeSyncRecord(
  id: number,
  status: 'success' | 'error',
  summary: object
): void {
  db.prepare(
    'UPDATE sync_history SET completed_at = CURRENT_TIMESTAMP, status = ?, summary = ? WHERE id = ?'
  ).run(status, JSON.stringify(summary), id)
}

export function getSyncHistory(limit = 20): SyncHistoryRow[] {
  return db
    .prepare(
      'SELECT * FROM sync_history ORDER BY started_at DESC LIMIT ?'
    )
    .all(limit) as SyncHistoryRow[]
}

export function getLatestSync(): SyncHistoryRow | undefined {
  return db
    .prepare('SELECT * FROM sync_history ORDER BY started_at DESC LIMIT 1')
    .get() as SyncHistoryRow | undefined
}
