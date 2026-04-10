import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getItemDetail,
  getTmdbDetail,
  TmdbTvDetail,
  TmdbMovieDetail,
  EmbyItemDetail,
  getSonarrStatus,
  getSonarrQualityProfiles,
  getSonarrRootFolders,
  addSonarrSeries,
  getSonarrSeries,
  lookupSonarrSeries,
  getRadarrStatus,
  getRadarrQualityProfiles,
  getRadarrRootFolders,
  addRadarrMovie,
  getRadarrMovies,
  SonarrQualityProfile,
  SonarrRootFolder,
  RadarrQualityProfile,
  RadarrRootFolder,
} from '../api'
import Badge from '../components/Badge'
import Button from '../components/Button'
import styles from './MediaDetail.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function backdropUrl(item: EmbyItemDetail): string | null {
  const tag = item.BackdropImageTags?.[0]
  if (!tag) return null
  return `/api/emby/image/${item.Id}?type=Backdrop&tag=${encodeURIComponent(tag)}&w=1280`
}

function posterUrl(item: EmbyItemDetail): string | null {
  const tag = item.ImageTags?.Primary
  if (!tag) return null
  return `/api/emby/image/${item.Id}?type=Primary&tag=${encodeURIComponent(tag)}&w=400`
}

function year(item: EmbyItemDetail): number | null {
  return item.ProductionYear ?? null
}

function isMovie(item: EmbyItemDetail): boolean {
  return item.Type === 'Movie'
}

function isSeries(item: EmbyItemDetail): boolean {
  return item.Type === 'Series' || item.Type === 'Season'
}

// ── Season row availability ────────────────────────────────────────────────────

interface SeasonRow {
  seasonNumber: number
  episodeCount: number
  inSeason: number
  status: 'available' | 'partial' | 'missing'
}

function buildSeasonRows(item: EmbyItemDetail): SeasonRow[] {
  if (!item.Seasons) return []
  return item.Seasons
    .filter((s) => s.SeasonNumber > 0) // exclude specials (season 0)
    .map((s) => {
      const count = s.EpisodeCount ?? 0
      const inSeason = s.EpisodesInSeason ?? count
      let status: SeasonRow['status'] = 'available'
      if (inSeason === 0) status = 'missing'
      else if (inSeason < count) status = 'partial'
      return { seasonNumber: s.SeasonNumber, episodeCount: count, inSeason, status }
    })
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: SeasonRow['status'] }) {
  const label =
    status === 'available' ? 'Available' : status === 'partial' ? 'Partial' : 'Missing'
  return (
    <span
      className={`${styles.statusDot} ${styles[`statusDot_${status}`]}`}
      title={label}
    >
      {status === 'available' ? '✓' : status === 'partial' ? '⚠' : '✗'}
    </span>
  )
}

// ── Sonarr request panel ──────────────────────────────────────────────────────

interface RequestPanelProps {
  type: 'full' | 'season'
  seasonNumber?: number
  qualityProfiles: SonarrQualityProfile[]
  rootFolders: SonarrRootFolder[]
  profileId: number
  rootFolder: string
  onProfileChange: (id: number) => void
  onRootFolderChange: (path: string) => void
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
  error: string | null
}

function SonarrRequestPanel({
  type,
  seasonNumber,
  qualityProfiles,
  rootFolders,
  profileId,
  rootFolder,
  onProfileChange,
  onRootFolderChange,
  onConfirm,
  onCancel,
  loading,
  error,
}: RequestPanelProps) {
  return (
    <div className={styles.requestPanel}>
      <div className={styles.requestPanelHeader}>
        <span className={styles.requestPanelTitle}>
          {type === 'full'
            ? 'Add Full Series to Sonarr'
            : `Add Season ${seasonNumber} to Sonarr`}
        </span>
        <button className={styles.requestPanelClose} onClick={onCancel}>
          ×
        </button>
      </div>

      <div className={styles.requestPanelBody}>
        <div className={styles.requestField}>
          <label className={styles.requestLabel}>Quality Profile</label>
          <select
            className={styles.requestSelect}
            value={profileId}
            onChange={(e) => onProfileChange(Number(e.target.value))}
          >
            {qualityProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.requestField}>
          <label className={styles.requestLabel}>Root Folder</label>
          <select
            className={styles.requestSelect}
            value={rootFolder}
            onChange={(e) => onRootFolderChange(e.target.value)}
          >
            {rootFolders.map((f) => (
              <option key={f.id} value={f.path}>
                {f.path}
              </option>
            ))}
          </select>
        </div>

        {error && <p className={styles.requestError}>{error}</p>}

        <div className={styles.requestActions}>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} loading={loading}>
            Add to Sonarr
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Radarr request panel ──────────────────────────────────────────────────────

interface RadarrRequestPanelProps {
  qualityProfiles: RadarrQualityProfile[]
  rootFolders: RadarrRootFolder[]
  profileId: number
  rootFolder: string
  onProfileChange: (id: number) => void
  onRootFolderChange: (path: string) => void
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
  error: string | null
}

function RadarrRequestPanel({
  qualityProfiles,
  rootFolders,
  profileId,
  rootFolder,
  onProfileChange,
  onRootFolderChange,
  onConfirm,
  onCancel,
  loading,
  error,
}: RadarrRequestPanelProps) {
  return (
    <div className={styles.requestPanel}>
      <div className={styles.requestPanelHeader}>
        <span className={styles.requestPanelTitle}>Add Movie to Radarr</span>
        <button className={styles.requestPanelClose} onClick={onCancel}>
          ×
        </button>
      </div>

      <div className={styles.requestPanelBody}>
        <div className={styles.requestField}>
          <label className={styles.requestLabel}>Quality Profile</label>
          <select
            className={styles.requestSelect}
            value={profileId}
            onChange={(e) => onProfileChange(Number(e.target.value))}
          >
            {qualityProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.requestField}>
          <label className={styles.requestLabel}>Root Folder</label>
          <select
            className={styles.requestSelect}
            value={rootFolder}
            onChange={(e) => onRootFolderChange(e.target.value)}
          >
            {rootFolders.map((f) => (
              <option key={f.id} value={f.path}>
                {f.path}
              </option>
            ))}
          </select>
        </div>

        {error && <p className={styles.requestError}>{error}</p>}

        <div className={styles.requestActions}>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} loading={loading}>
            Add to Radarr
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function MediaDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── Request panel state ──────────────────────────────────────────────────
  type RequestPanelState =
    | null
    | { type: 'full' }
    | { type: 'season'; seasonNumber: number }

  const [requestPanel, setRequestPanel] = useState<RequestPanelState>(null)
  const [selectedProfileId, setSelectedProfileId] = useState(1)
  const [selectedRootFolder, setSelectedRootFolder] = useState('')
  const [requestError, setRequestError] = useState<string | null>(null)
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null)
  // For TMDB TV shows: store resolved lookup result after Sonarr lookup
  const [resolvedTvdbId, setResolvedTvdbId] = useState<number | null>(null)
  const [resolvedTitle, setResolvedTitle] = useState<string | undefined>(undefined)
  const [resolvedTitleSlug, setResolvedTitleSlug] = useState<string | undefined>(undefined)
  const [tmdbLookupLoading, setTmdbLookupLoading] = useState(false)

  // ── Radarr request panel state ───────────────────────────────────────────
  const [radarrPanelOpen, setRadarrPanelOpen] = useState(false)
  const [radarrProfileId, setRadarrProfileId] = useState(1)
  const [radarrRootFolder, setRadarrRootFolder] = useState('')
  const [radarrError, setRadarrError] = useState<string | null>(null)
  const [radarrSuccess, setRadarrSuccess] = useState<string | null>(null)

  // ── Data queries ──────────────────────────────────────────────────────────
  const source = searchParams.get('source')
  const tmdbType = searchParams.get('type') as 'movie' | 'tv' | null
  const tmdbIdParam = searchParams.get('tmdbId') ?? undefined

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['item-detail', id, tmdbIdParam],
    queryFn: () => getItemDetail(id!, tmdbIdParam),
    enabled: !!id,
    // A 404 for a TMDB item means "not in Emby yet" — not a hard error
    retry: (_, err) => {
      const status = (err as { response?: { status?: number } })?.response?.status
      return status !== 404
    },
  })

  const { data: sonarrStatus } = useQuery({
    queryKey: ['sonarr-status'],
    queryFn: getSonarrStatus,
    retry: false,
  })

  // Fetch TMDB detail when this is a TMDB-only item (404 from Emby or source=tmdb)
  const { data: tmdbDetail } = useQuery({
    queryKey: ['tmdb-detail', tmdbIdParam, tmdbType],
    queryFn: () => getTmdbDetail(tmdbIdParam!, tmdbType ?? 'movie'),
    enabled: !!tmdbIdParam && source === 'tmdb',
    retry: false,
  })

  const { data: qualityProfiles = [] } = useQuery({
    queryKey: ['sonarr-qualityprofiles'],
    queryFn: getSonarrQualityProfiles,
    enabled: !!requestPanel && !!sonarrStatus?.configured,
  })

  const { data: rootFolders = [] } = useQuery({
    queryKey: ['sonarr-rootfolders'],
    queryFn: getSonarrRootFolders,
    enabled: !!requestPanel && !!sonarrStatus?.configured,
  })

  // Check if this series already exists in Sonarr
  const tvdbId = item?.ProviderIds?.Tvdb
    ? parseInt(item.ProviderIds.Tvdb, 10)
    : resolvedTvdbId
  const { data: sonarrSeries = [] } = useQuery({
    queryKey: ['sonarr-series'],
    queryFn: getSonarrSeries,
    enabled: !!requestPanel && !!sonarrStatus?.configured && !!tvdbId,
  })

  // Pre-select first root folder when data arrives
  if (rootFolders.length > 0 && !selectedRootFolder) {
    setSelectedRootFolder(rootFolders[0].path)
  }

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addSeriesMutation = useMutation({
    mutationFn: addSonarrSeries,
    onSuccess: () => {
      setRequestError(null)
      setRequestSuccess('Series added to Sonarr successfully.')
      setRequestPanel(null)
      qc.invalidateQueries({ queryKey: ['sonarr-series'] })
      setTimeout(() => setRequestSuccess(null), 4000)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Failed to add series'
      setRequestError(msg)
    },
  })

  // ── Radarr data queries ─────────────────────────────────────────────────
  const { data: radarrStatus } = useQuery({
    queryKey: ['radarr-status'],
    queryFn: getRadarrStatus,
    retry: false,
  })

  const { data: radarrQualityProfiles = [] } = useQuery({
    queryKey: ['radarr-qualityprofiles'],
    queryFn: getRadarrQualityProfiles,
    enabled: radarrPanelOpen && !!radarrStatus?.configured,
  })

  const { data: radarrRootFolders = [] } = useQuery({
    queryKey: ['radarr-rootfolders'],
    queryFn: getRadarrRootFolders,
    enabled: radarrPanelOpen && !!radarrStatus?.configured,
  })

  const { data: radarrMovies = [] } = useQuery({
    queryKey: ['radarr-movies'],
    queryFn: getRadarrMovies,
    enabled: radarrPanelOpen && !!radarrStatus?.configured,
  })

  // Pre-select first root folder when data arrives
  if (radarrRootFolders.length > 0 && !radarrRootFolder) {
    setRadarrRootFolder(radarrRootFolders[0].path)
  }

  const addMovieMutation = useMutation({
    mutationFn: addRadarrMovie,
    onSuccess: () => {
      setRadarrError(null)
      setRadarrSuccess('Movie added to Radarr successfully.')
      setRadarrPanelOpen(false)
      qc.invalidateQueries({ queryKey: ['radarr-movies'] })
      setTimeout(() => setRadarrSuccess(null), 4000)
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ?? 'Failed to add movie'
      setRadarrError(msg)
    },
  })

  // ── Helpers ──────────────────────────────────────────────────────────────
  const handleOpenRequest = (
    type: 'full' | 'season',
    seasonNumber?: number
  ) => {
    setRequestError(null)
    setRequestSuccess(null)
    if (type === 'season' && seasonNumber !== undefined) {
      setRequestPanel({ type: 'season', seasonNumber })
    } else {
      setRequestPanel({ type: 'full' })
    }
  }

  // For TMDB TV items: lookup TVDB ID via Sonarr, then open the request panel
  const handleOpenTmdbSonarrRequest = async () => {
    const tmdbIdParam = searchParams.get('tmdbId')
    if (!tmdbIdParam) {
      setRequestError('No TMDB ID available to look up.')
      setRequestPanel({ type: 'full' })
      return
    }
    setRequestError(null)
    setRequestSuccess(null)
    setTmdbLookupLoading(true)
    try {
      const results = await lookupSonarrSeries(`tmdb:${tmdbIdParam}`)
      const match = results?.[0]
      if (!match?.tvdbId) throw new Error('Series not found in Sonarr lookup')
      setResolvedTvdbId(match.tvdbId)
      setResolvedTitle(match.title)
      setResolvedTitleSlug(match.titleSlug)
      setRequestPanel({ type: 'full' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sonarr lookup failed'
      setRequestError(msg)
      setRequestPanel({ type: 'full' }) // open panel so error is visible
    } finally {
      setTmdbLookupLoading(false)
    }
  }

  const handleConfirmRequest = () => {
    if (!tvdbId) {
      setRequestError('No TVDB ID found for this series.')
      return
    }
    let seasonStatuses: { seasonNumber: number; monitored: boolean }[] | undefined

    if (requestPanel?.type === 'season') {
      seasonStatuses = [
        { seasonNumber: requestPanel.seasonNumber, monitored: true },
      ]
    }

    addSeriesMutation.mutate({
      tvdbId,
      title: resolvedTitle,
      titleSlug: resolvedTitleSlug,
      seasonStatuses,
      qualityProfileId: selectedProfileId,
      rootFolderPath: selectedRootFolder,
    })
  }

  const handleConfirmRadarrRequest = () => {
    // TMDB source: use tmdbId from URL params; Emby source: use ProviderIds
    const tmdbIdStr = item?.ProviderIds?.Tmdb ?? searchParams.get('tmdbId')
    const tmdbId = tmdbIdStr ? parseInt(tmdbIdStr, 10) : null
    if (!tmdbId) {
      setRadarrError('No TMDB ID found for this movie.')
      return
    }
    addMovieMutation.mutate({
      tmdbId,
      qualityProfileId: radarrProfileId,
      rootFolderPath: radarrRootFolder,
    })
  }

  const openRadarrPanel = () => {
    setRadarrError(null)
    setRadarrSuccess(null)
    setRadarrPanelOpen(true)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className={styles.loading}>Loading…</div>
  }

  // Hard error: non-TMDB item failed, or TMDB item failed for a reason other than "not in Emby"
  const is404 = (isError && (isError as unknown as { response?: { status?: number } })?.response?.status === 404)
  if (isError && !is404 && source !== 'tmdb') {
    return (
      <div className={styles.page}>
        <div className={styles.error}>
          <p>Item not found.</p>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            ← Go Back
          </Button>
        </div>
      </div>
    )
  }

  const movie = item && isMovie(item)
  const series = item && isSeries(item)
  const seasonRows = item ? buildSeasonRows(item) : []

  // ── TMDB source (no Emby data) ──────────────────────────────────────────
  if (source === 'tmdb' && !item) {
    const name = searchParams.get('name') ?? 'Unknown'
    const yearStr = searchParams.get('year') ?? ''
    const type = tmdbType ?? 'movie'
    const posterPath = searchParams.get('poster') ?? null

    const tvDetail = type === 'tv' ? (tmdbDetail as TmdbTvDetail | undefined) : undefined
    const movieDetail = type === 'movie' ? (tmdbDetail as TmdbMovieDetail | undefined) : undefined

    // Prefer TMDB backdrop if available
    const tmdbBackdrop = tmdbDetail?.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${tmdbDetail.backdrop_path}`
      : null
    const tmdbPoster = tmdbDetail?.poster_path
      ? `https://image.tmdb.org/t/p/w400${tmdbDetail.poster_path}`
      : posterPath
        ? `https://image.tmdb.org/t/p/w400${posterPath}`
        : null

    const genres = tmdbDetail?.genres ?? []
    const overview = tmdbDetail?.overview ?? ''

    return (
      <div className={styles.page}>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <div className={styles.hero}>
          {tmdbBackdrop ? (
            <img src={tmdbBackdrop} alt="" className={styles.heroBackdrop} />
          ) : (
            <div className={styles.heroFallback} />
          )}
          <div className={styles.heroOverlay} />
          <button className={styles.backBtn} onClick={() => navigate(-1)}>
            ← Back
          </button>
          <div className={styles.heroContent}>
            <div className={styles.heroPosterWrap}>
              {tmdbPoster ? (
                <img src={tmdbPoster} alt={name} className={styles.heroPoster} />
              ) : (
                <div className={styles.heroPosterFallback}>
                  <span className={styles.heroPosterInitials}>
                    {name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className={styles.heroMeta}>
              <h1 className={styles.heroTitle}>{name}</h1>
              <div className={styles.heroBadges}>
                <Badge label={type === 'movie' ? 'Movie' : 'Series'} variant="gold" />
                {yearStr && <Badge label={yearStr} variant="default" />}
                {tvDetail?.status && <Badge label={tvDetail.status} variant="default" />}
              </div>
              {genres.length > 0 && (
                <div className={styles.genreRow}>
                  {genres.slice(0, 5).map((g) => (
                    <Badge key={g.id} label={g.name} variant="default" />
                  ))}
                </div>
              )}
              <div className={styles.heroActions}>
                {type === 'movie' && (
                  <Button
                    variant="primary"
                    onClick={openRadarrPanel}
                    disabled={!radarrStatus?.configured}
                    title={!radarrStatus?.configured ? 'Configure Radarr in Settings first' : undefined}
                  >
                    Request to Radarr
                  </Button>
                )}
                {type === 'tv' && (
                  <Button
                    variant="primary"
                    onClick={() => handleOpenTmdbSonarrRequest()}
                    disabled={!sonarrStatus?.configured || tmdbLookupLoading}
                    loading={tmdbLookupLoading}
                    title={!sonarrStatus?.configured ? 'Configure Sonarr in Settings first' : undefined}
                  >
                    Request to Sonarr
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className={styles.body}>
          {/* Overview */}
          {overview && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Overview</h2>
              <p className={styles.overview}>{overview}</p>
            </section>
          )}

          {/* Details */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Details</h2>
            <dl className={styles.detailList}>
              {tmdbIdParam && (
                <>
                  <dt>TMDB ID</dt>
                  <dd>{tmdbIdParam}</dd>
                </>
              )}
              {tvDetail?.external_ids?.tvdb_id && (
                <>
                  <dt>TVDB ID</dt>
                  <dd>{tvDetail.external_ids.tvdb_id}</dd>
                </>
              )}
              {tvDetail?.external_ids?.imdb_id && (
                <>
                  <dt>IMDB ID</dt>
                  <dd>{tvDetail.external_ids.imdb_id}</dd>
                </>
              )}
              {movieDetail?.external_ids?.imdb_id && (
                <>
                  <dt>IMDB ID</dt>
                  <dd>{movieDetail.external_ids.imdb_id}</dd>
                </>
              )}
              {movieDetail?.runtime && (
                <>
                  <dt>Runtime</dt>
                  <dd>{movieDetail.runtime} min</dd>
                </>
              )}
              {tvDetail?.networks && tvDetail.networks.length > 0 && (
                <>
                  <dt>Network</dt>
                  <dd>{tvDetail.networks.map((n) => n.name).join(', ')}</dd>
                </>
              )}
              {tvDetail?.number_of_episodes != null && tvDetail.number_of_episodes > 0 && (
                <>
                  <dt>Episodes</dt>
                  <dd>{tvDetail.number_of_episodes}</dd>
                </>
              )}
            </dl>
          </section>

          {/* Seasons — TV only */}
          {tvDetail && tvDetail.seasons.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Seasons ({tvDetail.seasons.length})
              </h2>
              <div className={styles.seasonList}>
                {tvDetail.seasons.map((s) => (
                  <div key={s.season_number} className={styles.seasonRow}>
                    <div className={styles.seasonLeft}>
                      <span className={`${styles.statusDot} ${styles.statusDot_missing}`} title="Not in library">✗</span>
                      <span className={styles.seasonLabel}>Season {s.season_number}</span>
                    </div>
                    <div className={styles.seasonRight}>
                      <span className={styles.episodeCount}>
                        {s.episode_count} episode{s.episode_count !== 1 ? 's' : ''}
                      </span>
                      {s.air_date && (
                        <span className={styles.episodeCount}>
                          {s.air_date.slice(0, 4)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sonarr request panel */}
        {requestPanel && (
          <SonarrRequestPanel
            type={requestPanel.type}
            seasonNumber={requestPanel.type === 'season' ? requestPanel.seasonNumber : undefined}
            qualityProfiles={qualityProfiles}
            rootFolders={rootFolders}
            profileId={selectedProfileId}
            rootFolder={selectedRootFolder}
            onProfileChange={setSelectedProfileId}
            onRootFolderChange={setSelectedRootFolder}
            onConfirm={handleConfirmRequest}
            onCancel={() => { setRequestPanel(null); setRequestError(null) }}
            loading={addSeriesMutation.isPending}
            error={requestError}
          />
        )}

        {/* Radarr request panel */}
        {radarrPanelOpen && (
          <RadarrRequestPanel
            qualityProfiles={radarrQualityProfiles}
            rootFolders={radarrRootFolders}
            profileId={radarrProfileId}
            rootFolder={radarrRootFolder}
            onProfileChange={setRadarrProfileId}
            onRootFolderChange={setRadarrRootFolder}
            onConfirm={handleConfirmRadarrRequest}
            onCancel={() => { setRadarrPanelOpen(false); setRadarrError(null) }}
            loading={addMovieMutation.isPending}
            error={radarrError}
          />
        )}

        {requestSuccess && <div className={styles.toastSuccess}>✓ {requestSuccess}</div>}
        {radarrSuccess && <div className={styles.toastSuccess}>✓ {radarrSuccess}</div>}
      </div>
    )
  }

  // ── Emby item ─────────────────────────────────────────────────────────────
  const bdUrl = backdropUrl(item!)
  const poUrl = posterUrl(item!)
  const yearStr = year(item!)?.toString() ?? null
  const studio = item!.Studios?.[0]?.Name ?? null
  const sonarrConfigured = sonarrStatus?.configured ?? false
  const radarrConfigured = radarrStatus?.configured ?? false

  return (
    <div className={styles.page}>
      {/* ── Success toast ─────────────────────────────────────────────── */}
      {(requestSuccess || radarrSuccess) && (
        <div className={styles.toastSuccess}>
          ✓ {requestSuccess || radarrSuccess}
        </div>
      )}

      {/* ── Full-bleed backdrop hero ─────────────────────────────────── */}
      <div className={styles.hero}>
        {bdUrl ? (
          <img src={bdUrl} alt="" className={styles.heroBackdrop} />
        ) : (
          <div className={styles.heroFallback} />
        )}
        <div className={styles.heroOverlay} />
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className={styles.heroContent}>
          <div className={styles.heroPosterWrap}>
            {poUrl ? (
              <img src={poUrl} alt={item!.Name} className={styles.heroPoster} />
            ) : (
              <div className={styles.heroPosterFallback}>
                <span className={styles.heroPosterInitials}>
                  {item!.Name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className={styles.heroMeta}>
            <h1 className={styles.heroTitle}>{item!.Name}</h1>
            <div className={styles.heroBadges}>
              {yearStr && <Badge label={yearStr} variant="gold" />}
              <Badge label={item!.Type} variant="default" />
              {studio && <Badge label={studio} variant="default" />}
            </div>

            {item!.Genres && item!.Genres.length > 0 && (
              <div className={styles.genreRow}>
                {item!.Genres.slice(0, 5).map((g) => (
                  <Badge key={g} label={g} variant="default" />
                ))}
              </div>
            )}

            <div className={styles.heroActions}>
              {movie && (
                <Button
                  variant="purple"
                  onClick={openRadarrPanel}
                  disabled={!radarrStatus?.configured}
                  title={!radarrStatus?.configured ? 'Configure Radarr in Settings first' : undefined}
                >
                  Request to Radarr
                </Button>
              )}
              {series && (
                <Button
                  variant="purple"
                  onClick={() => handleOpenRequest('full')}
                  disabled={!sonarrConfigured}
                  title={!sonarrConfigured ? 'Configure Sonarr in Settings first' : undefined}
                >
                  Request Full Series to Sonarr
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sonarr request panel (overlay) ────────────────────────────── */}
      {requestPanel && (
        <SonarrRequestPanel
          type={requestPanel.type}
          seasonNumber={requestPanel.type === 'season' ? requestPanel.seasonNumber : undefined}
          qualityProfiles={qualityProfiles}
          rootFolders={rootFolders}
          profileId={selectedProfileId}
          rootFolder={selectedRootFolder}
          onProfileChange={setSelectedProfileId}
          onRootFolderChange={setSelectedRootFolder}
          onConfirm={handleConfirmRequest}
          onCancel={() => { setRequestPanel(null); setRequestError(null) }}
          loading={addSeriesMutation.isPending}
          error={requestError}
        />
      )}

      {/* ── Radarr request panel (overlay) ───────────────────────────── */}
      {radarrPanelOpen && (
        <RadarrRequestPanel
          qualityProfiles={radarrQualityProfiles}
          rootFolders={radarrRootFolders}
          profileId={radarrProfileId}
          rootFolder={radarrRootFolder}
          onProfileChange={setRadarrProfileId}
          onRootFolderChange={setRadarrRootFolder}
          onConfirm={handleConfirmRadarrRequest}
          onCancel={() => { setRadarrPanelOpen(false); setRadarrError(null) }}
          loading={addMovieMutation.isPending}
          error={radarrError}
        />
      )}

      {/* ── Radarr success toast ─────────────────────────────────────── */}
      {radarrSuccess && (
        <div className={styles.toastSuccess}>
          ✓ {radarrSuccess}
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* Synopsis */}
        {item!.Overview && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Overview</h2>
            <p className={styles.overview}>{item!.Overview}</p>
          </section>
        )}

        {/* Media info */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Details</h2>
          <dl className={styles.detailList}>
            {item!.CumulativeRuntime && (
              <>
                <dt>Runtime</dt>
                <dd>{item!.CumulativeRuntime} min</dd>
              </>
            )}
            {item!.EpisodeRunTime && item!.EpisodeRunTime.length > 0 && (
              <>
                <dt>Episode runtime</dt>
                <dd>{item!.EpisodeRunTime[0]} min</dd>
              </>
            )}
            {item!.ProviderIds?.Tmdb && (
              <>
                <dt>TMDB ID</dt>
                <dd>{item!.ProviderIds.Tmdb}</dd>
              </>
            )}
            {item!.ProviderIds?.Tvdb && (
              <>
                <dt>TVDb ID</dt>
                <dd>{item!.ProviderIds.Tvdb}</dd>
              </>
            )}
            {item!.ProviderIds?.Imdb && (
              <>
                <dt>IMDB ID</dt>
                <dd>{item!.ProviderIds.Imdb}</dd>
              </>
            )}
          </dl>
        </section>

        {/* Seasons — series only */}
        {series && seasonRows.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              Seasons ({seasonRows.length})
            </h2>
            <div className={styles.seasonList}>
              {seasonRows.map((row) => (
                <div key={row.seasonNumber} className={styles.seasonRow}>
                  <div className={styles.seasonLeft}>
                    <StatusDot status={row.status} />
                    <span className={styles.seasonLabel}>
                      Season {row.seasonNumber}
                    </span>
                  </div>
                  <div className={styles.seasonRight}>
                    <span
                      className={
                        row.status === 'partial'
                          ? styles.episodeCountPartial
                          : styles.episodeCount
                      }
                    >
                      {row.status === 'partial'
                        ? `${row.inSeason}/${row.episodeCount} episodes`
                        : `${row.episodeCount} episode${row.episodeCount !== 1 ? 's' : ''}`}
                    </span>
                    {row.status === 'available' && (
                      <span className={styles.seasonBadgeAvailable}>
                        ✓ Available
                      </span>
                    )}
                    {(row.status === 'partial' || row.status === 'missing') &&
                      sonarrConfigured && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenRequest('season', row.seasonNumber)}
                        >
                          {row.status === 'partial' ? 'Request Missing' : 'Request Season'}
                        </Button>
                      )}
                    {(row.status === 'partial' || row.status === 'missing') &&
                      !sonarrConfigured && (
                        <Button variant="secondary" size="sm" disabled>
                          Sonarr not configured
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {series && seasonRows.length === 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Seasons</h2>
            <p className={styles.hint}>No season data available.</p>
          </section>
        )}
      </div>
    </div>
  )
}
