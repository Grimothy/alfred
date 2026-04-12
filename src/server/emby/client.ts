import axios, { AxiosInstance } from 'axios'
import fs from 'fs'

export interface EmbyItem {
  Id: string
  Name: string
  Type: string
  Studios: { Name: string; Id: number }[]
  Genres: string[]
  Tags?: string[]
  ProductionYear?: number
  PremiereDate?: string
  OfficialRating?: string
  CommunityRating?: number
  ProviderIds?: { Imdb?: string; IMDB?: string; Tvdb?: string; TVDB?: string }
  ImageTags?: { Primary?: string; [key: string]: string | undefined }
  BackdropImageTags?: string[]
  Overview?: string
  SeasonCount?: number
  CumulativeRuntime?: number
  EpisodeRunTime?: number[]
  Seasons?: EmbySeason[]
}

export interface EmbySeason {
  SeasonNumber: number
  EpisodeCount: number
  ImageTags?: { Primary?: string }
  EpisodesInSeason?: number
}

export interface EmbyCollection {
  Id: string
  Name: string
  Type: string
}

export interface EmbyStudio {
  Name: string
  Id: number
}

export class EmbyClient {
  private http: AxiosInstance

  constructor(host: string, apiKey: string) {
    // Normalize host: strip trailing slash
    const base = host.replace(/\/+$/, '')
    this.http = axios.create({
      baseURL: base,
      params: { api_key: apiKey },
      timeout: 30_000,
    })
  }

  // ── Library Items ────────────────────────────────────────────────────────────

  async getItems(types: string[] = ['Movie', 'Series']): Promise<EmbyItem[]> {
    const items: EmbyItem[] = []
    const limit = 500
    let startIndex = 0

    while (true) {
      const res = await this.http.get('/emby/Items', {
        params: {
          IncludeItemTypes: types.join(','),
          Fields: 'Studios,Genres,Tags,ProductionYear,OfficialRating,CommunityRating,ProviderIds,ImageTags',
          Recursive: true,
          StartIndex: startIndex,
          Limit: limit,
        },
      })
      const page: EmbyItem[] = res.data.Items ?? []
      items.push(...page)
      if (items.length >= res.data.TotalRecordCount || page.length === 0) break
      startIndex += limit
    }

    return items
  }

  async searchItems(query: string, types: string[] = ['Movie', 'Series']): Promise<EmbyItem[]> {
    const res = await this.http.get('/emby/Items', {
      params: {
        SearchTerm: query,
        IncludeItemTypes: types.join(','),
        Fields: 'Studios,Genres,Tags,ProductionYear,OfficialRating,CommunityRating,ProviderIds,ImageTags',
        Recursive: true,
        Limit: 20,
      },
    })
    return res.data.Items ?? []
  }

  // ── Studios ──────────────────────────────────────────────────────────────────

  async getStudios(): Promise<EmbyStudio[]> {
    const res = await this.http.get('/emby/Studios', {
      params: { Recursive: true },
    })
    return res.data.Items ?? []
  }

  // ── Collections ──────────────────────────────────────────────────────────────

  async getCollections(): Promise<EmbyCollection[]> {
    const res = await this.http.get('/emby/Items', {
      params: {
        IncludeItemTypes: 'BoxSet',
        Recursive: true,
      },
    })
    return res.data.Items ?? []
  }

  async createCollection(name: string, ids: string[]): Promise<string> {
    const res = await this.http.post('/emby/Collections', null, {
      params: {
        Name: name,
        Ids: ids.join(','),
      },
    })
    return res.data.Id as string
  }

  async addToCollection(collectionId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await this.http.post(`/emby/Collections/${collectionId}/Items`, null, {
      params: { Ids: ids.join(',') },
    })
  }

  async removeFromCollection(
    collectionId: string,
    ids: string[]
  ): Promise<void> {
    if (ids.length === 0) return
    await this.http.delete(`/emby/Collections/${collectionId}/Items`, {
      params: { Ids: ids.join(',') },
    })
  }

  async collectionExists(collectionId: string): Promise<boolean> {
    try {
      const res = await this.http.get(`/emby/Items/${collectionId}`)
      return res.status === 200
    } catch {
      return false
    }
  }

  async clearCollection(collectionId: string): Promise<number> {
    // Get current members then remove them all; returns the number of items removed
    const res = await this.http.get('/emby/Items', {
      params: {
        ParentId: collectionId,
        Recursive: false,
      },
    })
    const currentIds: string[] = (res.data.Items ?? []).map(
      (i: EmbyItem) => i.Id
    )
    if (currentIds.length > 0) {
      await this.removeFromCollection(collectionId, currentIds)
    }
    return currentIds.length
  }

  async getCollectionItemIds(collectionId: string): Promise<string[]> {
    const res = await this.http.get('/emby/Items', {
      params: {
        ParentId: collectionId,
        Recursive: false,
      },
    })
    return (res.data.Items ?? []).map((i: EmbyItem) => i.Id)
  }

  // ── Images ───────────────────────────────────────────────────────────────────

  async deleteCollectionImage(
    collectionId: string,
    imageType: 'Primary' | 'Backdrop',
    imageIndex?: number
  ): Promise<void> {
    const url = imageIndex !== undefined
      ? `/emby/Items/${collectionId}/Images/${imageType}/${imageIndex}`
      : `/emby/Items/${collectionId}/Images/${imageType}`
    await this.http.delete(url).catch(() => {
      // Ignore 404 — image may not exist yet
    })
  }

  async getCollectionImages(
    collectionId: string
  ): Promise<{ ImageType: string; ImageIndex?: number }[]> {
    const res = await this.http.get(`/emby/Items/${collectionId}/Images`)
    return res.data ?? []
  }

  async setCollectionImage(
    collectionId: string,
    imageType: 'Primary' | 'Backdrop',
    filePath: string,
    mimeType: string
  ): Promise<void> {
    // Delete all existing images of this type first to avoid accumulation
    // (Emby appends Backdrop images as fanart0, fanart1, etc. on each POST)
    if (imageType === 'Backdrop') {
      const existing = await this.getCollectionImages(collectionId)
      const backdrops = existing.filter((i) => i.ImageType === 'Backdrop')
      // Delete in reverse index order to avoid index shifting
      for (let i = backdrops.length - 1; i >= 0; i--) {
        await this.deleteCollectionImage(collectionId, 'Backdrop', backdrops[i].ImageIndex ?? i)
      }
    } else {
      await this.deleteCollectionImage(collectionId, 'Primary')
    }

    const imageData = fs.readFileSync(filePath)
    // Emby expects a Base64-encoded string body (not raw binary).
    // Pass as ASCII Buffer with transformRequest identity to prevent axios
    // from JSON-serializing the string.
    const base64 = imageData.toString('base64')
    const base64Buf = Buffer.from(base64, 'ascii')
    await this.http.post(
      `/emby/Items/${collectionId}/Images/${imageType}`,
      base64Buf,
      {
        headers: { 'Content-Type': mimeType },
        transformRequest: [(data: unknown) => data],
        maxBodyLength: 20 * 1024 * 1024, // 20 MB
      }
    )
  }

  // ── Episodes for a series ────────────────────────────────────────────────────

  async getEpisodes(seriesId: string): Promise<{ SeasonId: string; SeasonNumber: number }[]> {
    const episodes: { SeasonId: string; SeasonNumber: number }[] = []
    const limit = 500
    let startIndex = 0

    while (true) {
      const res = await this.http.get(`/emby/Shows/${seriesId}/Episodes`, {
        params: {
          StartIndex: startIndex,
          Limit: limit,
          Fields: 'Id',
        },
      })
      const raw: { SeasonId?: string; ParentId?: string; ParentIndexNumber?: number }[] = res.data.Items ?? []
      const page = raw.map((ep) => ({
        SeasonId: ep.SeasonId ?? ep.ParentId ?? '',
        SeasonNumber: ep.ParentIndexNumber ?? 0,
      }))
      episodes.push(...page)
      if (episodes.length >= res.data.TotalRecordCount || page.length === 0) break
      startIndex += limit
    }

    return episodes
  }

  // ── Seasons for a series ─────────────────────────────────────────────────────

  async getSeasons(seriesId: string): Promise<EmbySeason[]> {
    const res = await this.http.get(`/emby/Shows/${seriesId}/Seasons`, {
      params: {
        Fields: 'ImageTags',
      },
    })
    return (res.data.Items ?? []).map((s: { IndexNumber?: number; ChildCount?: number; ImageTags?: { Primary?: string } }) => ({
      SeasonNumber: s.IndexNumber ?? 0,
      EpisodeCount: s.ChildCount ?? 0,
      ImageTags: s.ImageTags,
    })) as EmbySeason[]
  }

  async getItemByTmdbId(tmdbId: string): Promise<EmbyItem | null> {
    const res = await this.http.get('/emby/Items', {
      params: {
        AnyProviderIdEquals: `Tmdb.${tmdbId}`,
        Recursive: true,
        IncludeItemTypes: 'Movie,Series',
        Fields: 'Studios,Genres,Tags,ProductionYear,ProviderIds,ImageTags,BackdropImageTags,Overview,SeriesStudio,SeasonCount,CumulativeRuntime,EpisodeRunTime',
      },
    })
    const item = res.data.Items?.[0] as EmbyItem | undefined
    if (!item) return null

    if (item.Type === 'Series') {
      const [seasons, episodes] = await Promise.all([
        this.getSeasons(item.Id),
        this.getEpisodes(item.Id),
      ])
      const countBySeason = new Map<number, number>()
      for (const ep of episodes) {
        countBySeason.set(ep.SeasonNumber, (countBySeason.get(ep.SeasonNumber) ?? 0) + 1)
      }
      for (const season of seasons) {
        season.EpisodesInSeason = countBySeason.get(season.SeasonNumber) ?? 0
        season.EpisodeCount = season.EpisodesInSeason
      }
      item.Seasons = seasons
    }

    return item
  }

  // ── Single item (full detail) ────────────────────────────────────────────────

  async getItemById(id: string): Promise<EmbyItem> {
    const res = await this.http.get('/emby/Items', {
      params: {
        Ids: id,
        Recursive: true,
        Fields: 'Studios,Genres,Tags,ProductionYear,ProviderIds,ImageTags,BackdropImageTags,Overview,SeriesStudio,SeasonCount,CumulativeRuntime,EpisodeRunTime',
      },
    })
    const item = res.data.Items?.[0] as EmbyItem | undefined
    if (!item) throw new Error(`Item ${id} not found`)

    // For series, fetch seasons and enrich with actual episode counts in the library
    if (item.Type === 'Series') {
      const [seasons, episodes] = await Promise.all([
        this.getSeasons(id),
        this.getEpisodes(id),
      ])
      const countBySeason = new Map<number, number>()
      for (const ep of episodes) {
        countBySeason.set(ep.SeasonNumber, (countBySeason.get(ep.SeasonNumber) ?? 0) + 1)
      }
      for (const season of seasons) {
        season.EpisodesInSeason = countBySeason.get(season.SeasonNumber) ?? 0
        // EpisodeCount = what Emby has (no external total available from this endpoint)
        season.EpisodeCount = season.EpisodesInSeason
      }
      item.Seasons = seasons
    }

    return item
  }

  // ── System ───────────────────────────────────────────────────────────────────

  async testConnection(): Promise<{ ServerName: string; Version: string }> {
    const res = await this.http.get('/emby/System/Info/Public')
    return res.data
  }
}

// Singleton factory — rebuilt whenever settings change
let _client: EmbyClient | null = null
let _clientHost = ''
let _clientKey = ''

export function getEmbyClient(host: string, apiKey: string): EmbyClient {
  if (!_client || _clientHost !== host || _clientKey !== apiKey) {
    _client = new EmbyClient(host, apiKey)
    _clientHost = host
    _clientKey = apiKey
  }
  return _client
}

export function resetEmbyClient(): void {
  _client = null
}
