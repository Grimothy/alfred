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
          Fields: 'Studios,Genres,Tags,ProductionYear',
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

  async clearCollection(collectionId: string): Promise<void> {
    // Get current members then remove them all
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
