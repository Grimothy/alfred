import { Router } from 'express'
import { runSync, isSyncRunning } from '../sync/engine'
import { getSyncHistory, getLatestSync } from '../db/queries'

const router = Router()

// POST /api/sync/run
router.post('/run', async (_req, res) => {
  if (isSyncRunning()) {
    return res.status(409).json({ error: 'Sync already in progress' })
  }

  // Fire and forget — return immediately with sync ID
  runSync().catch((err) => {
    console.error('[sync] Background sync error:', err)
  })

  return res.json({ ok: true, message: 'Sync started' })
})

// GET /api/sync/status
router.get('/status', (_req, res) => {
  const latest = getLatestSync()
  res.json({
    running: isSyncRunning(),
    latest: latest ?? null,
  })
})

// GET /api/sync/history
router.get('/history', (_req, res) => {
  const history = getSyncHistory(20)
  const parsed = history.map((h) => ({
    ...h,
    summary: h.summary ? JSON.parse(h.summary) : null,
  }))
  res.json(parsed)
})

export default router
