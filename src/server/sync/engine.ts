import fs from 'fs'
import path from 'path'
import { getEmbyClient, EmbyItem } from '../emby/client'
import {
  getAllSettings,
  getCollections,
  startSyncRecord,
  completeSyncRecord,
  CollectionWithRules,
} from '../db/queries'
import { getTmdbClient } from '../tmdb/client'

// Where uploaded images are stored on disk
export const IMAGES_DIR = process.env.IMAGES_DIR ||
  path.join(process.cwd(), 'data', 'images')

export interface CollectionSyncResult {
  collectionId: string
  name: string
  added: number
  removed: number
  total: number
  error?: string
}

export interface SyncSummary {
  collections: CollectionSyncResult[]
  totalAdded: number
  totalRemoved: number
  durationMs: number
}

let syncRunning = false

export function isSyncRunning(): boolean {
  return syncRunning
}

export async function runSync(): Promise<SyncSummary> {
  if (syncRunning) {
    throw new Error('Sync already in progress')
  }

  syncRunning = true
  const startedAt = Date.now()
  const syncId = startSyncRecord()

  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']

  if (!host || !apiKey) {
    syncRunning = false
    completeSyncRecord(syncId, 'error', {
      error: 'Emby host or API key not configured',
    })
    throw new Error('Emby host or API key not configured')
  }

  const client = getEmbyClient(host, apiKey)
  const results: CollectionSyncResult[] = []

  try {
    // Load all media items once (shared across all collection syncs)
    const allItems = await client.getItems(['Movie', 'Series'])
    const embyCollections = await client.getCollections()
    const embyCollectionMap = new Map<string, string>(
      embyCollections.map((c) => [c.Name.toLowerCase(), c.Id])
    )

    // Load Alfred collections with rules
    const alfredCollections = getCollections().filter((c) => c.enabled === 1)

    const tmdbApiKey = settings['tmdb_api_key']

    for (const collection of alfredCollections) {
      let result: CollectionSyncResult
      const isTmdb = collection.use_tmdb === 1 &&
        (collection.tmdb_company_id != null || collection.tmdb_network_id != null ||
         collection.tmdb_company_ids != null || collection.tmdb_network_ids != null)
      if (isTmdb) {
        if (!tmdbApiKey) {
          result = {
            collectionId: '',
            name: collection.name,
            added: 0,
            removed: 0,
            total: 0,
            error: 'TMDB API key not configured — skipping TMDB collection',
          }
        } else {
          result = await syncTmdbCollection(
            client,
            collection,
            allItems,
            embyCollectionMap,
            tmdbApiKey
          )
        }
      } else {
        result = await syncCollection(
          client,
          collection,
          allItems,
          embyCollectionMap
        )
      }
      results.push(result)
    }

    const summary: SyncSummary = {
      collections: results,
      totalAdded: results.reduce((s, r) => s + r.added, 0),
      totalRemoved: results.reduce((s, r) => s + r.removed, 0),
      durationMs: Date.now() - startedAt,
    }

    completeSyncRecord(syncId, 'success', summary)
    return summary
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    completeSyncRecord(syncId, 'error', { error: message })
    throw err
  } finally {
    syncRunning = false
  }
}

const STREAMING_COMPETITORS = [
  'netflix',
  'hulu',
  'apple tv+',
  'apple tv plus',
  'amazon prime video',
  'amazon studios',
  'hbo',
  'paramount+',
  'peacock',
  'disney+',
  'showtime',
  'starz',
  'criterion channel',
  'mubi',
  'tubi',
  'pluto tv',
  'amc+',
  'bbc iplayer',
  'itv hub',
  'now tv',
  'wow',
  'curiositystream',
  'discovery+',
]

function isStreamingCompetitor(studioName: string): boolean {
  const lower = studioName.toLowerCase()
  return STREAMING_COMPETITORS.some((comp) => lower.includes(comp))
}

async function syncCollection(
  client: ReturnType<typeof getEmbyClient>,
  collection: CollectionWithRules,
  allItems: EmbyItem[],
  embyCollectionMap: Map<string, string>
): Promise<CollectionSyncResult> {
  const studioRules = collection.rules.filter((r) => r.field === 'studio')
  const genreRules = collection.rules.filter((r) => r.field === 'genre')
  const tagRules = collection.rules.filter((r) => r.field === 'tag')

  const contentType = studioRules[0]?.content_type ?? 'all'

  const matchedItems = allItems.filter((item) => {
    if (contentType === 'movie' && item.Type !== 'Movie') return false
    if (contentType === 'series' && item.Type !== 'Series') return false

    const itemStudios = item.Studios.map((s) => s.Name.toLowerCase())
    const itemGenres = (item.Genres ?? []).map((g) => g.toLowerCase())
    const itemTags = (item.Tags ?? []).map((t) => t.toLowerCase())

    const primaryStudioRules = studioRules.filter((r) => r.match_type === 'primary')
    const secondarySafeRules = studioRules.filter((r) => r.match_type === 'secondary_safe')
    const anyStudioRules = studioRules.filter((r) => r.match_type === 'any' || !r.match_type)

    if (primaryStudioRules.length > 0) {
      const primaryStudio = itemStudios[0]
      if (!primaryStudio || !primaryStudioRules.some((r) => r.value.toLowerCase() === primaryStudio)) {
        return false
      }
    }

    if (secondarySafeRules.length > 0) {
      const primaryStudio = itemStudios[0]
      const secondaryStudio = itemStudios[1]

      const hasPrimaryMatch = secondarySafeRules.some((r) => r.value.toLowerCase() === primaryStudio)
      const hasSecondaryMatch = secondaryStudio && secondarySafeRules.some((r) => r.value.toLowerCase() === secondaryStudio)
      const primaryIsNotStreaming = primaryStudio && !isStreamingCompetitor(primaryStudio)

      if (!hasPrimaryMatch && !(hasSecondaryMatch && primaryIsNotStreaming)) {
        return false
      }
    }

    if (anyStudioRules.length > 0) {
      if (!anyStudioRules.some((r) => itemStudios.some((s) => s === r.value.toLowerCase()))) {
        return false
      }
    }

    if (genreRules.length > 0) {
      if (!genreRules.some((r) => itemGenres.some((g) => g === r.value.toLowerCase()))) {
        return false
      }
    }

    if (tagRules.length > 0) {
      for (const rule of tagRules) {
        const requiredTags = rule.tags
          ? rule.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
          : []
        if (requiredTags.length > 0 && !requiredTags.every((rt: string) => itemTags.some((t) => t === rt))) {
          return false
        }
      }
    }

    const hasStudioRules = studioRules.length > 0
    const hasGenreRules = genreRules.length > 0
    const hasTagRules = tagRules.length > 0

    if (!hasStudioRules && !hasGenreRules && !hasTagRules) return false
    return true
  })

  const matchedIds = matchedItems.map((i) => i.Id)

  let embyCollectionId = embyCollectionMap.get(collection.name.toLowerCase())
  let added = 0
  let removed = 0

  try {
    // If we have a stored ID, verify it still exists in Emby
    // (user may have deleted the collection manually)
    if (embyCollectionId && !(await client.collectionExists(embyCollectionId))) {
      embyCollectionId = undefined
      embyCollectionMap.delete(collection.name.toLowerCase())
    }

    if (!embyCollectionId) {
      // Create new collection in Emby
      if (matchedIds.length > 0) {
        embyCollectionId = await client.createCollection(
          collection.name,
          matchedIds
        )
        added = matchedIds.length
        embyCollectionMap.set(collection.name.toLowerCase(), embyCollectionId)
      }
    } else if (collection.remove_from_emby === 1) {
      // Remove mode: clear all items then re-add currently matched ones
      const clearedCount = await client.clearCollection(embyCollectionId)
      if (matchedIds.length > 0) {
        await client.addToCollection(embyCollectionId, matchedIds)
      }
      added = matchedIds.length
      removed = clearedCount
    } else {
      // Additive mode: only add items not already in the collection
      const currentIds = await client.getCollectionItemIds(embyCollectionId)
      const currentSet = new Set(currentIds)
      const newIds = matchedIds.filter((id) => !currentSet.has(id))
      if (newIds.length > 0) {
        await client.addToCollection(embyCollectionId, newIds)
      }
      added = newIds.length
      removed = 0
    }

    // Push images to Emby if they exist on disk
    if (embyCollectionId) {
      await pushImages(client, embyCollectionId, collection)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      collectionId: embyCollectionId ?? '',
      name: collection.name,
      added: 0,
      removed: 0,
      total: matchedIds.length,
      error: message,
    }
  }

  return {
    collectionId: embyCollectionId ?? '',
    name: collection.name,
    added,
    removed,
    total: matchedIds.length,
  }
}

// ── TMDB-backed collection sync ───────────────────────────────────────────────

/**
 * Syncs a collection whose membership is determined by TMDB data.
 * - Movies: discovered via production company (`tmdb_company_id`)
 * - TV shows: discovered via network (`tmdb_network_id`)
 * At least one of company or network must be set.
 * Results from both sources are unioned before matching against the Emby library.
 */
interface TmdbIdEntry {
  id: number
  name: string
}

function parseTmdbIds(json: string | null): number[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as TmdbIdEntry[]
    return parsed.map((e) => e.id)
  } catch {
    return []
  }
}

async function syncTmdbCollection(
  client: ReturnType<typeof getEmbyClient>,
  collection: CollectionWithRules,
  allItems: EmbyItem[],
  embyCollectionMap: Map<string, string>,
  tmdbApiKey: string
): Promise<CollectionSyncResult> {
  let movie_imdbIds: Set<string>
  let movie_tvdbIds: Set<string>
  let tv_imdbIds: Set<string>
  let tv_tvdbIds: Set<string>
  try {
    const tmdb = getTmdbClient(tmdbApiKey)

    const companyIds = parseTmdbIds(collection.tmdb_company_ids)
    if (collection.tmdb_company_id != null && !companyIds.includes(collection.tmdb_company_id)) {
      companyIds.push(collection.tmdb_company_id)
    }
    const networkIds = parseTmdbIds(collection.tmdb_network_ids)
    if (collection.tmdb_network_id != null && !networkIds.includes(collection.tmdb_network_id)) {
      networkIds.push(collection.tmdb_network_id)
    }

    const moviePromise = companyIds.length > 0
      ? tmdb.discoverMoviesByCompany(companyIds)
      : Promise.resolve([])

    const tvNetworkPromise = networkIds.length > 0
      ? tmdb.discoverTvByNetwork(networkIds)
      : Promise.resolve([])

    const tvCompanyPromise = companyIds.length > 0
      ? tmdb.discoverTvByCompany(companyIds)
      : Promise.resolve([])

    const [movies, networkShows, companyShows] = await Promise.all([moviePromise, tvNetworkPromise, tvCompanyPromise])

    const shows = [...networkShows, ...companyShows]

    movie_imdbIds = new Set<string>()
    movie_tvdbIds = new Set<string>()
    tv_imdbIds = new Set<string>()
    tv_tvdbIds = new Set<string>()

    for (const m of movies) {
      if (m.imdb_id) movie_imdbIds.add(m.imdb_id)
    }
    for (const s of shows) {
      const imdbId = s.external_ids?.imdb_id
      if (imdbId) tv_imdbIds.add(imdbId)
      const tvdbId = s.external_ids?.tvdb_id
      if (tvdbId != null) tv_tvdbIds.add(String(tvdbId))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      collectionId: '',
      name: collection.name,
      added: 0,
      removed: 0,
      total: 0,
      error: `TMDB fetch failed: ${message}`,
    }
  }

  // Match Emby items using IMDb ID first, falling back to TVDB ID.
  // Emby is inconsistent with casing: Imdb/IMDB, Tvdb/TVDB.
  // Only match if the Emby item type (Movie/Series) matches what we discovered.
  const matchedItems = allItems.filter((item) => {
    const isMovie = item.Type === 'Movie'
    const isSeries = item.Type === 'Series'
    const imdb = item.ProviderIds?.Imdb ?? item.ProviderIds?.IMDB
    const tvdb = item.ProviderIds?.Tvdb ?? item.ProviderIds?.TVDB

    if (isMovie) {
      if (imdb && movie_imdbIds.has(imdb)) return true
      if (tvdb && movie_tvdbIds.has(tvdb)) return true
    }
    if (isSeries) {
      if (imdb && tv_imdbIds.has(imdb)) return true
      if (tvdb && tv_tvdbIds.has(tvdb)) return true
    }
    return false
  })
  const matchedIds = matchedItems.map((i) => i.Id)

  let embyCollectionId = embyCollectionMap.get(collection.name.toLowerCase())
  let added = 0
  let removed = 0

  try {
    if (embyCollectionId && !(await client.collectionExists(embyCollectionId))) {
      embyCollectionId = undefined
      embyCollectionMap.delete(collection.name.toLowerCase())
    }

    if (!embyCollectionId) {
      if (matchedIds.length > 0) {
        embyCollectionId = await client.createCollection(collection.name, matchedIds)
        added = matchedIds.length
        embyCollectionMap.set(collection.name.toLowerCase(), embyCollectionId)
      }
    } else if (collection.remove_from_emby === 1) {
      const clearedCount = await client.clearCollection(embyCollectionId)
      if (matchedIds.length > 0) {
        await client.addToCollection(embyCollectionId, matchedIds)
      }
      added = matchedIds.length
      removed = clearedCount
    } else {
      const currentIds = await client.getCollectionItemIds(embyCollectionId)
      const currentSet = new Set(currentIds)
      const newIds = matchedIds.filter((id) => !currentSet.has(id))
      if (newIds.length > 0) {
        await client.addToCollection(embyCollectionId, newIds)
      }
      added = newIds.length
      removed = 0
    }

    if (embyCollectionId) {
      await pushImages(client, embyCollectionId, collection)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      collectionId: embyCollectionId ?? '',
      name: collection.name,
      added: 0,
      removed: 0,
      total: matchedIds.length,
      error: message,
    }
  }

  return {
    collectionId: embyCollectionId ?? '',
    name: collection.name,
    added,
    removed,
    total: matchedIds.length,
  }
}

// ── Image push ────────────────────────────────────────────────────────────────

async function pushImages(
  client: ReturnType<typeof getEmbyClient>,
  embyCollectionId: string,
  collection: CollectionWithRules
): Promise<void> {
  const imageMap: { col: 'poster_path' | 'backdrop_path'; type: 'Primary' | 'Backdrop' }[] = [
    { col: 'poster_path', type: 'Primary' },
    { col: 'backdrop_path', type: 'Backdrop' },
  ]
  for (const { col, type } of imageMap) {
    const filePath = collection[col]
    if (!filePath) continue
    if (!fs.existsSync(filePath)) continue
    const ext = path.extname(filePath).toLowerCase()
    const mime =
      ext === '.png' ? 'image/png' :
      ext === '.webp' ? 'image/webp' : 'image/jpeg'
    try {
      await client.setCollectionImage(embyCollectionId, type, filePath, mime)
    } catch (err) {
      // Image upload failure is non-fatal — log and continue
      console.error(`[sync] Failed to set ${type} image for "${collection.name}":`, err)
    }
  }
}

// ── Preview (dry run) ─────────────────────────────────────────────────────────

interface PreviewRule {
  field: string
  value: string
  content_type?: string
  match_type?: string
  tags?: string
}

export async function previewCollection(
  studioValues: string[],
  genreValues: string[]
): Promise<EmbyItem[]> {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']

  if (!host || !apiKey) throw new Error('Emby not configured')

  const client = getEmbyClient(host, apiKey)
  const allItems = await client.getItems(['Movie', 'Series'])

  const svLower = studioValues.map((s) => s.toLowerCase())
  const gvLower = genreValues.map((g) => g.toLowerCase())

  const hasStudioRules = svLower.length > 0
  const hasGenreRules = gvLower.length > 0

  return allItems.filter((item) => {
    const itemStudios = item.Studios.map((s) => s.Name.toLowerCase())
    const itemGenres = (item.Genres ?? []).map((g) => g.toLowerCase())

    const studioMatch = hasStudioRules && svLower.some((sv) => itemStudios.includes(sv))
    const genreMatch = hasGenreRules && gvLower.some((gv) => itemGenres.includes(gv))

    if (hasStudioRules && hasGenreRules) return studioMatch && genreMatch
    if (hasStudioRules) return studioMatch
    if (hasGenreRules) return genreMatch
    return false
  })
}

/**
 * Preview which Emby library items a TMDB-backed collection would contain,
 * without making any writes to Emby. Throws on TMDB or Emby fetch failure.
 */
export async function previewTmdbCollection(
  collection: CollectionWithRules
): Promise<EmbyItem[]> {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']
  const tmdbApiKey = settings['tmdb_api_key']

  if (!host || !apiKey) throw new Error('Emby not configured')
  if (!tmdbApiKey) throw new Error('TMDB API key not configured')

  const client = getEmbyClient(host, apiKey)
  const tmdb = getTmdbClient(tmdbApiKey)

  const companyIds = parseTmdbIds(collection.tmdb_company_ids)
  if (collection.tmdb_company_id != null && !companyIds.includes(collection.tmdb_company_id)) {
    companyIds.push(collection.tmdb_company_id)
  }
  const networkIds = parseTmdbIds(collection.tmdb_network_ids)
  if (collection.tmdb_network_id != null && !networkIds.includes(collection.tmdb_network_id)) {
    networkIds.push(collection.tmdb_network_id)
  }

  const moviePromise = companyIds.length > 0
    ? tmdb.discoverMoviesByCompany(companyIds)
    : Promise.resolve([])

  const tvNetworkPromise = networkIds.length > 0
    ? tmdb.discoverTvByNetwork(networkIds)
    : Promise.resolve([])

  const tvCompanyPromise = companyIds.length > 0
    ? tmdb.discoverTvByCompany(companyIds)
    : Promise.resolve([])

  const [allItems, [movies, networkShows, companyShows]] = await Promise.all([
    client.getItems(['Movie', 'Series']),
    Promise.all([moviePromise, tvNetworkPromise, tvCompanyPromise]),
  ])

  const shows = [...networkShows, ...companyShows]

  const tmdbImdbIds = new Set<string>()
  const movie_imdbIds = new Set<string>()
  const movie_tvdbIds = new Set<string>()
  const tv_imdbIds = new Set<string>()
  const tv_tvdbIds = new Set<string>()

  for (const m of movies) {
    if (m.imdb_id) movie_imdbIds.add(m.imdb_id)
  }
  for (const s of shows) {
    const imdbId = s.external_ids?.imdb_id
    if (imdbId) tv_imdbIds.add(imdbId)
    const tvdbId = s.external_ids?.tvdb_id
    if (tvdbId != null) tv_tvdbIds.add(String(tvdbId))
  }

  return allItems.filter((item) => {
    const isMovie = item.Type === 'Movie'
    const isSeries = item.Type === 'Series'
    const imdb = item.ProviderIds?.Imdb ?? item.ProviderIds?.IMDB
    const tvdb = item.ProviderIds?.Tvdb ?? item.ProviderIds?.TVDB

    if (isMovie) {
      if (imdb && movie_imdbIds.has(imdb)) return true
      if (tvdb && movie_tvdbIds.has(tvdb)) return true
    }
    if (isSeries) {
      if (imdb && tv_imdbIds.has(imdb)) return true
      if (tvdb && tv_tvdbIds.has(tvdb)) return true
    }
    return false
  })
}

export async function previewCollectionWithRules(
  rules: PreviewRule[]
): Promise<EmbyItem[]> {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']

  if (!host || !apiKey) throw new Error('Emby not configured')

  const client = getEmbyClient(host, apiKey)
  const allItems = await client.getItems(['Movie', 'Series'])

  const studioRules = rules.filter((r) => r.field === 'studio')
  const genreRules = rules.filter((r) => r.field === 'genre')
  const tagRules = rules.filter((r) => r.field === 'tag')

  const contentType = studioRules[0]?.content_type ?? 'all'

  return allItems.filter((item) => {
    if (contentType === 'movie' && item.Type !== 'Movie') return false
    if (contentType === 'series' && item.Type !== 'Series') return false

    const itemStudios = item.Studios.map((s) => s.Name.toLowerCase())
    const itemGenres = (item.Genres ?? []).map((g) => g.toLowerCase())
    const itemTags = (item.Tags ?? []).map((t) => t.toLowerCase())

    const primaryStudioRules = studioRules.filter((r) => r.match_type === 'primary')
    const secondarySafeRules = studioRules.filter((r) => r.match_type === 'secondary_safe')
    const anyStudioRules = studioRules.filter((r) => r.match_type === 'any' || !r.match_type)

    if (primaryStudioRules.length > 0) {
      const primaryStudio = itemStudios[0]
      if (!primaryStudio || !primaryStudioRules.some((r) => r.value.toLowerCase() === primaryStudio)) {
        return false
      }
    }

    if (secondarySafeRules.length > 0) {
      const primaryStudio = itemStudios[0]
      const secondaryStudio = itemStudios[1]

      const hasPrimaryMatch = secondarySafeRules.some((r) => r.value.toLowerCase() === primaryStudio)
      const hasSecondaryMatch = secondaryStudio && secondarySafeRules.some((r) => r.value.toLowerCase() === secondaryStudio)
      const primaryIsNotStreaming = primaryStudio && !isStreamingCompetitor(primaryStudio)

      if (!hasPrimaryMatch && !(hasSecondaryMatch && primaryIsNotStreaming)) {
        return false
      }
    }

    if (anyStudioRules.length > 0) {
      if (!anyStudioRules.some((r) => itemStudios.some((s) => s === r.value.toLowerCase()))) {
        return false
      }
    }

    if (genreRules.length > 0) {
      if (!genreRules.some((r) => itemGenres.some((g) => g === r.value.toLowerCase()))) {
        return false
      }
    }

    if (tagRules.length > 0) {
      for (const rule of tagRules) {
        const requiredTags = rule.tags
          ? rule.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
          : []
        if (requiredTags.length > 0 && !requiredTags.every((rt: string) => itemTags.some((t) => t === rt))) {
          return false
        }
      }
    }

    const hasStudioRules = studioRules.length > 0
    const hasGenreRules = genreRules.length > 0
    const hasTagRules = tagRules.length > 0

    if (!hasStudioRules && !hasGenreRules && !hasTagRules) return false
    return true
  })
}
