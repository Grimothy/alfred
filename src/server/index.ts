import express from 'express'
import cors from 'cors'
import path from 'path'
import { readFileSync } from 'fs'
import { initDb } from './db/schema'
import { startScheduler } from './sync/scheduler'
import settingsRouter from './routes/settings'
import collectionsRouter from './routes/collections'
import syncRouter from './routes/sync'
import libraryRouter from './routes/library'
import sonarrRouter from './routes/sonarr'
import radarrRouter from './routes/radarr'
import { getEmbyClient } from './emby/client'
import { getAllSettings } from './db/queries'
import { IMAGES_DIR } from './sync/engine'
import axios from 'axios'

const app = express()
const PORT = parseInt(process.env.PORT ?? '8099', 10)

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())

// ── Static: uploaded collection images ───────────────────────────────────────
// Serves /app/data/images/* as GET /images/*
app.use('/images', express.static(IMAGES_DIR))

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/settings', settingsRouter)
app.use('/api/collections', collectionsRouter)
app.use('/api/sync', syncRouter)
app.use('/api/library', libraryRouter)
app.use('/api/sonarr', sonarrRouter)
app.use('/api/radarr', radarrRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PKG = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf8')) as { version: string }

app.get('/api/version', (_req, res) => {
  res.json({ version: PKG.version })
})

// ── Emby item image proxy ─────────────────────────────────────────────────────
// GET /api/emby/image/:itemId?type=Primary&tag=<imageTag>
// Proxies the Emby image so the API key never reaches the browser.
app.get('/api/emby/image/:itemId', async (req, res) => {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']
  if (!host || !apiKey) {
    return res.status(503).json({ error: 'Emby not configured' })
  }

  const { itemId } = req.params
  const imageType = (req.query.type as string | undefined) ?? 'Primary'
  const tag = req.query.tag as string | undefined
  const maxWidth = (req.query.w as string | undefined) ?? '400'

  const base = host.replace(/\/+$/, '')
  const url = `${base}/emby/Items/${itemId}/Images/${imageType}`

  try {
    const upstream = await axios.get(url, {
      params: {
        api_key: apiKey,
        ...(tag ? { tag } : {}),
        maxWidth,
      },
      responseType: 'stream',
      timeout: 10_000,
    })

    const ct = upstream.headers['content-type'] as string | undefined
    if (ct) res.setHeader('Content-Type', ct)
    // Cache images aggressively — they only change when the tag changes
    res.setHeader('Cache-Control', 'public, max-age=86400')
    upstream.data.pipe(res)
  } catch (err) {
    // If Emby returns 404 or similar, mirror that status
    if (axios.isAxiosError(err) && err.response) {
      return res.status(err.response.status).end()
    }
    return res.status(502).end()
  }
})

// ── Emby connection test ──────────────────────────────────────────────────────
// Accepts ?host= and ?apiKey= query params so the user can test unsaved credentials.
app.get('/api/emby/test', async (req, res) => {
  const settings = getAllSettings()
  const host = (req.query.host as string | undefined) || settings['emby_host']
  const apiKey = (req.query.apiKey as string | undefined) || settings['emby_api_key']

  if (!host || !apiKey) {
    return res.status(400).json({ error: 'Emby host and API key are required' })
  }

  try {
    const client = getEmbyClient(host, apiKey)
    const info = await client.testConnection()
    return res.json({ ok: true, ...info })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ ok: false, error: msg })
  }
})

// Debug: sample first 10 Series + Movie items with raw ProviderIds
// GET /api/debug/emby-sample
app.get('/api/debug/emby-sample', async (_req, res) => {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']
  if (!host || !apiKey) return res.status(400).json({ error: 'Emby not configured' })
  try {
    const client = getEmbyClient(host, apiKey)
    const items = await client.getItems(['Movie', 'Series'])
    const sample = items.slice(0, 20).map((i) => ({
      Id: i.Id,
      Name: i.Name,
      Type: i.Type,
      ProviderIds: i.ProviderIds,
    }))
    return res.json({ total: items.length, sample })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: msg })
  }
})


if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client')
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initDb()
startScheduler()

app.listen(PORT, () => {
  console.log(`Alfred running on http://localhost:${PORT}`)
})

export default app
