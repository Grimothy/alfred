import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateSettings, testConnection } from '../api'
import Button from '../components/Button'
import styles from './Setup.module.css'

export default function Setup() {
  const navigate = useNavigate()
  const [host, setHost] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleTest() {
    setTestLoading(true)
    setTestResult(null)
    // Temporarily save so test endpoint can read them
    await updateSettings({ emby_host: host, emby_api_key: apiKey })
    try {
      const result = await testConnection()
      setTestResult({ ok: true, message: `Connected — ${result.ServerName}` })
    } catch {
      setTestResult({ ok: false, message: 'Connection failed. Check host and API key.' })
    } finally {
      setTestLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    await updateSettings({ emby_host: host, emby_api_key: apiKey })
    navigate('/')
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Alfred</h1>
        <p className={styles.tagline}>at your service.</p>
        <p className={styles.desc}>
          Connect Alfred to your Emby server to get started.
        </p>

        <div className={styles.field}>
          <label className={styles.label}>Emby Host URL</label>
          <input
            className={styles.input}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="http://192.168.1.100:8096"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>API Key</label>
          <input
            className={styles.input}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Your Emby API key"
          />
        </div>

        {testResult && (
          <div
            className={[
              styles.testResult,
              testResult.ok ? styles.ok : styles.fail,
            ].join(' ')}
          >
            {testResult.message}
          </div>
        )}

        <div className={styles.actions}>
          <Button
            variant="secondary"
            onClick={handleTest}
            loading={testLoading}
            disabled={!host || !apiKey}
          >
            Test Connection
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!host || !apiKey}
          >
            Save & Continue
          </Button>
        </div>
      </div>
    </div>
  )
}
