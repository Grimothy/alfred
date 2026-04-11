import { Router } from 'express'
import axios from 'axios'
import { getSetting } from '../db/queries'

const router = Router()

function radarrClient() {
  const url = getSetting('radarr_url') ?? ''
  const apiKey = getSetting('radarr_api_key') ?? ''
  if (!url || !apiKey) throw new Error('Radarr not configured')
  return {
    base: url.replace(/\/+$/, ''),
    apiKey,
  }
}

function radarrHeaders(apiKey: string) {
  return { 'X-Api-Key': apiKey }
}

// GET /api/radarr/status
router.get('/status', (_req, res) => {
  const url = getSetting('radarr_url') ?? ''
  const apiKey = getSetting('radarr_api_key') ?? ''
  res.json({
    configured: Boolean(url && apiKey),
    url: url || null,
    hasApiKey: Boolean(apiKey),
  })
})

// POST /api/radarr/test
router.post('/test', async (req, res) => {
  const { url, apiKey } = req.body as { url?: string; apiKey?: string }
  const savedUrl = getSetting('radarr_url') ?? ''
  const savedKey = getSetting('radarr_api_key') ?? ''

  const targetUrl = (url && url !== '••••••••') ? url : savedUrl
  const targetKey = (apiKey && apiKey !== '••••••••') ? apiKey : savedKey

  if (!targetUrl || !targetKey) {
    return res.status(400).json({ error: 'Radarr URL and API key are required' })
  }

  try {
    const base = targetUrl.replace(/\/+$/, '')
    const resp = await axios.get(`${base}/api/v3/system/status`, {
      headers: radarrHeaders(targetKey),
      timeout: 10_000,
    })
    return res.json({ ok: true, version: resp.data.version })
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? err.response?.status === 401
        ? 'Invalid API key'
        : err.response?.data?.error ?? err.message
      : err instanceof Error
        ? err.message
        : String(err)
    return res.status(400).json({ error: `Connection failed: ${msg}` })
  }
})

// GET /api/radarr/qualityprofiles
router.get('/qualityprofiles', async (_req, res) => {
  try {
    const { base, apiKey } = radarrClient()
    const resp = await axios.get(`${base}/api/v3/qualityprofile`, {
      headers: radarrHeaders(apiKey),
      timeout: 10_000,
    })
    return res.json(resp.data)
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/radarr/rootfolders
router.get('/rootfolders', async (_req, res) => {
  try {
    const { base, apiKey } = radarrClient()
    const resp = await axios.get(`${base}/api/v3/rootfolder`, {
      headers: radarrHeaders(apiKey),
      timeout: 10_000,
    })
    return res.json(resp.data)
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/radarr/lookup?term= — search movies
router.get('/lookup', async (req, res) => {
  const term = (req.query.term as string | undefined) ?? ''
  if (!term) return res.status(400).json({ error: 'term query param is required' })
  try {
    const { base, apiKey } = radarrClient()
    const resp = await axios.get(`${base}/api/v3/movie/lookup`, {
      headers: radarrHeaders(apiKey),
      params: { term },
      timeout: 15_000,
    })
    return res.json(resp.data)
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/radarr/movie — list all movies in Radarr
router.get('/movie', async (_req, res) => {
  try {
    const { base, apiKey } = radarrClient()
    const resp = await axios.get(`${base}/api/v3/movie`, {
      headers: radarrHeaders(apiKey),
      timeout: 10_000,
    })
    return res.json(resp.data)
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err)
    return res.status(500).json({ error: msg })
  }
})

// GET /api/radarr/movie/:id
router.get('/movie/:id', async (req, res) => {
  try {
    const { base, apiKey } = radarrClient()
    const resp = await axios.get(`${base}/api/v3/movie/${req.params.id}`, {
      headers: radarrHeaders(apiKey),
      timeout: 10_000,
    })
    return res.json(resp.data)
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err)
    return res.status(500).json({ error: msg })
  }
})

// POST /api/radarr/movie — add movie to Radarr
// Body: { tmdbId, qualityProfileId?, rootFolderPath? }
router.post('/movie', async (req, res) => {
  const body = req.body as {
    tmdbId: number
    qualityProfileId?: number
    rootFolderPath?: string
  }

  if (!body.tmdbId) {
    return res.status(400).json({ error: 'tmdbId is required' })
  }

  try {
    const { base, apiKey } = radarrClient()
    const payload: Record<string, unknown> = {
      tmdbId: body.tmdbId,
      qualityProfileId: body.qualityProfileId ?? 1,
      rootFolderPath: body.rootFolderPath ?? '',
      monitored: true,
      addOptions: {
        searchForMovie: true,
      },
    }

    const resp = await axios.post(`${base}/api/v3/movie`, payload, {
      headers: { ...radarrHeaders(apiKey), 'Content-Type': 'application/json' },
      timeout: 15_000,
    })
    return res.status(201).json(resp.data)
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? err.response?.status === 409
        ? 'Movie already exists in Radarr'
        : err.response?.data?.error ?? err.message
      : err instanceof Error
        ? err.message
        : String(err)
    return res.status(400).json({ error: msg })
  }
})

export default router
