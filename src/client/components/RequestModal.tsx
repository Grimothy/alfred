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
  getSonarrEpisodes,
  getSonarrSeriesById,
  downloadRadarrRelease,
  downloadSonarrRelease,
  checkRadarrMovieExists,
  checkSonarrSeriesExists,
  updateSonarrSeasonMonitoring,
  SonarrBatchItem,
  RadarrBatchItem,
  SonarrBatchResult,
  RadarrBatchResult,
  RadarrRelease,
  SonarrRelease,
  SonarrEpisode,
} from '../api'
import Button from './Button'
import styles from './RequestModal.module.css'

type ClientType = 'sonarr' | 'radarr'
type ModalMode = 'select' | 'quick-add' | 'interactive-setup' | 'interactive-search'
// For Sonarr with season context: 'adding' → 'episode-releases' (step through episodes) → 'summary'
// For Radarr or no season context: 'adding' → 'releases'
type InteractiveStep = 'adding' | 'releases' | 'episode-releases' | 'summary'

interface MissingEpisode {
  id: number
  episodeNumber: number
  seasonNumber: number
  title: string
}

interface EpisodeReleaseSelection {
  episode: MissingEpisode
  selectedGuid: string | null // null = skipped
  releases: ReleaseDisplay[]
}

interface EmbyItemLike {
  Id?: string
  Name?: string
  Type?: string
  ProductionYear?: number
  ProviderIds?: { Imdb?: string; IMDB?: string; Tvdb?: string; TVDB?: string; Tmdb?: string; TMDB?: string }
  _season?: number
  _partial?: boolean
  _episodeId?: number
  _missingCount?: number
  _sonarrId?: number
}

interface TmdbItemLike {
  id: number
  name?: string
  type?: 'movie' | 'tv'
  year?: number | null
  imdb_id?: string | null
  tvdb_id?: number | null
  _season?: number
  _partial?: boolean
  _episodeId?: number
  _missingCount?: number
  _sonarrId?: number
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
  seasonNumber?: number
  isPartial?: boolean
  episodeId?: number
  missingCount?: number
  sonarrId?: number
}

interface ReleaseDisplay {
  guid: string
  quality: string
  source: string
  resolution: number
  size: number
  sizeFormatted: string
  indexer: string
  indexerId: number
  seeders: number
  leechers: number
  title: string
  approved: boolean
  rejected: boolean
  rejectedReason: string
  customFormatScore: number
  releaseGroup: string
  customFormats: string[]
  movieId?: number
  seriesId?: number
  episodeId?: number
}

function normalizeCustomFormats(
  customFormats: unknown
): string[] {
  if (!Array.isArray(customFormats)) return []
  return customFormats
    .map((cf) => {
      if (typeof cf === 'string') return cf
      if (cf && typeof cf === 'object') {
        const obj = cf as { name?: unknown; id?: unknown }
        if (typeof obj.name === 'string') return obj.name
        if (typeof obj.id === 'number') return `CF ${obj.id}`
      }
      return ''
    })
    .filter((name) => name.length > 0)
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
      const seasonNumber = '_season' in item ? (item as EmbyItemLike & { _season?: number })._season : undefined
      const isPartial = '_partial' in item ? (item as EmbyItemLike & { _partial?: boolean })._partial : undefined
      const episodeId = '_episodeId' in item ? (item as EmbyItemLike & { _episodeId?: number })._episodeId : undefined
      const missingCount = '_missingCount' in item ? (item as EmbyItemLike & { _missingCount?: number })._missingCount : undefined
      const sonarrId = '_sonarrId' in item ? (item as EmbyItemLike & { _sonarrId?: number })._sonarrId : undefined

      if ('_tmdbId' in item) {
        const tmdbItem = item as TmdbItemLike & { _tmdbId: number }
        if (clientType === 'radarr') {
          return { id: String(tmdbItem._tmdbId), name: tmdbItem.name ?? '', year: tmdbItem.year ?? undefined, type: 'Movie', providerId: String(tmdbItem._tmdbId), seasonNumber, isPartial, episodeId, missingCount, sonarrId } as ItemDisplay
        } else {
          return { id: String(tmdbItem._tmdbId), name: tmdbItem.name ?? '', year: tmdbItem.year ?? undefined, type: 'Series', providerId: String(tmdbItem.tvdb_id ?? tmdbItem._tmdbId), seasonNumber, isPartial, episodeId, missingCount, sonarrId } as ItemDisplay
        }
      } else if ('Id' in item) {
        const embyItem = item as EmbyItemLike
        if (clientType === 'radarr') {
          const tmdbId = embyItem.ProviderIds?.Tmdb ?? embyItem.ProviderIds?.TMDB
          return { id: embyItem.Id ?? '', name: embyItem.Name ?? '', year: embyItem.ProductionYear, type: embyItem.Type ?? '', providerId: String(tmdbId ?? ''), seasonNumber, isPartial, episodeId, missingCount, sonarrId } as ItemDisplay
        } else {
          const tvdbId = embyItem.ProviderIds?.Tvdb ?? embyItem.ProviderIds?.TVDB
          return { id: embyItem.Id ?? '', name: embyItem.Name ?? '', year: embyItem.ProductionYear, type: embyItem.Type ?? '', providerId: String(tvdbId ?? ''), seasonNumber, isPartial, episodeId, missingCount, sonarrId } as ItemDisplay
        }
      } else {
        const tmdbItem = item as TmdbItemLike
        if (clientType === 'radarr') {
          return { id: String(tmdbItem.id), name: tmdbItem.name ?? '', year: tmdbItem.year ?? undefined, type: 'Movie', providerId: String(tmdbItem.id), seasonNumber, isPartial, episodeId, missingCount, sonarrId } as ItemDisplay
        } else {
          return { id: String(tmdbItem.id), name: tmdbItem.name ?? '', year: tmdbItem.year ?? undefined, type: 'Series', providerId: String(tmdbItem.tvdb_id ?? tmdbItem.id), seasonNumber, isPartial, episodeId, missingCount, sonarrId } as ItemDisplay
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

  // Per-episode step-through state (Sonarr with season context)
  const [episodeSelections, setEpisodeSelections] = useState<EpisodeReleaseSelection[]>([])
  const [currentEpisodeIdx, setCurrentEpisodeIdx] = useState(0)
  const [currentEpisodeReleases, setCurrentEpisodeReleases] = useState<ReleaseDisplay[]>([])
  const [currentEpisodeLoading, setCurrentEpisodeLoading] = useState(false)
  const [currentEpisodeError, setCurrentEpisodeError] = useState<string | null>(null)
  // Resolved Sonarr internal ID (from add/lookup during interactive search)
  const [interactiveSonarrId, setInteractiveSonarrId] = useState<number | null>(null)

  // Release table: sort
  type SortCol = 'title' | 'quality' | 'resolution' | 'size' | 'customFormatScore' | 'indexer' | 'seeders' | 'leechers'
  const [sortCol, setSortCol] = useState<SortCol>('customFormatScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Release table: filters
  const [filterTitle, setFilterTitle] = useState('')
  const [filterQuality, setFilterQuality] = useState('')
  const [filterIndexer, setFilterIndexer] = useState('')
  const [filterApprovedOnly, setFilterApprovedOnly] = useState(false)

  // Release table: pagination
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)

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
      setSortCol('customFormatScore')
      setSortDir('desc')
      setFilterTitle('')
      setFilterQuality('')
      setFilterIndexer('')
      setFilterApprovedOnly(false)
      setPage(0)
      setPageSize(25)
      setEpisodeSelections([])
      setCurrentEpisodeIdx(0)
      setCurrentEpisodeReleases([])
      setCurrentEpisodeLoading(false)
      setCurrentEpisodeError(null)
      setInteractiveSonarrId(null)
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
        const batchItems: SonarrBatchItem[] = displayItems.map((item) => {
          let seasonStatuses: { seasonNumber: number; monitored: boolean }[] | undefined
          // Always scope to the season when a season number is present — partial or not
          if (item.seasonNumber !== undefined) {
            seasonStatuses = [{ seasonNumber: item.seasonNumber, monitored: true }]
          }
          return {
            tvdbId: parseInt(item.providerId, 10),
            title: item.name,
            seasonStatuses,
          }
        })
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

  // Helper: map a SonarrRelease or RadarrRelease into a ReleaseDisplay
  function mapSonarrRelease(rel: SonarrRelease, seriesId: number, episodeId?: number): ReleaseDisplay {
    return {
      guid: rel.guid,
      quality: rel.quality.quality.name,
      source: rel.quality.quality.source ?? '',
      resolution: rel.quality.quality.resolution ?? 0,
      size: rel.size,
      sizeFormatted: formatSize(rel.size),
      indexer: rel.indexer,
      indexerId: rel.indexerId ?? 0,
      seeders: rel.seeders,
      leechers: rel.leechers,
      title: rel.title,
      approved: rel.approved,
      rejected: rel.rejected,
      rejectedReason: rel.rejectedReason ?? '',
      customFormatScore: rel.customFormatScore ?? 0,
      releaseGroup: rel.releaseGroup ?? '',
      customFormats: normalizeCustomFormats(rel.customFormats),
      seriesId,
      episodeId,
    }
  }

  function mapRadarrRelease(rel: RadarrRelease, movieId: number): ReleaseDisplay {
    return {
      guid: rel.guid,
      quality: rel.quality.quality.name,
      source: rel.quality.quality.source ?? '',
      resolution: rel.quality.quality.resolution ?? 0,
      size: rel.size,
      sizeFormatted: formatSize(rel.size),
      indexer: rel.indexer,
      indexerId: rel.indexerId ?? 0,
      seeders: rel.seeders,
      leechers: rel.leechers,
      title: rel.title,
      approved: rel.approved,
      rejected: rel.rejected,
      rejectedReason: rel.rejectedReason ?? '',
      customFormatScore: rel.customFormatScore ?? 0,
      releaseGroup: rel.releaseGroup ?? '',
      customFormats: normalizeCustomFormats(rel.customFormats),
      movieId,
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
    setEpisodeSelections([])
    setCurrentEpisodeIdx(0)
    setCurrentEpisodeReleases([])
    setCurrentEpisodeError(null)
    setInteractiveSonarrId(null)
    setPage(0)

    try {
      if (clientType === 'sonarr') {
        // ── Sonarr: add series silently, then step through missing episodes ──
        const item = displayItems[0]
        if (!item) { setInteractiveError('No item to search'); setInteractiveStep('releases'); return }

        const tvdbId = parseInt(item.providerId, 10)
        let internalId = 0

        // If we already have the Sonarr internal ID (pre-resolved in MediaDetail), skip the add entirely
        if (item.sonarrId) {
          internalId = item.sonarrId
          setInteractiveSonarrId(internalId)
        } else {
          setAddingProgress(`Adding ${item.name} to Sonarr…`)
          let seasonStatuses: { seasonNumber: number; monitored: boolean }[] | undefined
          if (item.seasonNumber !== undefined) {
            seasonStatuses = [{ seasonNumber: item.seasonNumber, monitored: true }]
          }
          try {
            const added = await addSonarrSeries({
              tvdbId,
              title: item.name,
              qualityProfileId: qualityProfileId ?? undefined,
              rootFolderPath: rootFolderPath || undefined,
              search: false,
              seasonStatuses,
            })
            internalId = added.id
          } catch (err) {
            const axiosErr = err as { response?: { status?: number; data?: { error?: string } } }
            const errMsg = axiosErr?.response?.data?.error ?? ''
            const isAlreadyExists =
              axiosErr?.response?.status === 409 ||
              errMsg.toLowerCase().includes('already') ||
              errMsg.toLowerCase().includes('exists')
            if (isAlreadyExists) {
              try {
                const exists = await checkSonarrSeriesExists(tvdbId)
                internalId = exists.id ?? 0
                if (internalId && item.seasonNumber !== undefined) {
                  await updateSonarrSeasonMonitoring(internalId, [{ seasonNumber: item.seasonNumber, monitored: true }])
                }
                // Clear the "already added" error — we recovered successfully
                setInteractiveError(null)
              } catch {
                setInteractiveError('Series already exists but could not be looked up in Sonarr.')
                setInteractiveStep('releases')
                return
              }
            } else {
              const msg = errMsg || 'Failed to add series to Sonarr.'
              setInteractiveError(msg)
              setInteractiveStep('releases')
              return
            }
          }

          if (!internalId) {
            setInteractiveError('Could not determine Sonarr series ID. Check that the series exists in Sonarr.')
            setInteractiveStep('releases')
            return
          }

          setInteractiveSonarrId(internalId)
        }

        // If a specific episodeId is set, just show that one episode's releases
        if (item.episodeId !== undefined) {
          setAddingProgress('Fetching releases…')
          try {
            const releases = await getSonarrReleases(internalId, item.seasonNumber, item.episodeId)
            const mapped = releases.map((r) => mapSonarrRelease(r, internalId, item.episodeId))
            setAllReleases(mapped)
            setInteractiveStep('releases')
          } catch {
            setInteractiveError('Failed to fetch releases.')
            setInteractiveStep('releases')
          }
          return
        }

        // Season context — fetch all episodes, filter missing, step through them one by one
        if (item.seasonNumber !== undefined) {
          setAddingProgress('Fetching episode list…')
          let missingEps: MissingEpisode[] = []
          try {
            const eps: SonarrEpisode[] = await getSonarrEpisodes(internalId, item.seasonNumber)
            missingEps = eps
              .filter((ep) => !ep.hasFile)
              .map((ep) => ({ id: ep.id, episodeNumber: ep.episodeNumber, seasonNumber: ep.seasonNumber, title: ep.title }))
              .sort((a, b) => a.episodeNumber - b.episodeNumber)
          } catch {
            setInteractiveError('Failed to fetch episode list from Sonarr.')
            setInteractiveStep('releases')
            return
          }

          if (missingEps.length === 0) {
            setInteractiveError('No missing episodes found for this season — all episodes are already on disk.')
            setInteractiveStep('releases')
            return
          }

          // Initialise selections array (all skipped to start)
          const selections: EpisodeReleaseSelection[] = missingEps.map((ep) => ({
            episode: ep,
            selectedGuid: null,
            releases: [],
          }))
          setEpisodeSelections(selections)
          setCurrentEpisodeIdx(0)

          // Fetch releases for the first episode
          await loadEpisodeReleases(0, missingEps, internalId)
          setInteractiveStep('episode-releases')
          return
        }

        // No season context — fetch all seasons, collect all missing episodes across them
        setAddingProgress('Fetching episode list…')
        try {
          const seriesInfo = await getSonarrSeriesById(internalId)
          const seasonNumbers = (seriesInfo.seasons ?? [])
            .map((s) => s.seasonNumber)
            .filter((n) => n > 0)
            .sort((a, b) => a - b)

          if (seasonNumbers.length === 0) {
            setInteractiveError('No seasons found for this series in Sonarr.')
            setInteractiveStep('releases')
            return
          }

          // Fetch episodes for all seasons in parallel
          const allEpsArrays = await Promise.all(
            seasonNumbers.map((sn) =>
              getSonarrEpisodes(internalId, sn).catch(() => [] as SonarrEpisode[])
            )
          )
          const missingEps: MissingEpisode[] = allEpsArrays
            .flat()
            .filter((ep) => !ep.hasFile)
            .map((ep) => ({ id: ep.id, episodeNumber: ep.episodeNumber, seasonNumber: ep.seasonNumber, title: ep.title }))
            .sort((a, b) => a.seasonNumber !== b.seasonNumber ? a.seasonNumber - b.seasonNumber : a.episodeNumber - b.episodeNumber)

          if (missingEps.length === 0) {
            setInteractiveError('No missing episodes found — all episodes are already on disk.')
            setInteractiveStep('releases')
            return
          }

          const selections: EpisodeReleaseSelection[] = missingEps.map((ep) => ({
            episode: ep,
            selectedGuid: null,
            releases: [],
          }))
          setEpisodeSelections(selections)
          setCurrentEpisodeIdx(0)
          await loadEpisodeReleases(0, missingEps, internalId)
          setInteractiveStep('episode-releases')
        } catch {
          setInteractiveError('Failed to fetch episode list from Sonarr.')
          setInteractiveStep('releases')
        }

      } else {
        // ── Radarr: add movie silently, fetch releases ──
        const releaseResults: ReleaseDisplay[] = []
        for (let i = 0; i < displayItems.length; i++) {
          const item = displayItems[i]
          setAddingProgress(`Adding ${item.name}… (${i + 1}/${displayItems.length})`)
          const tmdbId = parseInt(item.providerId, 10)
          let internalId = 0
          try {
            const added = await addRadarrMovie({
              tmdbId,
              qualityProfileId: qualityProfileId ?? undefined,
              rootFolderPath: rootFolderPath || undefined,
              search: false,
            })
            internalId = added.id
          } catch {
            try {
              const exists = await checkRadarrMovieExists(tmdbId)
              internalId = exists.id ?? 0
            } catch {
              // skip
            }
          }
          if (!internalId) continue
          try {
            const releases = await getRadarrReleases(internalId)
            for (const rel of releases) {
              releaseResults.push(mapRadarrRelease(rel, internalId))
            }
          } catch {
            // Skip fetch failures
          }
        }
        setAllReleases(releaseResults)
        setInteractiveStep('releases')
      }
    } catch (err) {
      setInteractiveError(
        (err as { message?: string })?.message ?? 'Failed to fetch releases'
      )
      setInteractiveStep('releases')
    }
  }

  // Load releases for a specific episode (by index into episodeSelections/missingEps)
  async function loadEpisodeReleases(
    idx: number,
    episodes: MissingEpisode[],
    sonarrId: number
  ) {
    const ep = episodes[idx]
    if (!ep) return
    setCurrentEpisodeLoading(true)
    setCurrentEpisodeError(null)
    setCurrentEpisodeReleases([])
    try {
      const releases = await getSonarrReleases(sonarrId, ep.seasonNumber, ep.id)
      const mapped = releases.map((r) => mapSonarrRelease(r, sonarrId, ep.id))
      setCurrentEpisodeReleases(mapped)
      // Sync into episodeSelections
      setEpisodeSelections((prev) => {
        const next = [...prev]
        if (next[idx]) next[idx] = { ...next[idx], releases: mapped }
        return next
      })
    } catch {
      setCurrentEpisodeError('Failed to fetch releases for this episode.')
    } finally {
      setCurrentEpisodeLoading(false)
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

  // Select a release for the current episode in per-episode mode, move to next
  function selectEpisodeRelease(guid: string | null) {
    const updated = episodeSelections.map((sel, i) =>
      i === currentEpisodeIdx ? { ...sel, selectedGuid: guid } : sel
    )
    setEpisodeSelections(updated)

    const nextIdx = currentEpisodeIdx + 1
    if (nextIdx >= episodeSelections.length) {
      // All episodes handled — show summary
      setInteractiveStep('summary')
    } else {
      setCurrentEpisodeIdx(nextIdx)
      // Load releases for next episode
      const nextEp = updated[nextIdx]
      if (nextEp && nextEp.releases.length === 0 && interactiveSonarrId) {
        loadEpisodeReleases(
          nextIdx,
          updated.map((s) => s.episode),
          interactiveSonarrId
        )
      } else {
        setCurrentEpisodeReleases(nextEp?.releases ?? [])
      }
    }
  }

  function goToPrevEpisode() {
    const prevIdx = currentEpisodeIdx - 1
    if (prevIdx < 0) return
    setCurrentEpisodeIdx(prevIdx)
    const prevSel = episodeSelections[prevIdx]
    setCurrentEpisodeReleases(prevSel?.releases ?? [])
  }

  async function handleInteractiveSubmit() {
    if (interactiveStep === 'summary') {
      // Per-episode mode: download the selected release for each episode
      const toDownload = episodeSelections.filter((s) => s.selectedGuid !== null)
      if (toDownload.length === 0) { onClose(); return }
      setSubmitting(true)
      setInteractiveError(null)
      try {
        const downloadPromises: Promise<unknown>[] = []
        for (const sel of toDownload) {
          const rel = sel.releases.find((r) => r.guid === sel.selectedGuid)
          if (!rel || !rel.seriesId) continue
          downloadPromises.push(
            downloadSonarrRelease({
              guid: rel.guid,
              indexerId: rel.indexerId,
              seriesId: rel.seriesId,
              qualityProfileId: qualityProfileId ?? undefined,
              episodeIds: rel.episodeId ? [rel.episodeId] : undefined,
            })
          )
        }
        await Promise.allSettled(downloadPromises)
        onSuccess(toDownload.length, 0, [])
        onClose()
      } catch (err) {
        setInteractiveError(
          (err as { message?: string })?.message ?? 'Failed to download releases'
        )
      } finally {
        setSubmitting(false)
      }
      return
    }

    // Flat release table mode (single episode or Radarr)
    if (selectedGuids.size === 0) return
    setSubmitting(true)
    setInteractiveError(null)

    try {
      const downloadPromises: Promise<unknown>[] = []

      for (const rel of allReleases) {
        if (!selectedGuids.has(rel.guid)) continue
        if (rel.seriesId) {
          downloadPromises.push(
            downloadSonarrRelease({
              guid: rel.guid,
              indexerId: rel.indexerId,
              seriesId: rel.seriesId,
              qualityProfileId: qualityProfileId ?? undefined,
              episodeIds: rel.episodeId ? [rel.episodeId] : undefined,
            })
          )
        } else if (rel.movieId) {
          downloadPromises.push(
            downloadRadarrRelease({
              guid: rel.guid,
              indexerId: rel.indexerId,
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

  const isWide = mode === 'interactive-search' && (interactiveStep === 'releases' || interactiveStep === 'episode-releases' || interactiveStep === 'summary')

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
    setPage(0)
  }

  function handleFilterChange(setter: React.Dispatch<React.SetStateAction<string>>) {
    return (val: string) => {
      setter(val)
      setPage(0)
    }
  }

  const filteredReleases = allReleases
    .filter((r) => {
      if (filterApprovedOnly && !r.approved) return false
      if (filterTitle && !r.title.toLowerCase().includes(filterTitle.toLowerCase())) return false
      if (filterQuality && !r.quality.toLowerCase().includes(filterQuality.toLowerCase())) return false
      if (filterIndexer && !r.indexer.toLowerCase().includes(filterIndexer.toLowerCase())) return false
      return true
    })
    .sort((a, b) => {
      const approvedCmp = (b.approved ? 1 : 0) - (a.approved ? 1 : 0)
      if (approvedCmp !== 0) return approvedCmp
      let cmp = 0
      switch (sortCol) {
        case 'title': cmp = a.title.localeCompare(b.title); break
        case 'quality': cmp = a.quality.localeCompare(b.quality); break
        case 'resolution': cmp = a.resolution - b.resolution; break
        case 'size': cmp = a.size - b.size; break
        case 'customFormatScore': cmp = a.customFormatScore - b.customFormatScore; break
        case 'indexer': cmp = a.indexer.localeCompare(b.indexer); break
        case 'seeders': cmp = a.seeders - b.seeders; break
        case 'leechers': cmp = a.leechers - b.leechers; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  const totalPages = Math.max(1, Math.ceil(filteredReleases.length / pageSize))
  const pagedReleases = filteredReleases.slice(page * pageSize, (page + 1) * pageSize)

  const item0 = displayItems[0]
  const hasSeasonContext = item0?.seasonNumber !== undefined && item0?.episodeId === undefined
  const hasSingleEpisodeContext = item0?.episodeId !== undefined

  // Human-readable context line shown under the series name
  const seasonContextLabel: string | null = (() => {
    if (!item0) return null
    if (hasSingleEpisodeContext) {
      return `Season ${item0.seasonNumber} — single episode search`
    }
    if (hasSeasonContext) {
      const n = item0.missingCount
      if (item0.isPartial) {
        return n != null
          ? `Season ${item0.seasonNumber} — ${n} missing episode${n !== 1 ? 's' : ''}`
          : `Season ${item0.seasonNumber} — missing episodes`
      }
      return `Season ${item0.seasonNumber} — full season missing`
    }
    return null
  })()

  // Short label for the modal title bar
  const seasonLabel = (() => {
    if (!item0) return null
    if (hasSingleEpisodeContext) return `S${String(item0.seasonNumber).padStart(2, '0')} — Episode`
    if (hasSeasonContext) {
      const n = item0.missingCount
      if (item0.isPartial) {
        return n != null
          ? `Season ${item0.seasonNumber} — ${n} missing`
          : `Season ${item0.seasonNumber} (partial)`
      }
      return `Season ${item0.seasonNumber}`
    }
    return null
  })()

  // What interactive search will do, shown on the mode card
  const interactiveDesc = (() => {
    if (hasSeasonContext && !hasSingleEpisodeContext) {
      const n = item0?.missingCount
      const count = n != null ? n : 'each missing'
      return `Step through ${count} episode${n !== 1 ? 's' : ''} one by one — pick a release for each`
    }
    if (hasSingleEpisodeContext) return 'Search indexers for this specific episode'
    return 'Pick specific releases from your indexers'
  })()

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={[styles.modal, isWide ? styles.modalWide : ''].filter(Boolean).join(' ')}>
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
            <h2 className={styles.title}>Request to {clientLabel}{seasonLabel ? ` — ${seasonLabel}` : ''}</h2>
            <p className={styles.subtitle}>
              {mode === 'select'
                ? `${displayItems.length} item${displayItems.length !== 1 ? 's' : ''} selected`
                : mode === 'quick-add'
                ? `${displayItems.length} item${displayItems.length !== 1 ? 's' : ''}`
                : interactiveStep === 'adding'
                ? addingProgress
                : interactiveStep === 'episode-releases'
                ? `Episode ${currentEpisodeIdx + 1} of ${episodeSelections.length}`
                : interactiveStep === 'summary'
                ? `${episodeSelections.filter((s) => s.selectedGuid !== null).length} of ${episodeSelections.length} episodes queued`
                : `${selectedGuids.size} release${selectedGuids.size !== 1 ? 's' : ''} selected`}
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Body */}
        <div className={[styles.body, isWide ? styles.bodyWide : ''].filter(Boolean).join(' ')}>
          {/* Mode: Select */}
            {mode === 'select' && (
              <>
                <div className={styles.itemList}>
                  {displayItems.slice(0, 8).map((item) => (
                    <div key={item.id} className={styles.itemRow}>
                      <div className={styles.itemRowMain}>
                        <span className={styles.itemName}>{item.name}</span>
                        {item.year && <span className={styles.itemYear}>{item.year}</span>}
                      </div>
                      {seasonContextLabel && (
                        <span className={styles.itemSeasonContext}>{seasonContextLabel}</span>
                      )}
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
                  <div>
                    <span className={styles.modeBtnLabel}>Quick Add</span>
                    <span className={styles.modeBtnDesc}>
                      {hasSeasonContext && !hasSingleEpisodeContext
                        ? `Add to Sonarr and search for all missing episodes automatically`
                        : `Add with defaults — downloads immediately`}
                    </span>
                  </div>
                </button>

                <button
                  className={styles.modeBtn}
                  onClick={() => setMode('interactive-setup')}
                >
                  <span className={styles.modeBtnIcon}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="M21 21l-4.35-4.35"/>
                    </svg>
                  </span>
                  <div>
                    <span className={styles.modeBtnLabel}>Interactive Search</span>
                    <span className={styles.modeBtnDesc}>{interactiveDesc}</span>
                  </div>
                </button>
              </div>
            </>
          )}

          {/* Mode: Quick Add */}
          {(mode === 'quick-add' || mode === 'interactive-setup') && (
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

          {/* Mode: Interactive Search — Adding */}
          {mode === 'interactive-search' && interactiveStep === 'adding' && (
            <div className={styles.interactiveStatus}>
              <div className={styles.spinner} />
              <p>{addingProgress}</p>
            </div>
          )}

          {/* Mode: Interactive Search — Release Table */}
          {mode === 'interactive-search' && interactiveStep === 'releases' && (
            <>
              {interactiveError && <div className={styles.error}>{interactiveError}</div>}

              <div className={styles.releaseToolbar}>
                <label className={styles.approvedToggle}>
                  <input
                    type="checkbox"
                    checked={filterApprovedOnly}
                    onChange={(e) => { setFilterApprovedOnly(e.target.checked); setPage(0) }}
                  />
                  <span>Approved only</span>
                </label>
              </div>

              <div className={styles.releaseTableWrap}>
                <table className={styles.releaseTable}>
                  <thead>
                    <tr>
                      <th className={styles.thCheck}></th>
                      <th className={styles.thSortable} onClick={() => handleSort('title')}>
                        Title
                        {sortCol === 'title' && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                        <div className={styles.thFilter}>
                          <input
                            className={styles.thFilterInput}
                            placeholder="Filter…"
                            value={filterTitle}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleFilterChange(setFilterTitle)(e.target.value)}
                          />
                        </div>
                      </th>
                      <th className={styles.thSortable} onClick={() => handleSort('quality')}>
                        Quality
                        {sortCol === 'quality' && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                        <div className={styles.thFilter}>
                          <input
                            className={styles.thFilterInput}
                            placeholder="Filter…"
                            value={filterQuality}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleFilterChange(setFilterQuality)(e.target.value)}
                          />
                        </div>
                      </th>
                      <th className={styles.th}>Format</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.thSortable} onClick={() => handleSort('resolution')}>
                        Res
                        {sortCol === 'resolution' && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                      </th>
                      <th className={styles.thSortable} onClick={() => handleSort('size')}>
                        Size
                        {sortCol === 'size' && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                      </th>
                      <th className={styles.thSortable} onClick={() => handleSort('customFormatScore')}>
                        CF Score
                        {sortCol === 'customFormatScore' && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                      </th>
                      <th className={styles.th}>Custom Formats</th>
                      <th className={styles.thSortable} onClick={() => handleSort('indexer')}>
                        Indexer
                        {sortCol === 'indexer' && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                        <div className={styles.thFilter}>
                          <input
                            className={styles.thFilterInput}
                            placeholder="Filter…"
                            value={filterIndexer}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleFilterChange(setFilterIndexer)(e.target.value)}
                          />
                        </div>
                      </th>
                      <th className={styles.th}>Release Group</th>
                      <th className={styles.thSortable} onClick={() => handleSort('seeders')}>
                        Seeders
                        {sortCol === 'seeders' && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                      </th>
                      <th className={styles.thSortable} onClick={() => handleSort('leechers')}>
                        Leechers
                        {sortCol === 'leechers' && <span className={styles.sortIcon}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                      </th>
                      <th className={styles.th}>Rejection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedReleases.length === 0 && (
                      <tr>
                        <td colSpan={14} className={styles.noItems}>
                          {allReleases.length === 0 ? 'No releases found.' : 'No releases match your filters.'}
                        </td>
                      </tr>
                    )}
                    {pagedReleases.map((rel) => {
                      const isSelected = selectedGuids.has(rel.guid)
                      return (
                        <tr
                          key={rel.guid}
                          className={isSelected ? styles.releaseRowSelected : ''}
                          onClick={() => toggleRelease(rel.guid)}
                        >
                          <td className={styles.tdCheck}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRelease(rel.guid)}
                            />
                          </td>
                          <td className={styles.tdTitle}>
                            <span className={styles.releaseTitleText}>{rel.title}</span>
                          </td>
                          <td className={styles.td}>
                            <span className={styles.qualityBadge}>{rel.quality}</span>
                          </td>
                          <td className={styles.td}>
                            {rel.source ? (
                              <span className={styles.formatBadge}>{rel.source}</span>
                            ) : '—'}
                          </td>
                          <td className={styles.tdStatus}>
                            {rel.approved ? (
                              <span className={styles.statusApproved}>Approved</span>
                            ) : (
                              <span className={styles.statusRejected} title={rel.rejectedReason || 'Not approved'}>Rejected</span>
                            )}
                          </td>
                          <td className={styles.tdNumeric}>{rel.resolution ? `${rel.resolution}p` : '—'}</td>
                          <td className={styles.tdNumeric}>{rel.sizeFormatted}</td>
                          <td className={styles.tdNumeric}>
                            {rel.customFormatScore !== 0 && (
                              <span className={rel.customFormatScore > 0 ? styles.scorePos : styles.scoreNeg}>
                                {rel.customFormatScore > 0 ? '+' : ''}{rel.customFormatScore}
                              </span>
                            )}
                          </td>
                          <td className={styles.td}>
                            <div className={styles.customFormats}>
                              {rel.customFormats.slice(0, 3).map((cf) => (
                                <span key={cf} className={styles.cfTag}>{cf}</span>
                              ))}
                              {rel.customFormats.length > 3 && (
                                <span className={styles.cfMore}>+{rel.customFormats.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className={styles.td}>{rel.indexer}</td>
                          <td className={styles.td}>{rel.releaseGroup || '—'}</td>
                          <td className={styles.tdNumeric}>
                            {rel.seeders >= 0 ? (
                              <span className={styles.seeders}>⚤ {rel.seeders.toLocaleString()}</span>
                            ) : '—'}
                          </td>
                          <td className={styles.tdNumeric}>
                            {rel.leechers >= 0 ? rel.leechers.toLocaleString() : '—'}
                          </td>
                          <td className={styles.td}>
                            {rel.rejected ? (
                              <span className={styles.rejectedReason} title={rel.rejectedReason}>{rel.rejectedReason || 'Rejected'}</span>
                            ) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  {filteredReleases.length.toLocaleString()} releases
                  {filteredReleases.length !== allReleases.length && ` (filtered from ${allReleases.length})`}
                </span>
                <div className={styles.paginationControls}>
                  <button
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    ‹ Prev
                  </button>
                  <span className={styles.pageNum}>
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    className={styles.pageBtn}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    Next ›
                  </button>
                  <select
                    className={styles.pageSizeSelect}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(0)
                    }}
                  >
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Mode: Interactive Search — Per-episode step-through */}
          {mode === 'interactive-search' && interactiveStep === 'episode-releases' && (() => {
            const sel = episodeSelections[currentEpisodeIdx]
            const ep = sel?.episode
            const releases = currentEpisodeReleases.length > 0
              ? currentEpisodeReleases
              : (sel?.releases ?? [])
            const currentSelectedGuid = sel?.selectedGuid ?? null
            return (
              <>
                {interactiveError && <div className={styles.error}>{interactiveError}</div>}

                <div className={styles.episodeHeader}>
                  <div className={styles.episodeProgress}>
                    {episodeSelections.map((s, i) => (
                      <span
                        key={i}
                        className={[
                          styles.episodeProgressDot,
                          i === currentEpisodeIdx ? styles.episodeProgressDotActive : '',
                          s.selectedGuid !== null ? styles.episodeProgressDotDone : '',
                        ].filter(Boolean).join(' ')}
                        title={`S${s.episode.seasonNumber}E${String(s.episode.episodeNumber).padStart(2, '0')} — ${s.episode.title}`}
                      />
                    ))}
                  </div>
                  <div className={styles.episodeTitle}>
                    <span className={styles.episodeCode}>
                      S{String(ep?.seasonNumber ?? 0).padStart(2, '0')}E{String(ep?.episodeNumber ?? 0).padStart(2, '0')}
                    </span>
                    <span className={styles.episodeName}>{ep?.title ?? 'Unknown Episode'}</span>
                  </div>
                </div>

                {currentEpisodeLoading && (
                  <div className={styles.interactiveStatus}>
                    <div className={styles.spinner} />
                    <p>Searching indexers…</p>
                  </div>
                )}

                {currentEpisodeError && !currentEpisodeLoading && (
                  <div className={styles.error}>{currentEpisodeError}</div>
                )}

                {!currentEpisodeLoading && (
                  <div className={styles.releaseTableWrap}>
                    <table className={styles.releaseTable}>
                      <thead>
                        <tr>
                          <th className={styles.thCheck}></th>
                          <th className={styles.th}>Title</th>
                          <th className={styles.th}>Quality</th>
                          <th className={styles.th}>Format</th>
                          <th className={styles.th}>Status</th>
                          <th className={styles.th}>Res</th>
                          <th className={styles.th}>Size</th>
                          <th className={styles.th}>CF Score</th>
                          <th className={styles.th}>Indexer</th>
                          <th className={styles.th}>Release Group</th>
                          <th className={styles.th}>Seeders</th>
                          <th className={styles.th}>Rejection</th>
                        </tr>
                      </thead>
                      <tbody>
                        {releases.length === 0 && (
                          <tr>
                            <td colSpan={12} className={styles.noItems}>No releases found for this episode.</td>
                          </tr>
                        )}
                        {releases.map((rel) => {
                          const isSelected = currentSelectedGuid === rel.guid
                          return (
                            <tr
                              key={rel.guid}
                              className={isSelected ? styles.releaseRowSelected : ''}
                              onClick={() =>
                                setEpisodeSelections((prev) =>
                                  prev.map((s, i) =>
                                    i === currentEpisodeIdx
                                      ? { ...s, selectedGuid: s.selectedGuid === rel.guid ? null : rel.guid }
                                      : s
                                  )
                                )
                              }
                            >
                              <td className={styles.tdCheck}>
                                <input
                                  type="radio"
                                  readOnly
                                  checked={isSelected}
                                />
                              </td>
                              <td className={styles.tdTitle}>
                                <span className={styles.releaseTitleText}>{rel.title}</span>
                              </td>
                              <td className={styles.td}>
                                <span className={styles.qualityBadge}>{rel.quality}</span>
                              </td>
                              <td className={styles.td}>
                                {rel.source ? <span className={styles.formatBadge}>{rel.source}</span> : '—'}
                              </td>
                              <td className={styles.tdStatus}>
                                {rel.approved ? (
                                  <span className={styles.statusApproved}>Approved</span>
                                ) : (
                                  <span className={styles.statusRejected} title={rel.rejectedReason || 'Not approved'}>Rejected</span>
                                )}
                              </td>
                              <td className={styles.tdNumeric}>{rel.resolution ? `${rel.resolution}p` : '—'}</td>
                              <td className={styles.tdNumeric}>{rel.sizeFormatted}</td>
                              <td className={styles.tdNumeric}>
                                {rel.customFormatScore !== 0 && (
                                  <span className={rel.customFormatScore > 0 ? styles.scorePos : styles.scoreNeg}>
                                    {rel.customFormatScore > 0 ? '+' : ''}{rel.customFormatScore}
                                  </span>
                                )}
                              </td>
                              <td className={styles.td}>{rel.indexer}</td>
                              <td className={styles.td}>{rel.releaseGroup || '—'}</td>
                              <td className={styles.tdNumeric}>
                                {rel.seeders >= 0 ? <span className={styles.seeders}>⚤ {rel.seeders.toLocaleString()}</span> : '—'}
                              </td>
                              <td className={styles.td}>
                                {rel.rejected ? (
                                  <span className={styles.rejectedReason} title={rel.rejectedReason}>{rel.rejectedReason || 'Rejected'}</span>
                                ) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )
          })()}

          {/* Mode: Interactive Search — Summary */}
          {mode === 'interactive-search' && interactiveStep === 'summary' && (
            <>
              {interactiveError && <div className={styles.error}>{interactiveError}</div>}
              <div className={styles.summaryList}>
                {episodeSelections.map((sel, i) => (
                  <div key={i} className={styles.summaryRow}>
                    <span className={styles.summaryEpisodeCode}>
                      S{String(sel.episode.seasonNumber).padStart(2, '0')}E{String(sel.episode.episodeNumber).padStart(2, '0')}
                    </span>
                    <span className={styles.summaryEpisodeName}>{sel.episode.title}</span>
                    {sel.selectedGuid !== null ? (
                      <span className={styles.summarySelected}>
                        {sel.releases.find((r) => r.guid === sel.selectedGuid)?.quality ?? 'Selected'}
                      </span>
                    ) : (
                      <span className={styles.summarySkipped}>Skipped</span>
                    )}
                  </div>
                ))}
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
          {(mode === 'quick-add' || mode === 'interactive-setup') && (
            <>
              <Button variant="ghost" onClick={() => setMode('select')} disabled={submitting}>
                Back
              </Button>
              {mode === 'quick-add' ? (
                <Button
                  variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
                  onClick={handleQuickAdd}
                  loading={submitting}
                  disabled={displayItems.length === 0 || !qualityProfileId}
                >
                  Request {displayItems.length} to {clientLabel}
                </Button>
              ) : (
                <Button
                  variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
                  onClick={startInteractiveSearch}
                  loading={submitting}
                  disabled={displayItems.length === 0 || !qualityProfileId}
                >
                  Start Search
                </Button>
              )}
            </>
          )}
          {mode === 'interactive-search' && interactiveStep === 'releases' && (
            <>
              <Button variant="ghost" onClick={() => setMode('interactive-setup')} disabled={submitting}>
                ‹ Back
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
          {mode === 'interactive-search' && interactiveStep === 'episode-releases' && (
            <>
              {currentEpisodeIdx > 0 && (
                <Button variant="ghost" onClick={goToPrevEpisode} disabled={currentEpisodeLoading}>
                  ‹ Back
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => selectEpisodeRelease(null)}
                disabled={currentEpisodeLoading}
              >
                Skip Episode
              </Button>
              <Button
                variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
                onClick={() => {
                  const sel = episodeSelections[currentEpisodeIdx]
                  selectEpisodeRelease(sel?.selectedGuid ?? null)
                }}
                disabled={currentEpisodeLoading || episodeSelections[currentEpisodeIdx]?.selectedGuid === null}
              >
                {currentEpisodeIdx < episodeSelections.length - 1 ? 'Next Episode ›' : 'Review & Download'}
              </Button>
            </>
          )}
          {mode === 'interactive-search' && interactiveStep === 'summary' && (
            <>
              <Button variant="ghost" onClick={() => { setCurrentEpisodeIdx(episodeSelections.length - 1); setInteractiveStep('episode-releases'); setCurrentEpisodeReleases(episodeSelections[episodeSelections.length - 1]?.releases ?? []) }} disabled={submitting}>
                ‹ Back
              </Button>
              <Button
                variant={clientType === 'sonarr' ? 'secondary' : 'primary'}
                onClick={handleInteractiveSubmit}
                loading={submitting}
                disabled={episodeSelections.every((s) => s.selectedGuid === null)}
              >
                Download {episodeSelections.filter((s) => s.selectedGuid !== null).length} Release{episodeSelections.filter((s) => s.selectedGuid !== null).length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
