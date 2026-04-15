import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getItemDetail,
  getTmdbDetail,
  TmdbTvDetail,
  TmdbMovieDetail,
  EmbyItemDetail,
  getSettings,
  getSonarrStatus,
  getRadarrStatus,
  getSonarrQueue,
  getRadarrQueue,
  lookupSonarrSeries,
  getSonarrEpisodes,
  checkSonarrSeriesExists,
  addSonarrSeries,
  SonarrEpisode,
} from '../api'
import Badge from '../components/Badge'
import Button from '../components/Button'
import RequestModal from '../components/RequestModal'
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

function itemYear(item: EmbyItemDetail): number | null {
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
    .filter((s) => s.SeasonNumber > 0)
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

// ── Main page ────────────────────────────────────────────────────────────────

export default function MediaDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── Request modal state ──────────────────────────────────────────────────
  const [requestModal, setRequestModal] = useState<{
    open: boolean
    clientType: 'sonarr' | 'radarr'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[]
  }>({ open: false, clientType: 'radarr', items: [] })

  // ── Toast state ─────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null)
  const [tmdbLookupLoading, setTmdbLookupLoading] = useState(false)

  // ── Season accordion state ───────────────────────────────────────────────
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set())
  const [sonarrEpisodes, setSonarrEpisodes] = useState<Record<number, SonarrEpisode[]>>({})
  const [episodeFetchLoading, setEpisodeFetchLoading] = useState<Set<number>>(new Set())
  const [episodeFetchError, setEpisodeFetchError] = useState<string | null>(null)

  // ── Data queries ──────────────────────────────────────────────────────────
  const source = searchParams.get('source')
  const tmdbType = searchParams.get('type') as 'movie' | 'tv' | null
  const tmdbIdParam = searchParams.get('tmdbId') ?? undefined

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['item-detail', id, tmdbIdParam],
    queryFn: () => getItemDetail(id!, tmdbIdParam),
    enabled: !!id,
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

  const { data: radarrStatus } = useQuery({
    queryKey: ['radarr-status'],
    queryFn: getRadarrStatus,
    retry: false,
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
    retry: false,
  })

  // Resolve Sonarr series ID (or auto-add) when item is available
  const { data: resolvedSonarrId, isFetching: isResolvingSonarrId } = useQuery({
    queryKey: ['sonarr-series-id', item?.ProviderIds?.Tvdb ?? item?.ProviderIds?.TVDB],
    queryFn: async () => {
      const rawTvdb = item?.ProviderIds?.Tvdb ?? item?.ProviderIds?.TVDB
      if (!rawTvdb) return null
      const tvdbId = parseInt(rawTvdb, 10)
      if (!tvdbId) return null
      try {
        const exists = await checkSonarrSeriesExists(tvdbId)
        if (exists.exists && exists.id) return exists.id
        // Auto-add silently (no search) so we can get the internal Sonarr ID for episode lookups
        const qualityProfileId = settings?.sonarr_quality_profile
          ? parseInt(settings.sonarr_quality_profile, 10)
          : undefined
        const rootFolderPath = settings?.sonarr_root_folder ?? undefined
        const added = await addSonarrSeries({
          tvdbId,
          title: item?.Name ?? '',
          search: false,
          qualityProfileId,
          rootFolderPath,
        })
        return added.id
      } catch {
        return null
      }
    },
    enabled: !!item && isSeries(item) && !!sonarrStatus?.configured,
    retry: false,
  })

  const { data: sonarrQueue } = useQuery({
    queryKey: ['sonarr-queue'],
    queryFn: getSonarrQueue,
    refetchInterval: (query) => ((query.state.data?.records?.length ?? 0) > 0 ? 10_000 : 30_000),
    enabled: !!sonarrStatus?.configured,
    retry: false,
  })

  const { data: radarrQueue } = useQuery({
    queryKey: ['radarr-queue'],
    queryFn: getRadarrQueue,
    refetchInterval: (query) => ((query.state.data?.records?.length ?? 0) > 0 ? 10_000 : 30_000),
    enabled: !!radarrStatus?.configured,
    retry: false,
  })

  // Suppress unused-var warnings — queues are fetched to keep cache warm for
  // invalidation after modal success; components may read them via queryClient
  void sonarrQueue
  void radarrQueue

  const { data: tmdbDetail } = useQuery({
    queryKey: ['tmdb-detail', tmdbIdParam, tmdbType],
    queryFn: () => getTmdbDetail(tmdbIdParam!, tmdbType ?? 'movie'),
    enabled: !!tmdbIdParam && source === 'tmdb',
    retry: false,
  })

  // ── Request handlers ─────────────────────────────────────────────────────

  function openSonarrModal(seasonNumber?: number, isPartial?: boolean, episodeId?: number, missingCount?: number) {
    if (!item) return
    setRequestModal({
      open: true,
      clientType: 'sonarr',
      items: [{ ...item, _season: seasonNumber, _partial: isPartial, _episodeId: episodeId, _missingCount: missingCount, _sonarrId: resolvedSonarrId ?? undefined }],
    })
  }

  async function toggleSeasonExpand(seasonNumber: number) {
    const next = new Set(expandedSeasons)
    if (next.has(seasonNumber)) {
      next.delete(seasonNumber)
      setExpandedSeasons(next)
    } else {
      next.add(seasonNumber)
      setExpandedSeasons(next)
      // Fetch episodes only if we have a resolved Sonarr ID already;
      // if still resolving, the effect below will fetch once the ID arrives.
      if (resolvedSonarrId && !sonarrEpisodes[seasonNumber]) {
        await fetchEpisodesForSeason(seasonNumber)
      }
    }
  }

  async function fetchEpisodesForSeason(seasonNumber: number) {
    if (!resolvedSonarrId) return
    setEpisodeFetchLoading((prev) => new Set(prev).add(seasonNumber))
    setEpisodeFetchError(null)
    try {
      const eps = await getSonarrEpisodes(resolvedSonarrId, seasonNumber)
      setSonarrEpisodes((prev) => ({ ...prev, [seasonNumber]: eps }))
    } catch (err) {
      setEpisodeFetchError(err instanceof Error ? err.message : 'Failed to load episodes')
    } finally {
      setEpisodeFetchLoading((prev) => {
        const next = new Set(prev)
        next.delete(seasonNumber)
        return next
      })
    }
  }

  // When resolvedSonarrId arrives, pre-fetch episodes for ALL seasons so status
  // dots and counts are accurate before the user expands any accordion row
  useEffect(() => {
    if (!resolvedSonarrId || !item) return
    const seasons = buildSeasonRows(item)
    for (const row of seasons) {
      if (!sonarrEpisodes[row.seasonNumber] && !episodeFetchLoading.has(row.seasonNumber)) {
        fetchEpisodesForSeason(row.seasonNumber)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSonarrId])

  function openRadarrModal() {
    if (!item) return
    setRequestModal({
      open: true,
      clientType: 'radarr',
      items: [item],
    })
  }

  function openTmdbRadarrModal() {
    const tmdbIdParam = searchParams.get('tmdbId')
    if (!tmdbIdParam) return
    setRequestModal({
      open: true,
      clientType: 'radarr',
      items: [{
        _tmdbId: parseInt(tmdbIdParam, 10),
        id: tmdbIdParam,
        name: searchParams.get('name') ?? '',
        year: searchParams.get('year') ?? null,
        type: 'movie',
      }],
    })
  }

  async function openTmdbSonarrModal() {
    const tmdbIdParam = searchParams.get('tmdbId')
    if (!tmdbIdParam) return
    setTmdbLookupLoading(true)
    try {
      const results = await lookupSonarrSeries(`tmdb:${tmdbIdParam}`)
      const match = results?.[0]
      if (!match?.tvdbId) throw new Error('Series not found in Sonarr')
      setRequestModal({
        open: true,
        clientType: 'sonarr',
        items: [{
          _tmdbId: parseInt(tmdbIdParam, 10),
          tvdbId: match.tvdbId,
          id: String(match.tvdbId),
          name: match.title,
          year: match.year ?? null,
          type: 'tv',
          tvdb_id: match.tvdbId,
        }],
      })
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to look up series')
    } finally {
      setTmdbLookupLoading(false)
    }
  }

  function handleModalSuccess(added: number) {
    setToast(`Requested ${added} item${added !== 1 ? 's' : ''} successfully.`)
    setRequestModal((m) => ({ ...m, open: false }))
    qc.invalidateQueries({ queryKey: ['item-detail'] })
    qc.invalidateQueries({ queryKey: ['radarr-movies'] })
    qc.invalidateQueries({ queryKey: ['radarr-queue'] })
    qc.invalidateQueries({ queryKey: ['sonarr-series'] })
    qc.invalidateQueries({ queryKey: ['sonarr-queue'] })
    qc.invalidateQueries({ queryKey: ['sonarr-series-id'] })
    setSonarrEpisodes({})
    setTimeout(() => setToast(null), 4000)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className={styles.loading}>Loading…</div>
  }

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
  const sonarrConfigured = sonarrStatus?.configured ?? false
  const radarrConfigured = radarrStatus?.configured ?? false

  // ── TMDB source (no Emby data) ──────────────────────────────────────────
  if (source === 'tmdb' && !item) {
    const name = searchParams.get('name') ?? 'Unknown'
    const yearStr = searchParams.get('year') ?? ''
    const type = tmdbType ?? 'movie'
    const posterPath = searchParams.get('poster') ?? null

    const tvDetail = type === 'tv' ? (tmdbDetail as TmdbTvDetail | undefined) : undefined
    const movieDetail = type === 'movie' ? (tmdbDetail as TmdbMovieDetail | undefined) : undefined

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
                    onClick={openTmdbRadarrModal}
                    disabled={!radarrConfigured}
                    title={!radarrConfigured ? 'Configure Radarr in Settings first' : undefined}
                  >
                    Request to Radarr
                  </Button>
                )}
                {type === 'tv' && (
                  <Button
                    variant="primary"
                    onClick={openTmdbSonarrModal}
                    disabled={!sonarrConfigured || tmdbLookupLoading}
                    loading={tmdbLookupLoading}
                    title={!sonarrConfigured ? 'Configure Sonarr in Settings first' : undefined}
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
          {overview && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Overview</h2>
              <p className={styles.overview}>{overview}</p>
            </section>
          )}

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

        {toast && <div className={styles.toastSuccess}>✓ {toast}</div>}

        <RequestModal
          open={requestModal.open}
          clientType={requestModal.clientType}
          items={requestModal.items}
          onClose={() => setRequestModal((m) => ({ ...m, open: false }))}
          onSuccess={handleModalSuccess}
        />
      </div>
    )
  }

  // ── Emby item ─────────────────────────────────────────────────────────────
  const bdUrl = backdropUrl(item!)
  const poUrl = posterUrl(item!)
  const yearStr = itemYear(item!)?.toString() ?? null
  const studio = item!.Studios?.[0]?.Name ?? null

  return (
    <div className={styles.page}>
      {toast && <div className={styles.toastSuccess}>✓ {toast}</div>}

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


          </div>
        </div>
      </div>

      {/* ── Request modal ─────────────────────────────────────────────── */}
      <RequestModal
        open={requestModal.open}
        clientType={requestModal.clientType}
        items={requestModal.items}
        onClose={() => setRequestModal((m) => ({ ...m, open: false }))}
        onSuccess={handleModalSuccess}
      />

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {item!.Overview && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Overview</h2>
            <p className={styles.overview}>{item!.Overview}</p>
          </section>
        )}

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
              {seasonRows.map((row) => {
                const isExpanded = expandedSeasons.has(row.seasonNumber)
                const episodes = sonarrEpisodes[row.seasonNumber] ?? []
                const isLoadingEpisodes = episodeFetchLoading.has(row.seasonNumber)
                const missingEps = episodes.filter((ep) => !ep.hasFile)

                // Derive display counts and status from Sonarr data when available,
                // falling back to Emby data. Emby often returns EpisodeCount=0
                // because ChildCount is not populated by the Seasons API.
                const sonarrTotal = episodes.length
                const sonarrInSeason = episodes.filter((ep) => ep.hasFile).length
                const hasSonarrData = sonarrTotal > 0
                const displayTotal = hasSonarrData ? sonarrTotal : row.episodeCount
                const displayInSeason = hasSonarrData ? sonarrInSeason : row.inSeason
                const displayStatus: SeasonRow['status'] = hasSonarrData
                  ? (sonarrInSeason === 0 ? 'missing' : sonarrInSeason < sonarrTotal ? 'partial' : 'available')
                  : row.status

                return (
                  <div key={row.seasonNumber}>
                    <div className={styles.seasonRow}>
                      <div className={styles.seasonLeft}>
                        <button
                          className={styles.expandBtn}
                          onClick={() => toggleSeasonExpand(row.seasonNumber)}
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        <StatusDot status={displayStatus} />
                        <span className={styles.seasonLabel}>
                          Season {row.seasonNumber}
                        </span>
                      </div>
                      <div className={styles.seasonRight}>
                        <span
                          className={
                            displayStatus === 'partial'
                              ? styles.episodeCountPartial
                              : styles.episodeCount
                          }
                        >
                          {displayTotal > 0 && displayInSeason !== displayTotal
                            ? `${displayInSeason}/${displayTotal} episodes`
                            : displayTotal > 0
                              ? `${displayTotal} episode${displayTotal !== 1 ? 's' : ''}`
                              : isLoadingEpisodes
                                ? '…'
                                : `${row.inSeason} episode${row.inSeason !== 1 ? 's' : ''}`}
                        </span>
                        {displayStatus === 'available' && (
                          <span className={styles.seasonBadgeAvailable}>
                            ✓ Available
                          </span>
                        )}
                        {(displayStatus === 'partial' || displayStatus === 'missing') &&
                          sonarrConfigured && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                openSonarrModal(row.seasonNumber, displayStatus === 'partial', undefined, missingEps.length)
                              }}
                            >
                              {displayStatus === 'partial' ? 'Request Missing' : 'Request Season'}
                            </Button>
                          )}
                        {(displayStatus === 'partial' || displayStatus === 'missing') &&
                          !sonarrConfigured && (
                            <Button variant="secondary" size="sm" disabled>
                              Sonarr not configured
                            </Button>
                          )}
                      </div>
                    </div>

                    {/* Expanded episode list */}
                    {isExpanded && (
                      <div className={styles.episodeList}>
                        {/* Still resolving Sonarr series ID */}
                        {isResolvingSonarrId && (
                          <div className={styles.episodeLoading}>
                            <span className={styles.spinner} />
                            Resolving series in Sonarr…
                          </div>
                        )}
                        {/* Sonarr ID resolved to null — couldn't add series */}
                        {!isResolvingSonarrId && resolvedSonarrId == null && (
                          <div className={styles.episodeHint}>
                            Could not resolve series in Sonarr. Check that your default quality profile and root folder are set in Settings.
                          </div>
                        )}
                        {episodeFetchError && (
                          <div className={styles.episodeError}>{episodeFetchError}</div>
                        )}
                        {resolvedSonarrId != null && isLoadingEpisodes && (
                          <div className={styles.episodeLoading}>
                            <span className={styles.spinner} />
                            Loading episodes…
                          </div>
                        )}
                        {resolvedSonarrId != null && !isLoadingEpisodes && !episodeFetchError && episodes.length === 0 && (
                          <div className={styles.episodeHint}>No episode data available.</div>
                        )}
                        {/* Show all episodes with per-episode status */}
                        {resolvedSonarrId != null && !isLoadingEpisodes && !episodeFetchError && episodes.map((ep) => (
                          <div
                            key={ep.id}
                            className={`${styles.episodeRow} ${ep.hasFile ? styles.episodeRowAvailable : ''}`}
                          >
                            <span className={styles.episodeInfo}>
                              <span className={`${styles.episodeNumber} ${ep.hasFile ? styles.episodeNumberAvailable : styles.episodeNumberMissing}`}>
                                S{row.seasonNumber.toString().padStart(2, '0')}E{ep.episodeNumber.toString().padStart(2, '0')}
                              </span>
                              <span className={styles.episodeTitle}>{ep.title || `Episode ${ep.episodeNumber}`}</span>
                              {ep.airDate && (
                                <span className={styles.episodeAirDate}>
                                  {new Date(ep.airDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              )}
                            </span>
                            <span className={ep.hasFile ? styles.episodeStatusAvailable : styles.episodeStatusMissing}>
                              {ep.hasFile ? '✓' : '✗'}
                            </span>
                            {!ep.hasFile && sonarrConfigured && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openSonarrModal(row.seasonNumber, false, ep.id)}
                              >
                                Search
                              </Button>
                            )}
                          </div>
                        ))}
                        {/* Summary for missing eps if Sonarr configured and there are missing ones */}
                        {resolvedSonarrId != null && !isLoadingEpisodes && !episodeFetchError && missingEps.length > 0 && sonarrConfigured && (
                          <div className={styles.episodeListFooter}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => openSonarrModal(row.seasonNumber, row.status === 'partial', undefined, missingEps.length)}
                            >
                              Request all {missingEps.length} missing
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
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
