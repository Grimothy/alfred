import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings, testConnection, testTmdbConnection, refreshTmdbCache } from '../api'
import Button from '../components/Button'
import Card from '../components/Card'
import styles from './Settings.module.css'

const SCHEDULE_PRESETS = [
  { label: 'Every 5 min', value: '*/5 * * * *', description: 'Every 5 minutes' },
  { label: 'Every 15 min', value: '*/15 * * * *', description: 'Every 15 minutes' },
  { label: 'Every 30 min', value: '*/30 * * * *', description: 'Every 30 minutes' },
  { label: 'Hourly', value: '0 * * * *', description: 'Every hour at :00' },
  { label: 'Every 2 hours', value: '0 */2 * * *', description: 'Every 2 hours' },
  { label: 'Every 4 hours', value: '0 */4 * * *', description: 'Every 4 hours (midnight, 4, 8, noon, 4, 8 PM)' },
  { label: 'Every 6 hours', value: '0 */6 * * *', description: 'Every 6 hours' },
  { label: 'Every 12 hours', value: '0 0,12 * * *', description: 'Twice daily at midnight and noon' },
  { label: 'Daily at 3 AM', value: '0 3 * * *', description: 'Once daily at 3:00 AM' },
  { label: 'Daily at 6 AM', value: '0 6 * * *', description: 'Once daily at 6:00 AM' },
  { label: '2x daily (3 AM, 3 PM)', value: '0 3,15 * * *', description: 'Twice daily at 3 AM and 3 PM' },
  { label: 'Weekly', value: '0 3 * * 0', description: 'Every Sunday at 3:00 AM' },
]

const CUSTOM_INDEX = SCHEDULE_PRESETS.length

export default function Settings() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const [host, setHost] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [schedule, setSchedule] = useState('0 3 * * *')
  const [schedulePreset, setSchedulePreset] = useState(0)
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  // TMDB state
  const [tmdbApiKey, setTmdbApiKey] = useState('')
  const [showTmdbKey, setShowTmdbKey] = useState(false)
  const [tmdbTestResult, setTmdbTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [tmdbTestLoading, setTmdbTestLoading] = useState(false)
  const [tmdbCacheResult, setTmdbCacheResult] = useState<string | null>(null)
  const [tmdbCacheLoading, setTmdbCacheLoading] = useState(false)

  useEffect(() => {
    if (settings) {
      setHost(settings.emby_host ?? '')
      setApiKey(settings.emby_api_key ?? '')
      setTmdbApiKey(settings.tmdb_api_key ?? '')
      setSchedule(settings.sync_schedule ?? '0 3 * * *')
      setSyncEnabled(settings.sync_enabled === 'true')

      const presetIndex = SCHEDULE_PRESETS.findIndex((p) => p.value === settings.sync_schedule)
      setSchedulePreset(presetIndex >= 0 ? presetIndex : CUSTOM_INDEX)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  async function handleTest() {
    setTestLoading(true)
    setTestResult(null)
    try {
      const result = await testConnection(host, apiKey)
      setTestResult({
        ok: true,
        message: `Connected to ${result.ServerName} (v${result.Version})`,
      })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Connection failed'
      setTestResult({ ok: false, message: msg })
    } finally {
      setTestLoading(false)
    }
  }

  function handleSchedulePresetChange(index: number) {
    setSchedulePreset(index)
    if (index < CUSTOM_INDEX) {
      setSchedule(SCHEDULE_PRESETS[index].value)
    }
  }

  function handleSave() {
    const update: Record<string, string> = {
      emby_host: host,
      sync_schedule: schedule,
      sync_enabled: syncEnabled ? 'true' : 'false',
    }
    if (apiKey && apiKey !== '••••••••') {
      update['emby_api_key'] = apiKey
    }
    if (tmdbApiKey && tmdbApiKey !== '••••••••') {
      update['tmdb_api_key'] = tmdbApiKey
    }
    saveMutation.mutate(update)
  }

  async function handleTmdbTest() {
    setTmdbTestLoading(true)
    setTmdbTestResult(null)
    try {
      const result = await testTmdbConnection(tmdbApiKey)
      setTmdbTestResult({ ok: true, message: `Connected to ${result.name} API v${result.version}` })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Connection failed'
      setTmdbTestResult({ ok: false, message: msg })
    } finally {
      setTmdbTestLoading(false)
    }
  }

  async function handleRefreshTmdbCache() {
    setTmdbCacheLoading(true)
    setTmdbCacheResult(null)
    try {
      const result = await refreshTmdbCache()
      setTmdbCacheResult(`Refreshed ${result.refreshed} entries${result.failed > 0 ? `, ${result.failed} failed` : ''}.`)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Refresh failed'
      setTmdbCacheResult(msg)
    } finally {
      setTmdbCacheLoading(false)
    }
  }

  if (isLoading) {
    return <div className={styles.loading}>Loading settings…</div>
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Settings</h1>
      </div>

      <div className={styles.sections}>
        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Emby Connection</h2>

          <div className={styles.field}>
            <label className={styles.label}>Emby Host URL</label>
            <input
              className={styles.input}
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="http://192.168.1.100:8096"
            />
            <p className={styles.hint}>
              Include the protocol and port. Do not include a trailing slash.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>API Key</label>
            <div className={styles.inputRow}>
              <input
                className={styles.input}
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Emby API key"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className={styles.hint}>
              Found in Emby Dashboard → Advanced → API Keys.
            </p>
          </div>

          <div className={styles.testRow}>
            <Button
              variant="secondary"
              onClick={handleTest}
              loading={testLoading}
            >
              Test Connection
            </Button>
            {testResult && (
              <span
                className={[
                  styles.testResult,
                  testResult.ok ? styles.ok : styles.fail,
                ].join(' ')}
              >
                {testResult.message}
              </span>
            )}
          </div>
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>TMDB Integration</h2>

          <div className={styles.field}>
            <label className={styles.label}>TMDB API Key</label>
            <div className={styles.inputRow}>
              <input
                className={styles.input}
                type={showTmdbKey ? 'text' : 'password'}
                value={tmdbApiKey}
                onChange={(e) => setTmdbApiKey(e.target.value)}
                placeholder="Your TMDB API key (v3)"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTmdbKey((v) => !v)}
              >
                {showTmdbKey ? 'Hide' : 'Show'}
              </Button>
            </div>
            <p className={styles.hint}>
              Required for TMDB-backed collections. Get a free key at themoviedb.org → Settings → API.
            </p>
          </div>

          <div className={styles.testRow}>
            <Button
              variant="secondary"
              onClick={handleTmdbTest}
              loading={tmdbTestLoading}
              disabled={!tmdbApiKey || tmdbApiKey === '••••••••'}
            >
              Test TMDB Key
            </Button>
            {tmdbTestResult && (
              <span
                className={[
                  styles.testResult,
                  tmdbTestResult.ok ? styles.ok : styles.fail,
                ].join(' ')}
              >
                {tmdbTestResult.message}
              </span>
            )}
          </div>

          <div className={styles.testRow}>
            <Button
              variant="ghost"
              onClick={handleRefreshTmdbCache}
              loading={tmdbCacheLoading}
            >
              Refresh Company Cache
            </Button>
            {tmdbCacheResult && (
              <span className={styles.testResult}>{tmdbCacheResult}</span>
            )}
          </div>
          <p className={styles.hint}>
            Re-resolves all cached TMDB company IDs. Use if company mappings appear stale.
          </p>
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Auto-Sync Schedule</h2>

          <div className={styles.field}>
            <div className={styles.toggleRow}>
              <label className={styles.label}>Enable Auto-Sync</label>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  onChange={(e) => setSyncEnabled(e.target.checked)}
                />
                <span className={styles.switchTrack}>
                  <span className={styles.switchThumb} />
                </span>
              </label>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Schedule</label>
            <div className={styles.scheduleGrid}>
              {SCHEDULE_PRESETS.map((preset, index) => (
                <button
                  key={preset.value}
                  type="button"
                  className={[
                    styles.scheduleOption,
                    schedulePreset === index ? styles.scheduleOptionSelected : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleSchedulePresetChange(index)}
                  disabled={!syncEnabled}
                >
                  <span className={styles.scheduleLabel}>{preset.label}</span>
                  <span className={styles.scheduleDesc}>{preset.description}</span>
                </button>
              ))}
              <button
                type="button"
                className={[
                  styles.scheduleOption,
                  styles.scheduleCustom,
                  schedulePreset === CUSTOM_INDEX ? styles.scheduleOptionSelected : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleSchedulePresetChange(CUSTOM_INDEX)}
                disabled={!syncEnabled}
              >
                <span className={styles.scheduleLabel}>Custom</span>
                <input
                  className={styles.customCronInput}
                  value={schedule}
                  onChange={(e) => {
                    setSchedule(e.target.value)
                    setSchedulePreset(CUSTOM_INDEX)
                  }}
                  placeholder="0 3 * * *"
                  disabled={!syncEnabled}
                  onClick={(e) => e.stopPropagation()}
                />
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.saveRow}>
        <Button onClick={handleSave} loading={saveMutation.isPending} size="lg">
          Save Settings
        </Button>
        {saved && <span className={styles.savedMsg}>Saved.</span>}
      </div>
    </div>
  )
}
