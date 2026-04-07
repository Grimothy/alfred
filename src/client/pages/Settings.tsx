import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings, testConnection } from '../api'
import Button from '../components/Button'
import Card from '../components/Card'
import styles from './Settings.module.css'

export default function Settings() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })

  const [host, setHost] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [schedule, setSchedule] = useState('0 3 * * *')
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) {
      setHost(settings.emby_host ?? '')
      setApiKey(settings.emby_api_key ?? '')
      setSchedule(settings.sync_schedule ?? '0 3 * * *')
      setSyncEnabled(settings.sync_enabled === 'true')
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
      const result = await testConnection()
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

  function handleSave() {
    const update: Record<string, string> = {
      emby_host: host,
      sync_schedule: schedule,
      sync_enabled: syncEnabled ? 'true' : 'false',
    }
    if (apiKey && apiKey !== '••••••••') {
      update['emby_api_key'] = apiKey
    }
    saveMutation.mutate(update)
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
            <label className={styles.label}>Cron Schedule</label>
            <input
              className={styles.input}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              disabled={!syncEnabled}
              placeholder="0 3 * * *"
            />
            <p className={styles.hint}>
              Default: <code>0 3 * * *</code> (3:00 AM daily). Uses standard 5-field cron syntax.
            </p>
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
