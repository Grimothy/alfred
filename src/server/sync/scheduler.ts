import cron from 'node-cron'
import { runSync } from './engine'
import { getSetting } from '../db/queries'

let scheduledTask: cron.ScheduledTask | null = null

export function startScheduler(): void {
  stopScheduler()

  const enabled = getSetting('sync_enabled')
  if (enabled !== 'true') return

  const schedule = getSetting('sync_schedule') ?? '0 3 * * *'

  if (!cron.validate(schedule)) {
    console.error(`[scheduler] Invalid cron expression: ${schedule}`)
    return
  }

  scheduledTask = cron.schedule(schedule, async () => {
    console.log('[scheduler] Starting scheduled sync...')
    try {
      const result = await runSync()
      console.log(
        `[scheduler] Sync complete. Added: ${result.totalAdded}, Removed: ${result.totalRemoved}`
      )
    } catch (err) {
      console.error('[scheduler] Sync failed:', err)
    }
  })

  console.log(`[scheduler] Scheduled sync enabled: ${schedule}`)
}

export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask = null
    console.log('[scheduler] Scheduler stopped')
  }
}

export async function triggerNow(): Promise<void> {
  return runSync().then(() => undefined)
}

export function getNextRunTime(): string | null {
  // node-cron doesn't expose next run time directly — return the cron expression
  const schedule = getSetting('sync_schedule') ?? '0 3 * * *'
  const enabled = getSetting('sync_enabled')
  if (enabled !== 'true') return null
  return schedule
}
