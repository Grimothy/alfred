import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getSettings,
  getSonarrQualityProfiles,
  getSonarrRootFolders,
  getRadarrQualityProfiles,
  getRadarrRootFolders,
  lookupRadarrMovie,
  lookupSonarrSeries,
  requestSonarrBatch,
  requestRadarrBatch,
  SonarrBatchItem,
  RadarrBatchItem,
  SonarrBatchResult,
  RadarrBatchResult,
  RadarrLookupResult,
  SonarrLookupResult,
} from '../api'
import Button from './Button'
import styles from './RequestModal.module.css'

type ClientType = 'sonarr' | 'radarr'

type ModalStep = 'search' | 'configure'

interface RequestModalProps {
  open: boolean
  clientType: ClientType
  items: unknown[]
  onClose: () => void
  onSuccess: (added: number, failed: number, requestedIds: number[]) => void
}

// Normalized selected item after search confirmation
interface SelectedItem {
  providerId: number
  title: string
  year?: number
  poster?: string
}

export default function RequestModal({
  open,
  clientType,
  items,
  onClose,
  onSuccess,
}: RequestModalProps) {
  const [step, setStep] = useState<ModalStep>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<(RadarrLookupResult | SonarrLookupResult)[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null)
  const [rootFolderPath, setRootFolderPath] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setStep('search')
      setSearchQuery('')
      setSearchResults([])
      setSelectedIds(new Set())
      setQualityProfileId(null)
      setRootFolderPath('')
      setError(null)
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

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    try {
      const results = clientType === 'radarr'
        ? await lookupRadarrMovie(query)
        : await lookupSonarrSeries(query)
      setSearchResults(results)
    } catch {
      setSearchResults([])
    }
  }, [clientType])

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => performSearch(value), 350)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && searchQuery.trim()) {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      performSearch(searchQuery.trim())
    }
  }

  function toggleResult(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function handleContinue() {
    if (selectedIds.size === 0) return
    setStep('configure')
  }

  function handleBack() {
    setStep('search')
  }

  const selectedItems: SelectedItem[] = searchResults
    .filter((r) => selectedIds.has(clientType === 'radarr'
      ? (r as RadarrLookupResult).tmdbId
      : (r as SonarrLookupResult).tvdbId))
    .map((r) => {
      if (clientType === 'radarr') {
        const movie = r as RadarrLookupResult
        return { providerId: movie.tmdbId, title: movie.title, year: movie.year, poster: movie.poster }
      } else {
        const series = r as SonarrLookupResult
        return { providerId: series.tvdbId, title: series.title, year: series.year, poster: series.poster }
      }
    })

  const clientLabel = clientType === 'sonarr' ? 'Sonarr' : 'Radarr'
  const clientAccent = clientType === 'sonarr' ? 'var(--accent-sonarr)' : 'var(--accent-radarr)'
  const profiles = clientType === 'sonarr' ? sonarrProfiles : radarrProfiles
  const folders = clientType === 'sonarr' ? sonarrFolders : radarrFolders

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      let result: SonarrBatchResult | RadarrBatchResult
      let requestedIds: number[] = []

      if (clientType === 'sonarr') {
        const batchItems: SonarrBatchItem[] = selectedItems.map((item) => ({
          tvdbId: item.providerId,
          title: item.title,
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
        const batchItems: RadarrBatchItem[] = selectedItems.map((item) => ({
          tmdbId: item.providerId,
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
              {step === 'search'
                ? selectedIds.size > 0
                  ? `${selectedIds.size} selected`
                  : 'Search for titles'
                : `${selectedItems.length} item${selectedItems.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {step === 'search' && (
            <>
              {/* Search input */}
              <div className={styles.searchRow}>
                <input
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={`Search ${clientLabel}…`}
                  autoFocus
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => performSearch(searchQuery.trim())}
                >
                  Search
                </Button>
              </div>

              {/* Results list */}
              <div className={styles.resultList}>
                {searchResults.length === 0 && searchQuery.trim() && (
                  <div className={styles.noResults}>No results found.</div>
                )}
                {searchResults.slice(0, 20).map((result) => {
                  const id = clientType === 'radarr'
                    ? (result as RadarrLookupResult).tmdbId
                    : (result as SonarrLookupResult).tvdbId
                  const title = result.title
                  const year = result.year
                  const poster = result.poster
                  const isSelected = selectedIds.has(id)

                  return (
                    <div
                      key={id}
                      className={[styles.resultRow, isSelected ? styles.resultRowSelected : ''].filter(Boolean).join(' ')}
                      onClick={() => toggleResult(id)}
                    >
                      <div className={styles.resultCheckbox}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleResult(id)} />
                      </div>
                      {poster ? (
                        <img
                          className={styles.resultPoster}
                          src={`https://artworks.themoviedb.org/${poster}`}
                          alt=""
                        />
                      ) : (
                        <div className={styles.resultPosterPlaceholder} />
                      )}
                      <div className={styles.resultInfo}>
                        <span className={styles.resultTitle}>{title}</span>
                        {year && <span className={styles.resultYear}>{year}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {selectedIds.size > 0 && (
                <div className={styles.selectedSummary}>
                  {selectedIds.size} title{selectedIds.size !== 1 ? 's' : ''} selected
                </div>
              )}
            </>
          )}

          {step === 'configure' && (
            <>
              {/* Selected items review */}
              <div className={styles.selectedReview}>
                {selectedItems.map((item) => (
                  <div key={item.providerId} className={styles.reviewRow}>
                    {item.poster ? (
                      <img
                        className={styles.reviewPoster}
                        src={`https://artworks.themoviedb.org/${item.poster}`}
                        alt=""
                      />
                    ) : (
                      <div className={styles.reviewPosterPlaceholder} />
                    )}
                    <span className={styles.reviewTitle}>{item.title}</span>
                    {item.year && <span className={styles.reviewYear}>{item.year}</span>}
                  </div>
                ))}
              </div>

              {/* Quality Profile */}
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

              {/* Root Folder */}
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
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {step === 'search' ? (
            <>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
                onClick={handleContinue}
                disabled={selectedIds.size === 0}
              >
                Continue ({selectedIds.size})
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={handleBack} disabled={submitting}>
                Back
              </Button>
              <Button
                variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
                onClick={handleSubmit}
                loading={submitting}
                disabled={selectedItems.length === 0 || !qualityProfileId}
              >
                Request {selectedItems.length} to {clientLabel}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
