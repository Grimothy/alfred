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
  SonarrBatchItem,
  RadarrBatchItem,
  SonarrBatchResult,
  RadarrBatchResult,
} from '../api'
import Button from './Button'
import styles from './RequestModal.module.css'

type ClientType = 'sonarr' | 'radarr'

// Union type for items from both Emby and TMDB sources
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

function extractItems(items: RequestItem[], clientType: ClientType): ItemDisplay[] {
  return items
    .filter((item) => {
      // Determine item type based on structure
      let type: string
      if ('_tmdbId' in item) {
        // TMDB item from custom collection
        type = (item as TmdbItemLike & { _tmdbId: number }).type === 'movie' ? 'Movie' : 'Series'
      } else if ('Type' in item) {
        // Emby item
        type = (item as EmbyItemLike).Type ?? ''
      } else {
        // Regular TMDB item
        type = (item as TmdbItemLike).type === 'movie' ? 'Movie' : 'Series'
      }
      if (clientType === 'radarr') return type === 'Movie'
      if (clientType === 'sonarr') return type === 'Series'
      return false
    })
    .map((item) => {
      // Check for _tmdbId marker to identify TMDB items from custom collections
      if ('_tmdbId' in item) {
        // TMDB item from custom collection
        const tmdbItem = item as TmdbItemLike & { _tmdbId: number }
        if (clientType === 'radarr') {
          return {
            id: String(tmdbItem._tmdbId),
            name: tmdbItem.name ?? '',
            year: tmdbItem.year ?? undefined,
            type: tmdbItem.type === 'movie' ? 'Movie' : 'Series',
            providerId: String(tmdbItem._tmdbId),
          } as ItemDisplay
        } else {
          return {
            id: String(tmdbItem._tmdbId),
            name: tmdbItem.name ?? '',
            year: tmdbItem.year ?? undefined,
            type: tmdbItem.type === 'tv' ? 'Series' : 'Movie',
            providerId: String(tmdbItem.tvdb_id ?? tmdbItem._tmdbId),
          } as ItemDisplay
        }
      } else if ('Id' in item) {
        // Emby item
        if (clientType === 'radarr') {
          const tmdbId = (item as EmbyItemLike).ProviderIds?.Tmdb ?? (item as EmbyItemLike).ProviderIds?.TMDB
          return {
            id: (item as EmbyItemLike).Id ?? '',
            name: (item as EmbyItemLike).Name ?? '',
            year: (item as EmbyItemLike).ProductionYear,
            type: (item as EmbyItemLike).Type ?? '',
            providerId: String(tmdbId ?? ''),
          } as ItemDisplay
        } else {
          const tvdbId = (item as EmbyItemLike).ProviderIds?.Tvdb ?? (item as EmbyItemLike).ProviderIds?.TVDB
          return {
            id: (item as EmbyItemLike).Id ?? '',
            name: (item as EmbyItemLike).Name ?? '',
            year: (item as EmbyItemLike).ProductionYear,
            type: (item as EmbyItemLike).Type ?? '',
            providerId: String(tvdbId ?? ''),
          } as ItemDisplay
        }
      } else {
        // Other TMDB item (not from custom collection mapping)
        const tmdbItem = item as TmdbItemLike
        if (clientType === 'radarr') {
          return {
            id: String(tmdbItem.id),
            name: tmdbItem.name ?? '',
            year: tmdbItem.year ?? undefined,
            type: tmdbItem.type === 'movie' ? 'Movie' : 'Series',
            providerId: String(tmdbItem.id),
          } as ItemDisplay
        } else {
          return {
            id: String(tmdbItem.id),
            name: tmdbItem.name ?? '',
            year: tmdbItem.year ?? undefined,
            type: tmdbItem.type === 'tv' ? 'Series' : 'Movie',
            providerId: String(tmdbItem.tvdb_id ?? tmdbItem.id),
          } as ItemDisplay
        }
      }
    })
    .filter((item) => item.providerId && item.providerId !== 'undefined' && item.providerId !== 'null')
}

export default function RequestModal({
  open,
  clientType,
  items,
  onClose,
  onSuccess,
}: RequestModalProps) {
  const [qualityProfileId, setQualityProfileId] = useState<number | null>(null)
  const [rootFolderPath, setRootFolderPath] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  // Auto-select default quality profile when profiles load — prefer saved settings
  useEffect(() => {
    const profiles = clientType === 'sonarr' ? sonarrProfiles : radarrProfiles
    if (profiles.length > 0 && qualityProfileId === null) {
      // Prefer saved default from settings
      const savedProfileId = clientType === 'sonarr'
        ? Number(settings?.sonarr_quality_profile) || null
        : Number(settings?.radarr_quality_profile) || null
      if (savedProfileId && profiles.some((p: { id: number }) => p.id === savedProfileId)) {
        setQualityProfileId(savedProfileId)
      } else {
        // Fall back to "HD" or first profile
        const hd = profiles.find((p: { name: string; id: number }) =>
          p.name.toLowerCase().includes('hd')
        )
        setQualityProfileId(hd?.id ?? profiles[0]?.id ?? null)
      }
    }
  }, [sonarrProfiles, radarrProfiles, clientType, qualityProfileId, settings])

  // Auto-select default root folder when folders load — prefer saved settings
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

  async function handleSubmit() {
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
        // Extract successful tvdbIds
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
        // Extract successful tmdbIds
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
            <p className={styles.subtitle}>{displayItems.length} item{displayItems.length !== 1 ? 's' : ''} selected</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Item list */}
          <div className={styles.itemList}>
            {displayItems.slice(0, 6).map((item) => (
              <div key={item.id} className={styles.itemRow}>
                <span className={styles.itemName}>{item.name}</span>
                {item.year && <span className={styles.itemYear}>{item.year}</span>}
              </div>
            ))}
            {displayItems.length > 6 && (
              <div className={styles.itemMore}>+{displayItems.length - 6} more</div>
            )}
            {displayItems.length === 0 && (
              <div className={styles.noItems}>
                No valid {clientType === 'sonarr' ? 'series' : 'movies'} found.
                Missing provider IDs.
              </div>
            )}
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
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
            onClick={handleSubmit}
            loading={submitting}
            disabled={displayItems.length === 0 || !qualityProfileId}
          >
            Request {displayItems.length} to {clientLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
