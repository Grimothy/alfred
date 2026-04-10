import { Router } from 'express'
import { getEmbyClient } from '../emby/client'
import { getTmdbClient } from '../tmdb/client'
import { getAllSettings } from '../db/queries'

const router = Router()

// GET /api/library/studios
router.get('/studios', async (_req, res) => {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']

  if (!host || !apiKey) {
    return res.status(400).json({ error: 'Emby not configured' })
  }

  try {
    const client = getEmbyClient(host, apiKey)
    const [studios, items] = await Promise.all([
      client.getStudios(),
      client.getItems(['Movie', 'Series']),
    ])

    // Build studio item counts
    const studioMap = new Map<
      string,
      { name: string; movies: number; series: number }
    >()

    for (const item of items) {
      for (const studio of item.Studios) {
        const key = studio.Name.toLowerCase()
        if (!studioMap.has(key)) {
          studioMap.set(key, { name: studio.Name, movies: 0, series: 0 })
        }
        const entry = studioMap.get(key)!
        if (item.Type === 'Movie') entry.movies++
        else if (item.Type === 'Series') entry.series++
      }
    }

    // Merge with Emby studio list (ensure all studios from /Studios are present)
    for (const studio of studios) {
      const key = studio.Name.toLowerCase()
      if (!studioMap.has(key)) {
        studioMap.set(key, { name: studio.Name, movies: 0, series: 0 })
      }
    }

    const result = Array.from(studioMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )

    return res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/library/studios/:name/items
router.get('/studios/:name/items', async (req, res) => {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']

  if (!host || !apiKey) {
    return res.status(400).json({ error: 'Emby not configured' })
  }

  try {
    const client = getEmbyClient(host, apiKey)
    const items = await client.getItems(['Movie', 'Series'])
    const studioName = decodeURIComponent(req.params.name).toLowerCase()

    const matched = items.filter((item) =>
      item.Studios.some((s) => s.Name.toLowerCase() === studioName)
    )

    return res.json(matched)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/library/item/:id — full item detail with seasons for series
// Optional ?tmdbId= to find an item in Emby by TMDB provider ID first
router.get('/item/:id', async (req, res) => {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']

  if (!host || !apiKey) {
    return res.status(400).json({ error: 'Emby not configured' })
  }

  try {
    const client = getEmbyClient(host, apiKey)

    // If tmdbId provided, try to resolve to an Emby item first
    const tmdbId = req.query.tmdbId as string | undefined
    if (tmdbId) {
      const byTmdb = await client.getItemByTmdbId(tmdbId)
      if (byTmdb) return res.json(byTmdb)
      // Not in Emby yet — return 404 so client falls back to TMDB-only view
      return res.status(404).json({ error: 'Item not in Emby library' })
    }

    const item = await client.getItemById(req.params.id)
    return res.json(item)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/library/tmdb/:id?type=movie|tv — fetch TMDB detail for a TMDB-only item
router.get('/tmdb/:id', async (req, res) => {
  const settings = getAllSettings()
  const tmdbApiKey = settings['tmdb_api_key']

  if (!tmdbApiKey) {
    return res.status(400).json({ error: 'TMDB not configured' })
  }

  const tmdbId = parseInt(req.params.id, 10)
  if (isNaN(tmdbId)) {
    return res.status(400).json({ error: 'Invalid TMDB ID' })
  }

  const type = (req.query.type as string) === 'movie' ? 'movie' : 'tv'

  try {
    const client = getTmdbClient(tmdbApiKey)
    if (type === 'movie') {
      const detail = await client.getMovieDetails(tmdbId)
      return res.json(detail)
    } else {
      const detail = await client.getTvDetails(tmdbId)
      return res.json(detail)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

export default router
