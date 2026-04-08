import { db } from '../db/schema'
import { getSetting } from '../db/queries'
import { getTmdbClient, TmdbCompanySearchResult, TmdbNetworkSearchResult } from './client'

// Cache TTL: 30 days in seconds
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TmdbCompanyCacheRow {
  id: number
  company_name: string
  tmdb_company_id: number
  last_refreshed: number
}

// ── Cache queries ─────────────────────────────────────────────────────────────

function getCachedEntry(companyName: string): TmdbCompanyCacheRow | undefined {
  return db
    .prepare('SELECT * FROM tmdb_company_cache WHERE company_name = ? COLLATE NOCASE')
    .get(companyName) as TmdbCompanyCacheRow | undefined
}

function upsertCache(companyName: string, tmdbCompanyId: number): void {
  db.prepare(`
    INSERT INTO tmdb_company_cache (company_name, tmdb_company_id, last_refreshed)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(company_name) DO UPDATE SET
      tmdb_company_id = excluded.tmdb_company_id,
      last_refreshed  = excluded.last_refreshed
  `).run(companyName, tmdbCompanyId)
}

export function getAllCacheEntries(): TmdbCompanyCacheRow[] {
  return db
    .prepare('SELECT * FROM tmdb_company_cache ORDER BY company_name')
    .all() as TmdbCompanyCacheRow[]
}

export function clearTmdbCache(): void {
  db.prepare('DELETE FROM tmdb_company_cache').run()
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the TMDB company ID for a given company name.
 * Uses cache if fresh (< 30 days). Re-queries TMDB if stale or missing.
 * Falls back to cached value if TMDB is unreachable (graceful degradation).
 */
export async function getCompanyId(
  companyName: string
): Promise<number | null> {
  const cached = getCachedEntry(companyName)
  const now = Math.floor(Date.now() / 1000)

  // Return cached value if still fresh
  if (cached && now - cached.last_refreshed < CACHE_TTL_SECONDS) {
    return cached.tmdb_company_id
  }

  const apiKey = getSetting('tmdb_api_key')
  if (!apiKey) {
    // No API key configured — return stale cached value if available
    return cached?.tmdb_company_id ?? null
  }

  try {
    const client = getTmdbClient(apiKey)
    const results = await client.searchCompany(companyName)
    if (results.length === 0) return cached?.tmdb_company_id ?? null

    // Pick the best match: exact name match preferred, otherwise first result
    const exactMatch = results.find(
      (r) => r.name.toLowerCase() === companyName.toLowerCase()
    )
    const best = exactMatch ?? results[0]

    upsertCache(companyName, best.id)
    return best.id
  } catch (err) {
    console.error(`[tmdb-cache] Failed to resolve company "${companyName}":`, err)
    // Graceful degradation: return stale cached value rather than failing the sync
    return cached?.tmdb_company_id ?? null
  }
}

/**
 * Force re-resolves a company name against TMDB, ignoring TTL.
 */
export async function refreshCompanyId(
  companyName: string
): Promise<number | null> {
  const apiKey = getSetting('tmdb_api_key')
  if (!apiKey) throw new Error('TMDB API key not configured')

  const client = getTmdbClient(apiKey)
  const results = await client.searchCompany(companyName)
  if (results.length === 0) return null

  const exactMatch = results.find(
    (r) => r.name.toLowerCase() === companyName.toLowerCase()
  )
  const best = exactMatch ?? results[0]
  upsertCache(companyName, best.id)
  return best.id
}

/**
 * Re-resolves all cached company names against TMDB.
 * Used for the manual "Refresh Cache" button in Settings.
 */
export async function refreshAllCachedCompanies(): Promise<{
  refreshed: number
  failed: number
}> {
  const apiKey = getSetting('tmdb_api_key')
  if (!apiKey) throw new Error('TMDB API key not configured')

  const entries = getAllCacheEntries()
  let refreshed = 0
  let failed = 0

  for (const entry of entries) {
    try {
      await refreshCompanyId(entry.company_name)
      refreshed++
    } catch {
      failed++
    }
  }

  return { refreshed, failed }
}

/**
 * Searches TMDB for companies matching a query string.
 * Used by the CollectionEditor autocomplete.
 */
export async function searchCompanies(
  query: string
): Promise<TmdbCompanySearchResult[]> {
  const apiKey = getSetting('tmdb_api_key')
  if (!apiKey) throw new Error('TMDB API key not configured')

  const client = getTmdbClient(apiKey)
  return client.searchCompany(query)
}

/**
 * Searches TMDB for networks matching a query string.
 * Used by the CollectionEditor autocomplete.
 */
export async function searchNetworks(
  query: string
): Promise<TmdbNetworkSearchResult[]> {
  const apiKey = getSetting('tmdb_api_key')
  if (!apiKey) throw new Error('TMDB API key not configured')

  const client = getTmdbClient(apiKey)
  return client.searchNetwork(query)
}
