import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getItemDetail,
  getTmdbDetail,
  TmdbTvDetail,
  TmdbMovieDetail,
  EmbyItemDetail,
  getSonarrStatus,
  getRadarrStatus,
  lookupSonarrSeries,
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

  const { data: tmdbDetail } = useQuery({
    queryKey: ['tmdb-detail', tmdbIdParam, tmdbType],
    queryFn: () => getTmdbDetail(tmdbIdParam!, tmdbType ?? 'movie'),
    enabled: !!tmdbIdParam && source === 'tmdb',
    retry: false,
  })

  // ── Request handlers ─────────────────────────────────────────────────────

  function openSonarrModal(seasonNumber?: number) {
    if (!item) return
    setRequestModal({
      open: true,
      clientType: 'sonarr',
      items: [{ ...item, _season: seasonNumber }],
    })
  }

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
    qc.invalidateQueries({ queryKey: ['radarr-movies'] })
    qc.invalidateQueries({ queryKey: ['sonarr-series'] })
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

            <div className={styles.heroActions}>
              {movie && (
                <Button
                  variant="purple"
                  onClick={openRadarrModal}
                  disabled={!radarrConfigured}
                  title={!radarrConfigured ? 'Configure Radarr in Settings first' : undefined}
                >
                  Request to Radarr
                </Button>
              )}
              {series && (
                <Button
                  variant="purple"
                  onClick={() => openSonarrModal()}
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
                          onClick={() => openSonarrModal(row.seasonNumber)}
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
