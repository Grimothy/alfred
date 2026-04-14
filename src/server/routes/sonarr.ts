import { Router } from 'express'
import axios from 'axios'
import { getSetting } from '../db/queries'

const router = Router()

function sonarrClient() {
  const url = getSetting('sonarr_url') ?? ''
  const apiKey = getSetting('sonarr_api_key') ?? ''
  if (!url || !apiKey) throw new Error('Sonarr not configured')
  return {
    base: url.replace(/\/+$/, ''),
    apiKey,
  }
}

function sonarrHeaders(apiKey: string) {
  return { 'X-Api-Key': apiKey }
}

// GET /api/sonarr/status — returns current configured state (no secrets)
router.get('/status', (_req, res) => {
  const url = getSetting('sonarr_url') ?? ''
  const apiKey = getSetting('sonarr_api_key') ?? ''
  res.json({
    configured: Boolean(url && apiKey),
    url: url || null,
    hasApiKey: Boolean(apiKey),
  })
})

// POST /api/sonarr/test — test connection with provided or saved credentials
router.post('/test', async (req, res) => {
  const { url, apiKey } = req.body as { url?: string; apiKey?: string }
  const savedUrl = getSetting('sonarr_url') ?? ''
  const savedKey = getSetting('sonarr_api_key') ?? ''

  const targetUrl = (url && url !== '••••••••') ? url : savedUrl
  const targetKey = (apiKey && apiKey !== '••••••••') ? apiKey : savedKey

  if (!targetUrl || !targetKey) {
    return res.status(400).json({ error: 'Sonarr URL and API key are required' })
  }

  try {
    const base = targetUrl.replace(/\/+$/, '')
    const resp = await axios.get(`${base}/api/v3/system/status`, {
      headers: sonarrHeaders(targetKey),
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

// GET /api/sonarr/qualityprofiles
router.get('/qualityprofiles', async (_req, res) => {
  try {
    const { base, apiKey } = sonarrClient()
    const resp = await axios.get(`${base}/api/v3/qualityprofile`, {
      headers: sonarrHeaders(apiKey),
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

// GET /api/sonarr/rootfolders
router.get('/rootfolders', async (_req, res) => {
  try {
    const { base, apiKey } = sonarrClient()
    const resp = await axios.get(`${base}/api/v3/rootfolder`, {
      headers: sonarrHeaders(apiKey),
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

// GET /api/sonarr/lookup?term= — search/lookup series
router.get('/lookup', async (req, res) => {
  const term = (req.query.term as string | undefined) ?? ''
  if (!term) return res.status(400).json({ error: 'term query param is required' })
  try {
    const { base, apiKey } = sonarrClient()
    const resp = await axios.get(`${base}/api/v3/series/lookup`, {
      headers: sonarrHeaders(apiKey),
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

// GET /api/sonarr/series — list all series in Sonarr
router.get('/series', async (_req, res) => {
  try {
    const { base, apiKey } = sonarrClient()
    const resp = await axios.get(`${base}/api/v3/series`, {
      headers: sonarrHeaders(apiKey),
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

// GET /api/sonarr/series/:id — get series by Sonarr ID
router.get('/series/:id', async (req, res) => {
  try {
    const { base, apiKey } = sonarrClient()
    const resp = await axios.get(`${base}/api/v3/series/${req.params.id}`, {
      headers: sonarrHeaders(apiKey),
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

// POST /api/sonarr/request-batch — add multiple series to Sonarr
// Body: { items: Array<{ tvdbId, title?, titleSlug?, seasonStatuses? }>, qualityProfileId?, rootFolderPath? }
router.post('/request-batch', async (req, res) => {
  const body = req.body as {
    items: { tvdbId: number; title?: string; titleSlug?: string; seasonStatuses?: { seasonNumber: number; monitored: boolean }[] }[]
    qualityProfileId?: number
    rootFolderPath?: string
  }

  if (!body.items || body.items.length === 0) {
    return res.status(400).json({ error: 'items array is required' })
  }

  const { base, apiKey } = sonarrClient()
  const headers = { ...sonarrHeaders(apiKey), 'Content-Type': 'application/json' }

  const results: { tvdbId: number; success: boolean; error?: string }[] = []

  for (const item of body.items) {
    try {
      let title = item.title
      let titleSlug = item.titleSlug
      if (!title) {
        const lookup = await axios.get(`${base}/api/v3/series/lookup`, {
          params: { term: `tvdb:${item.tvdbId}` },
          headers: sonarrHeaders(apiKey),
          timeout: 10_000,
        })
        const match = lookup.data?.[0]
        title = match?.title
        titleSlug = match?.titleSlug
      }

      const payload: Record<string, unknown> = {
        tvdbId: item.tvdbId,
        title,
        titleSlug,
        qualityProfileId: body.qualityProfileId ?? 1,
        rootFolderPath: body.rootFolderPath ?? '',
        monitored: true,
        seasonFolder: true,
        addOptions: { searchForMissingEpisodes: true },
      }

      if (item.seasonStatuses && item.seasonStatuses.length > 0) {
        payload.monitor = 'none'
        payload.seasons = item.seasonStatuses.map((s) => ({
          seasonNumber: s.seasonNumber,
          monitored: s.monitored,
        }))
      }

      await axios.post(`${base}/api/v3/series`, payload, { headers, timeout: 15_000 })
      results.push({ tvdbId: item.tvdbId, success: true })
    } catch (err) {
      let msg = 'Unknown error'
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 409) {
          msg = 'Series already exists'
        } else {
          const data = err.response?.data
          if (Array.isArray(data) && data[0]?.errorMessage) {
            msg = data.map((e: { errorMessage: string }) => e.errorMessage).join('; ')
          } else {
            msg = data?.message ?? data?.error ?? err.message
          }
        }
      } else {
        msg = err instanceof Error ? err.message : String(err)
      }
      results.push({ tvdbId: item.tvdbId, success: false, error: msg })
    }
  }

  const allSucceeded = results.every((r) => r.success)
  return res.status(allSucceeded ? 201 : 207).json({ results })
})

// POST /api/sonarr/series — add series to Sonarr
// Body: { tvdbId, seasonStatuses?, qualityProfileId?, rootFolderPath? }
router.post('/series', async (req, res) => {
  const body = req.body as {
    tvdbId: number
    title?: string
    titleSlug?: string
    seasonStatuses?: { seasonNumber: number; monitored: boolean }[]
    qualityProfileId?: number
    rootFolderPath?: string
  }

  if (!body.tvdbId) {
    return res.status(400).json({ error: 'tvdbId is required' })
  }

  try {
    const { base, apiKey } = sonarrClient()

    // If title not supplied by caller, look it up from Sonarr
    let title = body.title
    let titleSlug = body.titleSlug
    if (!title) {
      const lookup = await axios.get(`${base}/api/v3/series/lookup`, {
        params: { term: `tvdb:${body.tvdbId}` },
        headers: sonarrHeaders(apiKey),
        timeout: 10_000,
      })
      const match = lookup.data?.[0]
      title = match?.title
      titleSlug = match?.titleSlug
    }

    const payload: Record<string, unknown> = {
      tvdbId: body.tvdbId,
      title,
      titleSlug,
      qualityProfileId: body.qualityProfileId ?? 1,
      rootFolderPath: body.rootFolderPath ?? '',
      monitored: true,
      seasonFolder: true,
      addOptions: {
        searchForMissingEpisodes: true,
      },
    }

    // If seasonStatuses provided, only monitor specific seasons (partial request)
    if (body.seasonStatuses && body.seasonStatuses.length > 0) {
      payload.monitor = 'none'
      payload.seasons = body.seasonStatuses.map((s) => ({
        seasonNumber: s.seasonNumber,
        monitored: s.monitored,
      }))
    }

    const resp = await axios.post(`${base}/api/v3/series`, payload, {
      headers: { ...sonarrHeaders(apiKey), 'Content-Type': 'application/json' },
      timeout: 15_000,
    })
    return res.status(201).json(resp.data)
  } catch (err) {
    let msg = 'Unknown error'
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 409) {
        msg = 'Series already exists in Sonarr'
      } else {
        const data = err.response?.data
        // Sonarr returns validation errors as an array
        if (Array.isArray(data) && data[0]?.errorMessage) {
          msg = data.map((e: { errorMessage: string }) => e.errorMessage).join('; ')
        } else {
          msg = data?.message ?? data?.error ?? err.message
        }
      }
    } else {
      msg = err instanceof Error ? err.message : String(err)
    }
    return res.status(400).json({ error: msg })
  }
})

// GET /api/sonarr/queue — get current download queue with progress
router.get('/queue', async (_req, res) => {
  try {
    const { base, apiKey } = sonarrClient()
    const resp = await axios.get(`${base}/api/v3/queue`, {
      headers: sonarrHeaders(apiKey),
      params: { page: 1, pageSize: 100, sortKey: 'progress', sortDir: 'desc', includeSeries: true },
      timeout: 10_000,
    })
    // Map to simpler shape
    const records = (resp.data?.records ?? []).map((item: Record<string, unknown>) => {
      const size = typeof item.size === 'number' ? item.size : 0
      const sizeleft = typeof item.sizeleft === 'number' ? item.sizeleft : 0
      const progress = size > 0 ? Math.max(0, Math.min(1, 1 - sizeleft / size)) : 0
      return {
        id: item.id,
        title: item.title,
        status: item.status,
        progress, // 0-1
        timeleft: item.timeleft ?? null,
        downloadId: item.downloadId,
        tvdbId: (item.series as Record<string, unknown>)?.tvdbId ?? null,
      }
    })
    return res.json({ records })
  } catch (err) {
    const msg = axios.isAxiosError(err) ? err.message : err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})

export default router
