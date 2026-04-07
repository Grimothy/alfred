import { Router } from 'express'
import { getEmbyClient } from '../emby/client'
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

export default router
