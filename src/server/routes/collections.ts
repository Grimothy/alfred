import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'

// Node.js 18+ fetch polyfill for older environments
declare global {
  function fetch(input: string, init?: any): Promise<any>
}
import {
  getCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  toggleCollection,
  toggleTmdbMatches,
  setCollectionImagePath,
  invalidateDiscoveryCache,
  addCollectionItem,
  removeCollectionItem,
  getCollectionItems,
} from '../db/queries'
import {
  previewCollectionWithRules,
  previewTmdbCollection,
  previewTmdbCollectionExpanded,
  IMAGES_DIR,
} from '../sync/engine'
import { searchCompanies, searchNetworks } from '../tmdb/cache'
import { getEmbyClient } from '../emby/client'
import { getSetting } from '../db/queries'

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const id = req.params.id
    const type = req.params.type // 'poster' or 'backdrop'
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    cb(null, `collection-${id}-${type}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are accepted'))
    }
  },
})

const router = Router()

// GET /api/collections
router.get('/', (_req, res) => {
  const collections = getCollections()
  res.json(collections)
})

// GET /api/collections/items/search?q=<query>
router.get('/items/search', async (req, res) => {
  const query = (req.query.q as string | undefined)?.trim()
  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' })
  }

  try {
    const embyHost = getSetting('emby_host')
    const embyApiKey = getSetting('emby_api_key')
    const tmdbApiKey = getSetting('tmdb_api_key')

    const results: { emby: Array<{ id: string; name: string; type: string; year: number | null; poster_path: string | null; backdrop_path: string | null }>; tmdb: Array<{ id: number; name: string; type: string; year: number | null; poster_path: string | null }> } = { emby: [], tmdb: [] }

    // Search Emby if configured
    if (embyHost && embyApiKey) {
      try {
        const embyClient = getEmbyClient(embyHost, embyApiKey)
        const embyItems = await embyClient.searchItems(query)
        results.emby = embyItems.slice(0, 10).map(item => ({
          id: item.Id,
          name: item.Name,
          type: item.Type,
          year: item.ProductionYear || null,
          poster_path: null,
          backdrop_path: null
        }))
      } catch (err) {
        console.error('Emby search failed:', err)
      }
    }

    // Search TMDB if configured
    if (tmdbApiKey) {
      try {
        const tmdbUrl = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${tmdbApiKey}`
        const tmdbResponse = await fetch(tmdbUrl)
        if (tmdbResponse.ok) {
          const tmdbData = await tmdbResponse.json()
          const embyNames = new Set(results.emby.map(item => item.name.toLowerCase()))
          
          results.tmdb = (tmdbData.results || [])
            .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
            .filter((item: any) => !embyNames.has((item.title || item.name || '').toLowerCase()))
            .slice(0, 10)
            .map((item: any) => ({
              id: item.id,
              name: item.title || item.name || 'Unknown',
              type: item.media_type,
              year: item.release_date ? new Date(item.release_date).getFullYear() : 
                    item.first_air_date ? new Date(item.first_air_date).getFullYear() : null,
              poster_path: item.poster_path
            }))
        }
      } catch (err) {
        console.error('TMDB search failed:', err)
      }
    }

    return res.json(results)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// POST /api/collections/:id/items
router.post('/:id/items', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { itemId, source, itemType, name, year, posterPath } = req.body as {
    itemId: string
    source: 'emby' | 'tmdb'
    itemType?: 'movie' | 'series'
    name?: string | null
    year?: string | null
    posterPath?: string | null
  }

  if (!itemId || !source) {
    return res.status(400).json({ error: 'itemId and source are required' })
  }

  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })

  try {
    addCollectionItem(id, itemId, source, itemType, name ?? null, year ?? null, posterPath ?? null)
    return res.status(201).json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// DELETE /api/collections/:id/items
router.delete('/:id/items', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { itemId, source } = req.body as {
    itemId: string
    source: 'emby' | 'tmdb'
  }

  if (!itemId || !source) {
    return res.status(400).json({ error: 'itemId and source are required' })
  }

  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })

  try {
    removeCollectionItem(id, itemId, source)
    return res.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/collections/:id/items
router.get('/:id/items', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })

  try {
    const items = getCollectionItems(id)
    const embyHost = getSetting('emby_host')
    const embyApiKey = getSetting('emby_api_key')
    
    const result: { emby: Array<{ id: string; name: string; type: string; year: number | null; poster_path: string | null; backdrop_path: string | null }>; tmdb: Array<{ id: number; name: string; type: string; year: number | null; poster_path: string | null }> } = { emby: [], tmdb: [] }
    
    for (const item of items) {
      if (item.source === 'emby') {
        // Enrich Emby items with details from Emby API
        if (embyHost && embyApiKey) {
          try {
            const embyClient = getEmbyClient(embyHost, embyApiKey)
            const embyItem = await embyClient.getItemById(item.item_id)
            result.emby.push({
              id: embyItem.Id,
              name: embyItem.Name,
              type: embyItem.Type,
              year: embyItem.ProductionYear || null,
              poster_path: null,
              backdrop_path: null
            })
          } catch (err) {
            console.error(`Failed to fetch Emby item ${item.item_id}:`, err)
          }
        }
      } else if (item.source === 'tmdb') {
        // For TMDB items, use stored metadata
        result.tmdb.push({
          id: parseInt(item.item_id),
          name: item.name ?? `TMDB ${item.item_id}`,
          type: item.item_type || 'unknown',
          year: item.year ? parseInt(item.year) : null,
          poster_path: item.poster_path
        })
      }
    }

    return res.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// POST /api/collections
router.post('/', (req, res) => {
  const { name, rules, use_tmdb, tmdb_company_id, tmdb_network_id, tmdb_company_ids, tmdb_network_ids, remove_from_emby, type, tmdb_discover_filters } = req.body as {
    name: string
    rules: { field: string; value: string }[]
    use_tmdb?: boolean
    tmdb_company_id?: number | null
    tmdb_network_id?: number | null
    tmdb_company_ids?: Array<{ id: number; name: string }>
    tmdb_network_ids?: Array<{ id: number; name: string }>
    remove_from_emby?: boolean
    type?: 'emby' | 'tmdb' | 'custom'
    tmdb_discover_filters?: string | null
  }

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Collection name is required' })
  }
  
  const collectionType = type ?? 'emby'
  const isTmdb = use_tmdb && (tmdb_company_id != null || tmdb_network_id != null || (tmdb_company_ids?.length ?? 0) > 0 || (tmdb_network_ids?.length ?? 0) > 0)
  
  // Custom collections don't need rules; rule-based collections do
  if (collectionType === 'emby' && !isTmdb && (!Array.isArray(rules) || rules.length === 0)) {
    return res.status(400).json({ error: 'At least one rule is required for rule-based collections' })
  }

  try {
    const collection = createCollection(
      name.trim(),
      rules ?? [],
      use_tmdb ? 1 : 0,
      tmdb_company_id ?? null,
      tmdb_network_id ?? null,
      tmdb_company_ids ? JSON.stringify(tmdb_company_ids) : null,
      tmdb_network_ids ? JSON.stringify(tmdb_network_ids) : null,
      remove_from_emby !== false ? 1 : 0,
      collectionType,
      tmdb_discover_filters ?? null
    )
    return res.status(201).json(collection)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE')) {
      return res.status(409).json({ error: 'A collection with that name already exists' })
    }
    return res.status(500).json({ error: msg })
  }
})

// PUT /api/collections/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { name, rules, enabled, use_tmdb, tmdb_company_id, tmdb_network_id, tmdb_company_ids, tmdb_network_ids, remove_from_emby, type, tmdb_discover_filters } = req.body as {
    name: string
    rules: { field: string; value: string }[]
    enabled?: boolean
    use_tmdb?: boolean
    tmdb_company_id?: number | null
    tmdb_network_id?: number | null
    tmdb_company_ids?: Array<{ id: number; name: string }>
    tmdb_network_ids?: Array<{ id: number; name: string }>
    remove_from_emby?: boolean
    type?: 'emby' | 'tmdb' | 'custom'
    tmdb_discover_filters?: string | null
  }

  if (!name?.trim()) {
    return res.status(400).json({ error: 'Collection name is required' })
  }

  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })

  // Custom collections don't need rules validation
  const collectionType = type ?? col.type
  const isTmdb = use_tmdb && (tmdb_company_id != null || tmdb_network_id != null || (tmdb_company_ids?.length ?? 0) > 0 || (tmdb_network_ids?.length ?? 0) > 0)
  
  if (collectionType === 'emby' && !isTmdb && (!Array.isArray(rules) || rules.length === 0)) {
    return res.status(400).json({ error: 'At least one rule is required for rule-based collections' })
  }

  // Invalidate discovery cache if any TMDB IDs are being updated
  if (use_tmdb || tmdb_company_id != null || tmdb_network_id != null ||
      tmdb_company_ids !== undefined || tmdb_network_ids !== undefined) {
    invalidateDiscoveryCache(id)
  }

  const enabledNum = enabled !== undefined ? (enabled ? 1 : 0) : undefined
  const useTmdbNum = use_tmdb !== undefined ? (use_tmdb ? 1 : 0) : undefined
  const removeFromEmbyNum = remove_from_emby !== undefined ? (remove_from_emby ? 1 : 0) : undefined
  const updated = updateCollection(
    id,
    name.trim(),
    rules ?? [],
    enabledNum,
    useTmdbNum,
    tmdb_company_id,
    tmdb_network_id,
    tmdb_company_ids ? JSON.stringify(tmdb_company_ids) : undefined,
    tmdb_network_ids ? JSON.stringify(tmdb_network_ids) : undefined,
    removeFromEmbyNum,
    undefined, // includeTmdbMatches - not updated here
    collectionType,
    tmdb_discover_filters ?? null
  )
  if (!updated) return res.status(404).json({ error: 'Collection not found' })

  return res.json(updated)
})

// PATCH /api/collections/:id/toggle
router.patch('/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { enabled } = req.body as { enabled: boolean }
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })
  toggleCollection(id, enabled)
  return res.json({ ok: true })
})

// PATCH /api/collections/:id/toggle-tmdb-matches
router.patch('/:id/toggle-tmdb-matches', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { include_tmdb_matches } = req.body as { include_tmdb_matches: boolean }
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })
  if (col.use_tmdb !== 1) {
    return res.status(400).json({ error: 'Collection is not TMDB-backed' })
  }
  toggleTmdbMatches(id, include_tmdb_matches)
  return res.json({ ok: true })
})

// DELETE /api/collections/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })
  deleteCollection(id)
  return res.json({ ok: true })
})

// GET /api/collections/:id/preview
router.get('/:id/preview', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const bypassCache = req.query.refresh === 'true'
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })

  try {
    if (col.use_tmdb === 1 && col.include_tmdb_matches === 1) {
      const result = await previewTmdbCollectionExpanded(col, bypassCache)
      return res.json({
        count: result.inCollection.length,
        inCollection: result.inCollection,
        notInCollection: result.notInCollection,
      })
    }

    const items = col.use_tmdb === 1
      ? await previewTmdbCollection(col, bypassCache)
      : await previewCollectionWithRules(col.rules)
    return res.json({ count: items.length, items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// POST /api/collections/preview (for unsaved rules)
router.post('/preview', async (req, res) => {
  const { rules = [] } = req.body as {
    rules?: Array<{
      field: string
      value: string
      content_type?: string
      match_type?: string
      tags?: string
    }>
  }
  try {
    const items = await previewCollectionWithRules(rules)
    return res.json({ count: items.length, items })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/collections/tmdb/search?q=Warner+Bros
router.get('/tmdb/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim()
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' })
  }
  try {
    const results = await searchCompanies(q)
    return res.json(results.slice(0, 10))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/collections/tmdb/networks/search?q=Netflix
router.get('/tmdb/networks/search', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim()
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' })
  }
  try {
    const results = await searchNetworks(q)
    return res.json(results.slice(0, 10))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// POST /api/collections/:id/images/:type  (type = poster | backdrop)
router.post(
  '/:id/images/:type',
  (req, res, next) => {
    // Validate :type before multer writes anything
    if (!['poster', 'backdrop'].includes(req.params.type)) {
      return res.status(400).json({ error: 'type must be poster or backdrop' })
    }
    next()
  },
  upload.single('image'),
  (req, res) => {
    const id = parseInt(req.params.id, 10)
    const type = req.params.type as 'poster' | 'backdrop'
    const col = getCollectionById(id)
    if (!col) return res.status(404).json({ error: 'Collection not found' })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    // Delete old file if a different path was stored
    const oldPath = type === 'poster' ? col.poster_path : col.backdrop_path
    if (oldPath && oldPath !== req.file.path && fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath)
    }

    setCollectionImagePath(id, type, req.file.path)
    return res.json({ ok: true, path: req.file.path })
  }
)

// DELETE /api/collections/:id/images/:type
router.delete('/:id/images/:type', (req, res) => {
  const id = parseInt(req.params.id, 10)
  const type = req.params.type as 'poster' | 'backdrop'
  if (!['poster', 'backdrop'].includes(type)) {
    return res.status(400).json({ error: 'type must be poster or backdrop' })
  }
  const col = getCollectionById(id)
  if (!col) return res.status(404).json({ error: 'Collection not found' })

  const filePath = type === 'poster' ? col.poster_path : col.backdrop_path
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  setCollectionImagePath(id, type, null)
  return res.json({ ok: true })
})

// GET /api/collections/tmdb/discover
router.get('/tmdb/discover', async (req, res) => {
  try {
    const tmdbApiKey = getSetting('tmdb_api_key')
    if (!tmdbApiKey) {
      return res.status(400).json({ error: 'TMDB API key not configured' })
    }

    const {
      type,
      page = '1',
      sort_by = 'popularity.desc',
      'release_date.gte': releaseDateGte,
      'release_date.lte': releaseDateLte,
      'first_air_date.gte': firstAirDateGte,
      'first_air_date.lte': firstAirDateLte,
      with_companies,
      with_genres,
      with_keywords,
      without_keywords,
      with_original_language,
      certification_country,
      'certification.lte': certificationLte,
      'with_runtime.gte': runtimeGte,
      'with_runtime.lte': runtimeLte,
      'vote_average.gte': voteAverageGte,
      'vote_average.lte': voteAverageLte,
      'vote_count.gte': voteCountGte,
      'vote_count.lte': voteCountLte,
      watch_region,
      with_watch_providers,
    } = req.query as Record<string, string | undefined>

    if (!type || (type !== 'movie' && type !== 'tv')) {
      return res.status(400).json({ error: 'Type must be "movie" or "tv"' })
    }

    // Build TMDB discover API params
    const params: Record<string, string> = {
      api_key: tmdbApiKey,
      page,
      sort_by,
    }

    // Date filters
    if (type === 'movie') {
      if (releaseDateGte) params['release_date.gte'] = releaseDateGte
      if (releaseDateLte) params['release_date.lte'] = releaseDateLte
    } else {
      if (firstAirDateGte) params['first_air_date.gte'] = firstAirDateGte
      if (firstAirDateLte) params['first_air_date.lte'] = firstAirDateLte
    }

    // Other filters
    if (with_companies) params.with_companies = with_companies
    if (with_genres) params.with_genres = with_genres
    if (with_keywords) params.with_keywords = with_keywords
    if (without_keywords) params.without_keywords = without_keywords
    if (with_original_language) params.with_original_language = with_original_language
    if (certification_country) params.certification_country = certification_country
    if (certificationLte) params['certification.lte'] = certificationLte
    if (runtimeGte) params['with_runtime.gte'] = runtimeGte
    if (runtimeLte) params['with_runtime.lte'] = runtimeLte
    if (voteAverageGte) params['vote_average.gte'] = voteAverageGte
    if (voteAverageLte) params['vote_average.lte'] = voteAverageLte
    if (voteCountGte) params['vote_count.gte'] = voteCountGte
    if (voteCountLte) params['vote_count.lte'] = voteCountLte
    if (watch_region) params.watch_region = watch_region
    if (with_watch_providers) params.with_watch_providers = with_watch_providers

    const url = `https://api.themoviedb.org/3/discover/${type}`
    const searchParams = new URLSearchParams(params)
    
    const response = await fetch(`${url}?${searchParams}`)
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    // Format results to match expected interface
    const results = (data.results || []).map((item: any) => ({
      id: item.id,
      name: type === 'movie' ? item.title : item.name,
      type: type === 'tv' ? 'tv' : 'movie',
      year: type === 'movie' 
        ? (item.release_date ? new Date(item.release_date).getFullYear() : null)
        : (item.first_air_date ? new Date(item.first_air_date).getFullYear() : null),
      poster_path: item.poster_path,
      vote_average: item.vote_average || 0,
      vote_count: item.vote_count || 0,
      overview: item.overview,
      genres: item.genre_ids || [],
    }))

    return res.json({
      results,
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_results,
    })
  } catch (err) {
    console.error('TMDB discover error:', err)
    return res.status(500).json({ error: 'Failed to search TMDB' })
  }
})

export default router
