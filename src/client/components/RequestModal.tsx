import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getSettings,
  getSonarrQualityProfiles,
  getSonarrRootFolders,
  getRadarrQualityProfiles,
  getRadarrRootFolders,
  requestSonarrBatch,
  requestRadarrBatch,
  addSonarrSeries,
  addRadarrMovie,
  getRadarrReleases,
  getSonarrReleases,
  downloadRadarrRelease,
  downloadSonarrRelease,
  SonarrBatchItem,
  RadarrBatchItem,
  SonarrBatchResult,
  RadarrBatchResult,
  RadarrRelease,
  SonarrRelease,
} from '../api'
import Button from './Button'
import styles from './RequestModal.module.css'

type ClientType = 'sonarr' | 'radarr'
type ModalMode = 'select' | 'quick-add' | 'interactive-search'
type InteractiveStep = 'adding' | 'releases'

interface EmbyItemLike {
  Id?: string
  Name?: string
  Type?: string
  ProductionYear?: number
  ProviderIds?: { Imdb?: string; IMDB?: string; Tvdb?: string; TVDB?: string; Tmdb?: string; TMDB?: string }
}

interface TmdbItemLike {
  id: number
  name?: string
  type?: 'movie' | 'tv'
  year?: number | null
  imdb_id?: string | null
  tvdb_id?: number | null
}

type RequestItem = EmbyItemLike | TmdbItemLike

interface RequestModalProps {
  open: boolean
  clientType: ClientType
  items: RequestItem[]
  onClose: () => void
  onSuccess: (added: number, failed: number, requestedIds: number[]) => void
}

interface ItemDisplay {
  id: string
  name: string
  year?: number
  type: string
  providerId: string
}

interface ReleaseDisplay {
  guid: string
  quality: string
  size: string
  indexer: string
  seeders: number
  title: string
  approved: boolean
  rejected: boolean
  movieId?: number
  seriesId?: number
}

function extractItems(items: RequestItem[], clientType: ClientType): ItemDisplay[] {
  return items
    .filter((item) => {
      let type: string
      if ('_tmdbId' in item) {
        type = (item as TmdbItemLike & { _tmdbId: number }).type === 'movie' ? 'Movie' : 'Series'
      } else if ('Type' in item) {
        type = (item as EmbyItemLike).Type ?? ''
      } else {
        type = (item as TmdbItemLike).type === 'movie' ? 'Movie' : 'Series'
      }
      if (clientType === 'radarr') return type === 'Movie'
      if (clientType === 'sonarr') return type === 'Series'
      return false
    })
    .map((item) => {
      if ('_tmdbId' in item) {
        const tmdbItem = item as TmdbItemLike & { _tmdbId: number }
        if (clientType === 'radarr') {
          return { id: String(tmdbItem._tmdbId), name: tmdbItem.name ?? '', year: tmdbItem.year ?? undefined, type: 'Movie', providerId: String(tmdbItem._tmdbId) } as ItemDisplay
        } else {
          return { id: String(tmdbItem._tmdbId), name: tmdbItem.name ?? '', year: tmdbItem.year ?? undefined, type: 'Series', providerId: String(tmdbItem.tvdb_id ?? tmdbItem._tmdbId) } as ItemDisplay
        }
      } else if ('Id' in item) {
        const embyItem = item as EmbyItemLike
        if (clientType === 'radarr') {
          const tmdbId = embyItem.ProviderIds?.Tmdb ?? embyItem.ProviderIds?.TMDB
          return { id: embyItem.Id ?? '', name: embyItem.Name ?? '', year: embyItem.ProductionYear, type: embyItem.Type ?? '', providerId: String(tmdbId ?? '') } as ItemDisplay
        } else {
          const tvdbId = embyItem.ProviderIds?.Tvdb ?? embyItem.ProviderIds?.TVDB
          return { id: embyItem.Id ?? '', name: embyItem.Name ?? '', year: embyItem.ProductionYear, type: embyItem.Type ?? '', providerId: String(tvdbId ?? '') } as ItemDisplay
        }
      } else {
        const tmdbItem = item as TmdbItemLike
        if (clientType === 'radarr') {
          return { id: String(tmdbItem.id), name: tmdbItem.name ?? '', year: tmdbItem.year ?? undefined, type: 'Movie', providerId: String(tmdbItem.id) } as ItemDisplay
        } else {
          return { id: String(tmdbItem.id), name: tmdbItem.name ?? '', year: tmdbItem.year ?? undefined, type: 'Series', providerId: String(tmdbItem.tvdb_id ?? tmdbItem.id) } as ItemDisplay
        }
      }
    })
    .filter((item) => item.providerId && item.providerId !== 'undefined' && item.providerId !== 'null')
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

export default function RequestModal({
  open,
  clientType,
  items,
  onClose,
  onSuccess,
}: RequestModalProps) {
  const [mode, setMode] = useState<ModalMode>('select')
  const [interactiveStep, setInteractiveStep] = useState<InteractiveStep>('adding')
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null)
  const [rootFolderPath, setRootFolderPath] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Interactive search state
  const [interactiveError, setInteractiveError] = useState<string | null>(null)
  const [addingProgress, setAddingProgress] = useState('')
  const [allReleases, setAllReleases] = useState<ReleaseDisplay[]>([])
  const [selectedGuids, setSelectedGuids] = useState<Set<string>>(new Set())

  // Fetch saved settings for defaults
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    enabled: open,
  })

  const { data: sonarrProfiles = [] } = useQuery({
    queryKey: ['sonarr-quality-profiles'],
    queryFn: getSonarrQualityProfiles,
    enabled: open && clientType === 'sonarr',
  })

  const { data: sonarrFolders = [] } = useQuery({
    queryKey: ['sonarr-root-folders'],
    queryFn: getSonarrRootFolders,
    enabled: open && clientType === 'sonarr',
  })

  const { data: radarrProfiles = [] } = useQuery({
    queryKey: ['radarr-quality-profiles'],
    queryFn: getRadarrQualityProfiles,
    enabled: open && clientType === 'radarr',
  })

  const { data: radarrFolders = [] } = useQuery({
    queryKey: ['radarr-root-folders'],
    queryFn: getRadarrRootFolders,
    enabled: open && clientType === 'radarr',
  })

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setMode('select')
      setInteractiveStep('adding')
      setQualityProfileId(null)
      setRootFolderPath('')
      setError(null)
      setInteractiveError(null)
      setAddingProgress('')
      setAllReleases([])
      setSelectedGuids(new Set())
    }
  }, [open])

  // Auto-select default quality profile when profiles load
  useEffect(() => {
    const profiles = clientType === 'sonarr' ? sonarrProfiles : radarrProfiles
    if (profiles.length > 0 && qualityProfileId === null) {
      const savedProfileId = clientType === 'sonarr'
        ? Number(settings?.sonarr_quality_profile) || null
        : Number(settings?.radarr_quality_profile) || null
      if (savedProfileId && profiles.some((p: { id: number }) => p.id === savedProfileId)) {
        setQualityProfileId(savedProfileId)
      } else {
        const hd = profiles.find((p: { name: string; id: number }) =>
          p.name.toLowerCase().includes('hd')
        )
        setQualityProfileId(hd?.id ?? profiles[0]?.id ?? null)
      }
    }
  }, [sonarrProfiles, radarrProfiles, clientType, qualityProfileId, settings])

  // Auto-select default root folder when folders load
  useEffect(() => {
    const folderList = clientType === 'sonarr' ? sonarrFolders : radarrFolders
    if (folderList.length > 0 && !rootFolderPath) {
      const savedFolder = clientType === 'sonarr'
        ? settings?.sonarr_root_folder || ''
        : settings?.radarr_root_folder || ''
      if (savedFolder && folderList.some((f: { path: string }) => f.path === savedFolder)) {
        setRootFolderPath(savedFolder)
      }
    }
  }, [sonarrFolders, radarrFolders, clientType, rootFolderPath, settings])

  const displayItems = extractItems(items, clientType)
  const clientLabel = clientType === 'sonarr' ? 'Sonarr' : 'Radarr'
  const clientAccent = clientType === 'sonarr' ? 'var(--accent-sonarr)' : 'var(--accent-radarr)'
  const profiles = clientType === 'sonarr' ? sonarrProfiles : radarrProfiles
  const folders = clientType === 'sonarr' ? sonarrFolders : radarrFolders

  // Quick Add submit
  async function handleQuickAdd() {
    setError(null)
    setSubmitting(true)
    try {
      let result: SonarrBatchResult | RadarrBatchResult
      let requestedIds: number[] = []

      if (clientType === 'sonarr') {
        const batchItems: SonarrBatchItem[] = displayItems.map((item) => ({
          tvdbId: parseInt(item.providerId, 10),
          title: item.name,
        }))
        result = await requestSonarrBatch({
          items: batchItems,
          qualityProfileId: qualityProfileId ?? undefined,
          rootFolderPath: rootFolderPath || undefined,
        })
        requestedIds = (result as SonarrBatchResult).results
          .filter((r) => r.success)
          .map((r) => r.tvdbId)
      } else {
        const batchItems: RadarrBatchItem[] = displayItems.map((item) => ({
          tmdbId: parseInt(item.providerId, 10),
        }))
        result = await requestRadarrBatch({
          items: batchItems,
          qualityProfileId: qualityProfileId ?? undefined,
          rootFolderPath: rootFolderPath || undefined,
        })
        requestedIds = (result as RadarrBatchResult).results
          .filter((r) => r.success)
          .map((r) => r.tmdbId)
      }

      const added = (result.results as { success: boolean }[]).filter((r) => r.success).length
      const failed = (result.results as { success: boolean }[]).filter((r) => !r.success).length
      onSuccess(added, failed, requestedIds)
      onClose()
    } catch (err) {
      setError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to submit request'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Interactive search: add items silently, then fetch releases
  async function startInteractiveSearch() {
    setMode('interactive-search')
    setInteractiveStep('adding')
    setInteractiveError(null)
    setAddingProgress('Adding items…')
    setAllReleases([])
    setSelectedGuids(new Set())

    try {
      const addedIds: { providerId: number; internalId: number; title: string }[] = []

      if (clientType === 'sonarr') {
        // Add each series silently, then fetch releases
        for (let i = 0; i < displayItems.length; i++) {
          const item = displayItems[i]
          setAddingProgress(`Adding ${item.name}… (${i + 1}/${displayItems.length})`)
          const tvdbId = parseInt(item.providerId, 10)
          try {
            const added = await addSonarrSeries({
              tvdbId,
              title: item.name,
              qualityProfileId: qualityProfileId ?? undefined,
              rootFolderPath: rootFolderPath || undefined,
            })
            addedIds.push({ providerId: tvdbId, internalId: added.id, title: item.name })
          } catch {
            // Skip failures silently — already exists is fine
            // Try to get existing series by tvdbId to get its ID
            addedIds.push({ providerId: tvdbId, internalId: 0, title: item.name })
          }
        }
      } else {
        // Radarr: add each movie silently, then fetch releases
        for (let i = 0; i < displayItems.length; i++) {
          const item = displayItems[i]
          setAddingProgress(`Adding ${item.name}… (${i + 1}/${displayItems.length})`)
          const tmdbId = parseInt(item.providerId, 10)
          try {
            const added = await addRadarrMovie({
              tmdbId,
              qualityProfileId: qualityProfileId ?? undefined,
              rootFolderPath: rootFolderPath || undefined,
            })
            addedIds.push({ providerId: tmdbId, internalId: added.id, title: item.name })
          } catch {
            addedIds.push({ providerId: tmdbId, internalId: 0, title: item.name })
          }
        }
      }

      setAddingProgress('Fetching releases…')

      // Fetch releases for all added items
      const releaseResults: ReleaseDisplay[] = []
      for (const { internalId, title } of addedIds) {
        if (!internalId) continue
        try {
          if (clientType === 'sonarr') {
            const releases: SonarrRelease[] = await getSonarrReleases(internalId)
            for (const rel of releases) {
              releaseResults.push({
                guid: rel.guid,
                quality: rel.quality.name,
                size: formatSize(rel.size),
                indexer: rel.indexer,
                seeders: rel.seeders,
                title,
                approved: rel.approved,
                rejected: rel.rejected,
                seriesId: internalId,
              })
            }
          } else {
            const releases: RadarrRelease[] = await getRadarrReleases(internalId)
            for (const rel of releases) {
              releaseResults.push({
                guid: rel.guid,
                quality: rel.quality.name,
                size: formatSize(rel.size),
                indexer: rel.indexer,
                seeders: rel.seeders,
                title,
                approved: rel.approved,
                rejected: rel.rejected,
                movieId: internalId,
              })
            }
          }
        } catch {
          // Skip fetch failures
        }
      }

      setAllReleases(releaseResults)
      setInteractiveStep('releases')
    } catch (err) {
      setInteractiveError(
        (err as { message?: string })?.message ?? 'Failed to fetch releases'
      )
      setInteractiveStep('releases')
    }
  }

  function toggleRelease(guid: string) {
    setSelectedGuids((prev) => {
      const next = new Set(prev)
      if (next.has(guid)) next.delete(guid)
      else next.add(guid)
      return next
    })
  }

  async function handleInteractiveSubmit() {
    if (selectedGuids.size === 0) return
    setSubmitting(true)
    setInteractiveError(null)

    try {
      const downloadPromises: Promise<unknown>[] = []
      const guids = Array.from(selectedGuids)

      for (const rel of allReleases) {
        if (!selectedGuids.has(rel.guid)) continue
        if (rel.seriesId) {
          downloadPromises.push(
            downloadSonarrRelease({
              guid: rel.guid,
              seriesId: rel.seriesId,
              qualityProfileId: qualityProfileId ?? undefined,
            })
          )
        } else if (rel.movieId) {
          downloadPromises.push(
            downloadRadarrRelease({
              guid: rel.guid,
              movieId: rel.movieId,
              qualityProfileId: qualityProfileId ?? undefined,
            })
          )
        }
      }

      await Promise.allSettled(downloadPromises)
      onSuccess(selectedGuids.size, 0, [])
      onClose()
    } catch (err) {
      setInteractiveError(
        (err as { message?: string })?.message ?? 'Failed to download releases'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header} style={{ '--client-accent': clientAccent } as React.CSSProperties}>
          <div className={styles.headerIcon}>
            {clientType === 'sonarr' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" fill="currentColor"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div>
            <h2 className={styles.title}>Request to {clientLabel}</h2>
            <p className={styles.subtitle}>
              {mode === 'select'
                ? `${displayItems.length} item${displayItems.length !== 1 ? 's' : ''} selected`
                : mode === 'quick-add'
                ? `${displayItems.length} item${displayItems.length !== 1 ? 's' : ''}`
                : interactiveStep === 'adding'
                ? addingProgress
                : `${selectedGuids.size} release${selectedGuids.size !== 1 ? 's' : ''} selected`}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Mode: Select */}
          {mode === 'select' && (
            <>
              <div className={styles.itemList}>
                {displayItems.slice(0, 8).map((item) => (
                  <div key={item.id} className={styles.itemRow}>
                    <span className={styles.itemName}>{item.name}</span>
                    {item.year && <span className={styles.itemYear}>{item.year}</span>}
                  </div>
                ))}
                {displayItems.length > 8 && (
                  <div className={styles.itemMore}>+{displayItems.length - 8} more</div>
                )}
                {displayItems.length === 0 && (
                  <div className={styles.noItems}>
                    No valid {clientType === 'sonarr' ? 'series' : 'movies'} found.
                  </div>
                )}
              </div>

              <div className={styles.modeButtons}>
                <button
                  className={styles.modeBtn}
                  onClick={() => setMode('quick-add')}
                >
                  <span className={styles.modeBtnIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                      <polyline points="13 2 13 9 20 9"/>
                    </svg>
                  </span>
                  <span className={styles.modeBtnLabel}>Quick Add</span>
                  <span className={styles.modeBtnDesc}>Add with defaults — downloads immediately</span>
                </button>

                <button
                  className={styles.modeBtn}
                  onClick={startInteractiveSearch}
                >
                  <span className={styles.modeBtnIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="M21 21l-4.35-4.35"/>
                    </svg>
                  </span>
                  <span className={styles.modeBtnLabel}>Interactive Search</span>
                  <span className={styles.modeBtnDesc}>Pick specific releases from your indexers</span>
                </button>
              </div>
            </>
          )}

          {/* Mode: Quick Add */}
          {mode === 'quick-add' && (
            <>
              <div className={styles.itemList}>
                {displayItems.slice(0, 8).map((item) => (
                  <div key={item.id} className={styles.itemRow}>
                    <span className={styles.itemName}>{item.name}</span>
                    {item.year && <span className={styles.itemYear}>{item.year}</span>}
                  </div>
                ))}
                {displayItems.length > 8 && (
                  <div className={styles.itemMore}>+{displayItems.length - 8} more</div>
                )}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Quality Profile</label>
                <select
                  className={styles.select}
                  value={qualityProfileId ?? ''}
                  onChange={(e) => setQualityProfileId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select quality profile…</option>
                  {profiles.map((p: { id: number; name: string }) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Root Folder</label>
                <select
                  className={styles.select}
                  value={rootFolderPath}
                  onChange={(e) => setRootFolderPath(e.target.value)}
                >
                  <option value="">Select root folder…</option>
                  {folders.map((f: { path: string; freeSpace?: number }) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                      {f.freeSpace ? ` — ${(f.freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {error && <div className={styles.error}>{error}</div>}
            </>
          )}

          {/* Mode: Interactive Search */}
          {mode === 'interactive-search' && interactiveStep === 'adding' && (
            <div className={styles.interactiveStatus}>
              <div className={styles.spinner} />
              <p>{addingProgress}</p>
            </div>
          )}

          {mode === 'interactive-search' && interactiveStep === 'releases' && (
            <>
              {interactiveError && <div className={styles.error}>{interactiveError}</div>}

              <div className={styles.releaseList}>
                {allReleases.length === 0 && (
                  <div className={styles.noItems}>No releases found.</div>
                )}
                {allReleases.slice(0, 50).map((rel) => {
                  const isSelected = selectedGuids.has(rel.guid)
                  return (
                    <div
                      key={rel.guid}
                      className={[styles.releaseRow, isSelected ? styles.releaseRowSelected : ''].filter(Boolean).join(' ')}
                      onClick={() => toggleRelease(rel.guid)}
                    >
                      <div className={styles.releaseCheckbox}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleRelease(rel.guid)} />
                      </div>
                      <div className={styles.releaseInfo}>
                        <div className={styles.releaseTitleRow}>
                          <span className={styles.releaseTitle}>{rel.title}</span>
                          {!rel.approved && (
                            <span className={styles.releaseRejected} title={rel.rejected ? 'Rejected: ' + rel.rejected : 'Not approved'}>⚠</span>
                          )}
                        </div>
                        <div className={styles.releaseMeta}>
                          <span className={styles.releaseQuality}>{rel.quality}</span>
                          <span className={styles.releaseDot}>·</span>
                          <span className={styles.releaseSize}>{rel.size}</span>
                          <span className={styles.releaseDot}>·</span>
                          <span className={styles.releaseIndexer}>{rel.indexer}</span>
                          {rel.seeders >= 0 && (
                            <>
                              <span className={styles.releaseDot}>·</span>
                              <span className={styles.releaseSeeders}>⚤ {rel.seeders}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {allReleases.length > 50 && (
                  <div className={styles.itemMore}>+{allReleases.length - 50} more releases</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {mode === 'select' && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          {mode === 'quick-add' && (
            <>
              <Button variant="ghost" onClick={() => setMode('select')} disabled={submitting}>
                Back
              </Button>
              <Button
                variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
                onClick={handleQuickAdd}
                loading={submitting}
                disabled={displayItems.length === 0 || !qualityProfileId}
              >
                Request {displayItems.length} to {clientLabel}
              </Button>
            </>
          )}
          {mode === 'interactive-search' && interactiveStep === 'releases' && (
            <>
              <Button variant="ghost" onClick={() => setMode('select')} disabled={submitting}>
                Back
              </Button>
              <Button
                variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
                onClick={handleInteractiveSubmit}
                loading={submitting}
                disabled={selectedGuids.size === 0}
              >
                Download {selectedGuids.size} Release{selectedGuids.size !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
