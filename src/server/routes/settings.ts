import { Router } from 'express'
import { getAllSettings, setSettings } from '../db/queries'
import { resetEmbyClient } from '../emby/client'
import { getTmdbClient, resetTmdbClient } from '../tmdb/client'
import { refreshAllCachedCompanies } from '../tmdb/cache'
import { startScheduler, stopScheduler } from '../sync/scheduler'

const router = Router()

router.get('/', (_req, res) => {
  const settings = getAllSettings()
  // Mask API keys
  if (settings['emby_api_key']) {
    settings['emby_api_key'] = '••••••••'
  }
  if (settings['tmdb_api_key']) {
    settings['tmdb_api_key'] = '••••••••'
  }
  if (settings['sonarr_api_key']) {
    settings['sonarr_api_key'] = '••••••••'
  }
  if (settings['radarr_api_key']) {
    settings['radarr_api_key'] = '••••••••'
  }
  res.json(settings)
})

router.put('/', (req, res) => {
  const body: Record<string, string> = req.body
  const allowed = ['emby_host', 'emby_api_key', 'sync_schedule', 'sync_enabled', 'tmdb_api_key', 'sonarr_url', 'sonarr_api_key', 'radarr_url', 'radarr_api_key']
  const update: Record<string, string> = {}

  for (const key of allowed) {
    if (body[key] !== undefined) {
      // Don't overwrite masked placeholders
      if (['emby_api_key', 'tmdb_api_key', 'sonarr_api_key', 'radarr_api_key'].includes(key) && body[key] === '••••••••') continue
      update[key] = body[key]
    }
  }

  setSettings(update)
  resetEmbyClient()
  if (update['tmdb_api_key']) resetTmdbClient()

  // Restart scheduler if schedule/enabled changed
  if (update['sync_enabled'] !== undefined || update['sync_schedule'] !== undefined) {
    stopScheduler()
    startScheduler()
  }

  res.json({ ok: true })
})

// ── TMDB test ─────────────────────────────────────────────────────────────────

router.post('/tmdb/test', async (req, res) => {
  const { apiKey } = req.body as { apiKey?: string }
  const key = (apiKey && apiKey !== '••••••••') ? apiKey : undefined
  if (!key) {
    return res.status(400).json({ error: 'TMDB API key is required' })
  }
  try {
    const client = getTmdbClient(key)
    const info = await client.validateApiKey()
    return res.json({ ok: true, name: info.name, version: info.version })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(400).json({ error: message })
  }
})

// ── TMDB cache refresh ────────────────────────────────────────────────────────

router.post('/tmdb/cache/refresh', async (_req, res) => {
  try {
    const result = await refreshAllCachedCompanies()
    return res.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: message })
  }
})

export default router
