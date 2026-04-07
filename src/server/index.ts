import express from 'express'
import cors from 'cors'
import path from 'path'
import { initDb } from './db/schema'
import { startScheduler } from './sync/scheduler'
import settingsRouter from './routes/settings'
import collectionsRouter from './routes/collections'
import syncRouter from './routes/sync'
import libraryRouter from './routes/library'
import { getEmbyClient } from './emby/client'
import { getAllSettings } from './db/queries'

const app = express()
const PORT = parseInt(process.env.PORT ?? '8099', 10)

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json())

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/settings', settingsRouter)
app.use('/api/collections', collectionsRouter)
app.use('/api/sync', syncRouter)
app.use('/api/library', libraryRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Emby connection test
app.get('/api/emby/test', async (_req, res) => {
  const settings = getAllSettings()
  const host = settings['emby_host']
  const apiKey = settings['emby_api_key']

  if (!host || !apiKey) {
    return res.status(400).json({ error: 'Emby not configured' })
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

// ── Serve React App (production) ──────────────────────────────────────────────
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
