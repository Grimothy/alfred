import { Router } from 'express'
import { getAllSettings, setSettings } from '../db/queries'
import { resetEmbyClient } from '../emby/client'
import { startScheduler, stopScheduler } from '../sync/scheduler'

const router = Router()

router.get('/', (_req, res) => {
  const settings = getAllSettings()
  // Mask API key
  if (settings['emby_api_key']) {
    settings['emby_api_key'] = '••••••••'
  }
  res.json(settings)
})

router.put('/', (req, res) => {
  const body: Record<string, string> = req.body
  const allowed = ['emby_host', 'emby_api_key', 'sync_schedule', 'sync_enabled']
  const update: Record<string, string> = {}

  for (const key of allowed) {
    if (body[key] !== undefined) {
      // Don't overwrite API key if it's the masked placeholder
      if (key === 'emby_api_key' && body[key] === '••••••••') continue
      update[key] = body[key]
    }
  }

  setSettings(update)
  resetEmbyClient()

  // Restart scheduler if schedule/enabled changed
  if (update['sync_enabled'] !== undefined || update['sync_schedule'] !== undefined) {
    stopScheduler()
    startScheduler()
  }

  res.json({ ok: true })
})

export default router
