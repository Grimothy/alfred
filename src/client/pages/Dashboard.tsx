import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getSettings,
  getCollections,
  getSyncStatus,
  getSyncHistory,
  triggerSync,
} from '../api'
import Card from '../components/Card'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Toggle from '../components/Toggle'
import { toggleCollection } from '../api'
import styles from './Dashboard.module.css'

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return d.toLocaleDateString()
}

export default function Dashboard() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  })
  const { data: collections = [] } = useQuery({
    queryKey: ['collections'],
    queryFn: getCollections,
  })
  const { data: syncStatus } = useQuery({
    queryKey: ['sync-status'],
    queryFn: getSyncStatus,
    refetchInterval: 5000,
  })
  const { data: history = [] } = useQuery({
    queryKey: ['sync-history'],
    queryFn: getSyncHistory,
  })

  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync-status'] })
      qc.invalidateQueries({ queryKey: ['sync-history'] })
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      toggleCollection(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  })

  const notConfigured = !settings?.emby_host
  const lastSync = history[0]
  const totalItems = collections.reduce((sum, c) => {
    const lastSyncSummary = lastSync?.summary
    const found = lastSyncSummary?.collections?.find((r) => r.name === c.name)
    return sum + (found?.total ?? 0)
  }, 0)

  if (notConfigured) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.heading}>Alfred</h1>
            <p className={styles.tagline}>at your service.</p>
          </div>
        </div>
        <Card accent className={styles.setupCard}>
          <div className={styles.setupContent}>
            <div className={styles.setupIcon}>⚙</div>
            <h2 className={styles.setupTitle}>Welcome to Alfred</h2>
            <p className={styles.setupDesc}>
              Configure your Emby server connection to get started.
            </p>
            <Button onClick={() => navigate('/settings')}>
              Configure Emby
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Alfred</h1>
          <p className={styles.tagline}>at your service.</p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          loading={syncStatus?.running || syncMutation.isPending}
          disabled={syncStatus?.running}
        >
          Sync Now
        </Button>
      </div>

      {syncStatus?.running && (
        <div className={styles.syncBanner}>
          <span className={styles.syncDot} />
          Syncing your library…
        </div>
      )}

      <div className={styles.statsRow}>
        <Card className={styles.statCard}>
          <div className={styles.statValue}>{collections.length}</div>
          <div className={styles.statLabel}>Collections</div>
        </Card>
        <Card className={styles.statCard}>
          <div className={styles.statValue}>{totalItems}</div>
          <div className={styles.statLabel}>Items Managed</div>
        </Card>
        <Card className={styles.statCard}>
          <div className={styles.statValue}>{formatRelative(lastSync?.completed_at ?? null)}</div>
          <div className={styles.statLabel}>Last Sync</div>
        </Card>
        <Card className={styles.statCard}>
          <div className={styles.statValue}>
            {settings?.sync_enabled === 'true'
              ? settings?.sync_schedule ?? '—'
              : 'Disabled'}
          </div>
          <div className={styles.statLabel}>Schedule</div>
        </Card>
      </div>

      {collections.length === 0 ? (
        <Card className={styles.emptyCard}>
          <p className={styles.emptyText}>
            Alfred is ready. Add your first collection to get started.
          </p>
          <Button variant="secondary" onClick={() => navigate('/collections')}>
            Add Collection
          </Button>
        </Card>
      ) : (
        <div className={styles.collectionsGrid}>
          {collections.map((c) => {
            const syncResult = lastSync?.summary?.collections?.find(
              (r) => r.name === c.name
            )
            return (
              <Card key={c.id} className={styles.collCard}>
                <div className={styles.collHeader}>
                  <span className={styles.collName}>{c.name}</span>
                  <Toggle
                    checked={c.enabled === 1}
                    onChange={(enabled) =>
                      toggleMutation.mutate({ id: c.id, enabled })
                    }
                  />
                </div>
                <div className={styles.collStudios}>
                  {c.rules.slice(0, 3).map((r) => (
                    <Badge key={r.id} label={r.value} variant="gold" />
                  ))}
                  {c.rules.length > 3 && (
                    <Badge label={`+${c.rules.length - 3}`} />
                  )}
                </div>
                {syncResult && (
                  <div className={styles.collStats}>
                    <span className={styles.collTotal}>
                      {syncResult.total} items
                    </span>
                    {syncResult.error && (
                      <Badge label="Sync Error" variant="error" />
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
