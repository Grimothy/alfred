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
  use_tmdb: number
  tmdb_company_id: number | null
  tmdb_network_id: number | null
  tmdb_company_ids: string | null
  tmdb_network_ids: string | null
  remove_from_emby: number
  include_tmdb_matches: number
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
  rules: RuleInput[],
  useTmdb = 0,
  tmdbCompanyId: number | null = null,
  tmdbNetworkId: number | null = null,
  tmdbCompanyIds: string | null = null,
  tmdbNetworkIds: string | null = null,
  removeFromEmby = 1
): CollectionWithRules {
  const tx = db.transaction(() => {
    const result = db
      .prepare('INSERT INTO collections (name, use_tmdb, tmdb_company_id, tmdb_network_id, tmdb_company_ids, tmdb_network_ids, remove_from_emby) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, useTmdb, tmdbCompanyId, tmdbNetworkId, tmdbCompanyIds, tmdbNetworkIds, removeFromEmby)
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
  enabled?: number,
  useTmdb?: number,
  tmdbCompanyId?: number | null,
  tmdbNetworkId?: number | null,
  tmdbCompanyIds?: string | null,
  tmdbNetworkIds?: string | null,
  removeFromEmby?: number,
  includeTmdbMatches?: number
): CollectionWithRules | undefined {
  const tx = db.transaction(() => {
    const setParts = ['name = ?']
    const values: unknown[] = [name]

    if (enabled !== undefined) {
      setParts.push('enabled = ?')
      values.push(enabled)
    }
    if (useTmdb !== undefined) {
      setParts.push('use_tmdb = ?')
      values.push(useTmdb)
    }
    if (tmdbCompanyId !== undefined) {
      setParts.push('tmdb_company_id = ?')
      values.push(tmdbCompanyId)
    }
    if (tmdbNetworkId !== undefined) {
      setParts.push('tmdb_network_id = ?')
      values.push(tmdbNetworkId)
    }
    if (tmdbCompanyIds !== undefined) {
      setParts.push('tmdb_company_ids = ?')
      values.push(tmdbCompanyIds)
    }
    if (tmdbNetworkIds !== undefined) {
      setParts.push('tmdb_network_ids = ?')
      values.push(tmdbNetworkIds)
    }
    if (removeFromEmby !== undefined) {
      setParts.push('remove_from_emby = ?')
      values.push(removeFromEmby)
    }
    if (includeTmdbMatches !== undefined) {
      setParts.push('include_tmdb_matches = ?')
      values.push(includeTmdbMatches)
    }

    values.push(id)
    db.prepare(`UPDATE collections SET ${setParts.join(', ')} WHERE id = ?`).run(...values)
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

export function toggleTmdbMatches(id: number, include: boolean): void {
  db.prepare('UPDATE collections SET include_tmdb_matches = ? WHERE id = ?').run(
    include ? 1 : 0,
    id
  )
}

// ── TMDB Discovery Cache ────────────────────────────────────────────────────────

interface TmdbDiscoveryCacheRow {
  collection_id: number
  items_json: string
  discovered_at: number
}

export function getDiscoveryCache(collectionId: number): TmdbDiscoveryCacheRow | undefined {
  return db
    .prepare('SELECT * FROM tmdb_discovery_cache WHERE collection_id = ?')
    .get(collectionId) as TmdbDiscoveryCacheRow | undefined
}

export function setDiscoveryCache(collectionId: number, itemsJson: string): void {
  db.prepare(`
    INSERT INTO tmdb_discovery_cache (collection_id, items_json, discovered_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(collection_id) DO UPDATE SET
      items_json    = excluded.items_json,
      discovered_at = excluded.discovered_at
  `).run(collectionId, itemsJson)
}

export function invalidateDiscoveryCache(collectionId: number): void {
  db.prepare('DELETE FROM tmdb_discovery_cache WHERE collection_id = ?').run(collectionId)
}

// ── TMDB Item Detail Cache ────────────────────────────────────────────────────

interface TmdbItemDetailRow {
  tmdb_id: number
  type: string
  details_json: string
  fetched_at: number
}

const ITEM_DETAIL_TTL = 7 * 24 * 60 * 60 // 7 days in seconds

export function getTmdbItemDetail(
  tmdbId: number,
  type: 'movie' | 'tv'
): TmdbItemDetailRow | undefined {
  const row = db
    .prepare('SELECT * FROM tmdb_item_details WHERE tmdb_id = ? AND type = ?')
    .get(tmdbId, type) as TmdbItemDetailRow | undefined

  if (!row) return undefined

  // Check TTL
  const now = Math.floor(Date.now() / 1000)
  if (now - row.fetched_at > ITEM_DETAIL_TTL) return undefined

  return row
}

export function setTmdbItemDetail(
  tmdbId: number,
  type: 'movie' | 'tv',
  detailsJson: string
): void {
  db.prepare(`
    INSERT INTO tmdb_item_details (tmdb_id, type, details_json, fetched_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(tmdb_id, type) DO UPDATE SET
      details_json = excluded.details_json,
      fetched_at   = excluded.fetched_at
  `).run(tmdbId, type, detailsJson)
}

export function getTmdbItemDetailBatch(
  tmdbIds: number[],
  type: 'movie' | 'tv'
): Map<number, string> {
  if (tmdbIds.length === 0) return new Map()
  const now = Math.floor(Date.now() / 1000)
  const placeholders = tmdbIds.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT tmdb_id, details_json, fetched_at
    FROM tmdb_item_details
    WHERE tmdb_id IN (${placeholders}) AND type = ?
  `).all(...tmdbIds, type) as TmdbItemDetailRow[]

  const result = new Map<number, string>()
  for (const row of rows) {
    if (now - row.fetched_at <= ITEM_DETAIL_TTL) {
      result.set(row.tmdb_id, row.details_json)
    }
  }
  return result
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
