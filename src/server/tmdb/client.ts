import axios, { AxiosInstance } from 'axios'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TmdbCompany {
  id: number
  name: string
  description?: string
  headquarters?: string
  origin_country?: string
  logo_path?: string | null
}

export interface TmdbCompanySearchResult {
  id: number
  name: string
  logo_path: string | null
  origin_country: string
}

export interface TmdbNetworkSearchResult {
  id: number
  name: string
  logo_path: string | null
  origin_country: string
}

export interface TmdbMovie {
  id: number
  title: string
  imdb_id: string | null
  release_date?: string
  overview?: string
  poster_path?: string | null
}

export interface TmdbTvShow {
  id: number
  name: string
  external_ids?: { imdb_id?: string | null; tvdb_id?: number | null }
  first_air_date?: string
  overview?: string
  poster_path?: string | null
}

// ── Known networks ────────────────────────────────────────────────────────────
// TMDB has no /search/network endpoint. This static list covers the major
// streaming services and broadcast networks with their canonical TMDB IDs.

const KNOWN_NETWORKS: TmdbNetworkSearchResult[] = [
  { id: 213,   name: 'Netflix',              logo_path: '/wwemzKWzjKYJFfCeiB57q3r4Bcm.png', origin_country: 'US' },
  { id: 1024,  name: 'Amazon Prime Video',   logo_path: null, origin_country: 'US' },
  { id: 2739,  name: 'Disney+',              logo_path: null, origin_country: 'US' },
  { id: 49,    name: 'HBO',                  logo_path: null, origin_country: 'US' },
  { id: 1081,  name: 'Max',                  logo_path: null, origin_country: 'US' },
  { id: 453,   name: 'Hulu',                 logo_path: null, origin_country: 'US' },
  { id: 2552,  name: 'Apple TV+',            logo_path: null, origin_country: 'US' },
  { id: 4330,  name: 'Paramount+',           logo_path: null, origin_country: 'US' },
  { id: 3353,  name: 'Peacock',              logo_path: null, origin_country: 'US' },
  { id: 174,   name: 'AMC',                  logo_path: null, origin_country: 'US' },
  { id: 2,     name: 'ABC',                  logo_path: null, origin_country: 'US' },
  { id: 6,     name: 'NBC',                  logo_path: null, origin_country: 'US' },
  { id: 16,    name: 'CBS',                  logo_path: null, origin_country: 'US' },
  { id: 19,    name: 'Fox',                  logo_path: null, origin_country: 'US' },
  { id: 56,    name: 'FX',                   logo_path: null, origin_country: 'US' },
  { id: 318,   name: 'Starz',                logo_path: null, origin_country: 'US' },
  { id: 2109,  name: 'Showtime',             logo_path: null, origin_country: 'US' },
  { id: 43,    name: 'National Geographic',  logo_path: null, origin_country: 'US' },
  { id: 64,    name: 'Discovery Channel',    logo_path: null, origin_country: 'US' },
  { id: 359,   name: 'BBC One',              logo_path: null, origin_country: 'GB' },
  { id: 4,     name: 'BBC Two',              logo_path: null, origin_country: 'GB' },
  { id: 332,   name: 'Channel 4',            logo_path: null, origin_country: 'GB' },
  { id: 577,   name: 'ITV',                  logo_path: null, origin_country: 'GB' },
  { id: 1623,  name: 'Sky Atlantic',         logo_path: null, origin_country: 'GB' },
  { id: 2677,  name: 'ITVX',                 logo_path: null, origin_country: 'GB' },
  { id: 3290,  name: 'Canal+',              logo_path: null, origin_country: 'FR' },
  { id: 547,   name: 'Arte',                 logo_path: null, origin_country: 'DE' },
  { id: 430,   name: 'Cartoon Network',      logo_path: null, origin_country: 'US' },
  { id: 54,    name: 'Adult Swim',           logo_path: null, origin_country: 'US' },
  { id: 67,    name: 'Syfy',                 logo_path: null, origin_country: 'US' },
  { id: 100,   name: 'CW',                   logo_path: null, origin_country: 'US' },
]

// ── Client ────────────────────────────────────────────────────────────────────

export class TmdbClient {
  private http: AxiosInstance

  constructor(apiKey: string) {
    this.http = axios.create({
      baseURL: TMDB_BASE_URL,
      params: { api_key: apiKey },
      timeout: 15_000,
    })
  }

  // ── Validation ───────────────────────────────────────────────────────────────

  /** Validates the API key with a lightweight call. Throws if invalid. */
  async validateApiKey(): Promise<{ name: string; version: string }> {
    const res = await this.http.get('/configuration')
    // If we get here without a 401, the key is valid
    return { name: 'TMDB', version: res.data?.api_version ?? '3' }
  }

  // ── Company search ───────────────────────────────────────────────────────────

  /** Searches for production companies by name. Returns top matches. */
  async searchCompany(query: string): Promise<TmdbCompanySearchResult[]> {
    const res = await this.http.get('/search/company', {
      params: { query, page: 1 },
    })
    return (res.data.results ?? []) as TmdbCompanySearchResult[]
  }

  /** Searches for TV networks by name. Returns top matches. */
  async searchNetwork(query: string): Promise<TmdbNetworkSearchResult[]> {
    // TMDB has no /search/network endpoint. We maintain a static list of
    // major networks and do a local case-insensitive substring match.
    // If the query looks like a number, we also try fetching that network ID directly.
    const q = query.trim().toLowerCase()
    const matched = KNOWN_NETWORKS.filter(
      (n) => n.name.toLowerCase().includes(q)
    )

    // If query is numeric, try fetching that ID directly from TMDB
    if (/^\d+$/.test(q)) {
      try {
        const res = await this.http.get(`/network/${q}`)
        const n = res.data as TmdbNetworkSearchResult
        if (n?.id && !matched.some((m) => m.id === n.id)) {
          matched.unshift(n)
        }
      } catch {
        // ignore — unknown ID
      }
    }

    return matched
  }

  /** Fetches full company details by TMDB company ID. */
  async getCompany(companyId: number): Promise<TmdbCompany> {
    const res = await this.http.get(`/company/${companyId}`)
    return res.data as TmdbCompany
  }

  // ── Discovery ────────────────────────────────────────────────────────────────

  /**
   * Returns all movies produced by any of the given TMDB company IDs (OR logic).
   * Paginates automatically — may make multiple requests for large studios.
   * Each movie includes imdb_id (via external_ids) for cross-referencing with Emby.
   */
  async discoverMoviesByCompany(companyIds: number[]): Promise<TmdbMovie[]> {
    if (companyIds.length === 0) return []
    const movies: TmdbMovie[] = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const res = await this.http.get('/discover/movie', {
        params: {
          with_companies: companyIds.join('|'),
          sort_by: 'popularity.desc',
          page,
          'vote_count.gte': 0,
        },
      })
      totalPages = Math.min(res.data.total_pages ?? 1, 50) // cap at 50 pages = 1000 movies
      const results: Array<{ id: number; title: string; release_date?: string; poster_path?: string | null }> =
        res.data.results ?? []

      // Fetch imdb_id for each movie via external_ids — batch via Promise.all with concurrency limit
      const withImdb = await this.fetchImdbIdsForMovies(results.map((r) => r.id))
      for (const r of results) {
        movies.push({
          id: r.id,
          title: r.title,
          imdb_id: withImdb.get(r.id) ?? null,
          release_date: r.release_date,
          poster_path: r.poster_path,
        })
      }
      page++
    }

    return movies
  }

  /**
   * Returns all TV shows on any of the given TMDB network IDs (OR logic).
   * Each show includes imdb_id and tvdb_id via external_ids.
   */
  async discoverTvByNetwork(networkIds: number[]): Promise<TmdbTvShow[]> {
    if (networkIds.length === 0) return []
    const shows: TmdbTvShow[] = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const res = await this.http.get('/discover/tv', {
        params: {
          with_networks: networkIds.join('|'),
          sort_by: 'popularity.desc',
          page,
        },
      })
      totalPages = Math.min(res.data.total_pages ?? 1, 50)
      const results: Array<{ id: number; name: string; first_air_date?: string; poster_path?: string | null }> =
        res.data.results ?? []

      const externalIds = await this.fetchExternalIdsForTv(results.map((r) => r.id))
      for (const r of results) {
        const ext = externalIds.get(r.id)
        shows.push({
          id: r.id,
          name: r.name,
          external_ids: { imdb_id: ext?.imdb_id ?? null, tvdb_id: ext?.tvdb_id ?? null },
          first_air_date: r.first_air_date,
          poster_path: r.poster_path,
        })
      }
      page++
    }

    return shows
  }

  /**
   * Returns all TV shows produced by any of the given TMDB company IDs (OR logic).
   * Each show includes imdb_id and tvdb_id via external_ids.
   */
  async discoverTvByCompany(companyIds: number[]): Promise<TmdbTvShow[]> {
    if (companyIds.length === 0) return []
    const shows: TmdbTvShow[] = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const res = await this.http.get('/discover/tv', {
        params: {
          with_companies: companyIds.join('|'),
          sort_by: 'popularity.desc',
          page,
        },
      })
      totalPages = Math.min(res.data.total_pages ?? 1, 50)
      const results: Array<{ id: number; name: string; first_air_date?: string; poster_path?: string | null }> =
        res.data.results ?? []

      const externalIds = await this.fetchExternalIdsForTv(results.map((r) => r.id))
      for (const r of results) {
        const ext = externalIds.get(r.id)
        shows.push({
          id: r.id,
          name: r.name,
          external_ids: { imdb_id: ext?.imdb_id ?? null, tvdb_id: ext?.tvdb_id ?? null },
          first_air_date: r.first_air_date,
          poster_path: r.poster_path,
        })
      }
      page++
    }

    return shows
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  /**
   * Fetches IMDb IDs for a list of TMDB movie IDs.
   * Runs in batches of 10 concurrent requests to respect rate limits.
   */
  private async fetchImdbIdsForMovies(tmdbIds: number[]): Promise<Map<number, string | null>> {
    const result = new Map<number, string | null>()
    const BATCH = 10

    for (let i = 0; i < tmdbIds.length; i += BATCH) {
      const batch = tmdbIds.slice(i, i + BATCH)
      const responses = await Promise.allSettled(
        batch.map((id) =>
          this.http.get(`/movie/${id}/external_ids`).then((r) => ({ id, imdb_id: r.data.imdb_id ?? null }))
        )
      )
      for (const res of responses) {
        if (res.status === 'fulfilled') {
          result.set(res.value.id, res.value.imdb_id)
        }
      }
    }

    return result
  }

  /**
   * Fetches IMDb and TVDB IDs for a list of TMDB TV show IDs.
   * Runs in batches of 10 concurrent requests to respect rate limits.
   */
  private async fetchExternalIdsForTv(
    tmdbIds: number[]
  ): Promise<Map<number, { imdb_id: string | null; tvdb_id: number | null }>> {
    const result = new Map<number, { imdb_id: string | null; tvdb_id: number | null }>()
    const BATCH = 10

    for (let i = 0; i < tmdbIds.length; i += BATCH) {
      const batch = tmdbIds.slice(i, i + BATCH)
      const responses = await Promise.allSettled(
        batch.map((id) =>
          this.http.get(`/tv/${id}/external_ids`).then((r) => ({
            id,
            imdb_id: r.data.imdb_id ?? null,
            tvdb_id: r.data.tvdb_id ?? null,
          }))
        )
      )
      for (const res of responses) {
        if (res.status === 'fulfilled') {
          result.set(res.value.id, {
            imdb_id: res.value.imdb_id,
            tvdb_id: res.value.tvdb_id,
          })
        }
      }
    }

    return result
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

let _tmdbClient: TmdbClient | null = null
let _tmdbKey = ''

export function getTmdbClient(apiKey: string): TmdbClient {
  if (!_tmdbClient || _tmdbKey !== apiKey) {
    _tmdbClient = new TmdbClient(apiKey)
    _tmdbKey = apiKey
  }
  return _tmdbClient
}

export function resetTmdbClient(): void {
  _tmdbClient = null
  _tmdbKey = ''
}
