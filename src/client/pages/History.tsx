import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getSyncHistory, SyncHistoryItem } from '../api'
import styles from './History.module.css'

function formatDuration(ms: number | null): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = (ms / 1000).toFixed(1)
  return `${s}s`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'success'
      ? 'success'
      : status === 'error'
      ? 'error'
      : 'running'
  return <span className={[styles.statusBadge, styles[cls]].join(' ')}>{status}</span>
}

export default function History() {
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['sync-history'],
    queryFn: getSyncHistory,
    refetchInterval: 10_000,
  })

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.heading}>Sync History</h1>
        <p className={styles.sub}>Last {history.length} sync runs</p>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading…</div>
      ) : history.length === 0 ? (
        <div className={styles.empty}>No sync runs yet. Trigger a sync to get started.</div>
      ) : (
        <div className={styles.timeline}>
          {history.map((item: SyncHistoryItem) => {
            const isExpanded = expanded === item.id
            const duration =
              item.completed_at && item.started_at
                ? new Date(item.completed_at).getTime() -
                  new Date(item.started_at).getTime()
                : null

            return (
              <div key={item.id} className={styles.entry}>
                <div className={styles.entryDot} data-status={item.status} />
                <div className={styles.entryContent}>
                  <div
                    className={styles.entryHeader}
                    onClick={() => setExpanded(isExpanded ? null : item.id)}
                  >
                    <div className={styles.entryMeta}>
                      <StatusBadge status={item.status} />
                      <span className={styles.entryDate}>
                        {formatDate(item.started_at)}
                      </span>
                      <span className={styles.entryDuration}>
                        {formatDuration(duration)}
                      </span>
                    </div>
                    <div className={styles.entryStats}>
                      {item.summary && item.status !== 'running' && (
                        <>
                          <span className={styles.stat}>
                            +{item.summary.totalAdded ?? 0} added
                          </span>
                          <span className={styles.stat}>
                            −{item.summary.totalRemoved ?? 0} removed
                          </span>
                          <span className={styles.stat}>
                            {item.summary.collections?.length ?? 0} collections
                          </span>
                        </>
                      )}
                      {item.status === 'running' && (
                        <span className={styles.running}>In progress…</span>
                      )}
                    </div>
                    <button className={styles.expandBtn}>
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>

                  {isExpanded && item.summary && (
                    <div className={styles.details}>
                      {item.summary.error ? (
                        <div className={styles.errorMsg}>{item.summary.error}</div>
                      ) : (
                        <table className={styles.detailTable}>
                          <thead>
                            <tr>
                              <th>Collection</th>
                              <th>Total</th>
                              <th>Added</th>
                              <th>Removed</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.summary.collections?.map((c) => (
                              <tr key={c.name}>
                                <td>{c.name}</td>
                                <td>{c.total}</td>
                                <td className={styles.added}>+{c.added}</td>
                                <td className={styles.removed}>−{c.removed}</td>
                                <td>
                                  {c.error ? (
                                    <span className={styles.errText}>{c.error}</span>
                                  ) : (
                                    <span className={styles.okText}>OK</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
