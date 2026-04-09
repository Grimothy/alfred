import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Rule {
  id?: number
  collection_id?: number
  field: string
  value: string
  content_type?: string
  match_type?: string
  tags?: string
}

export interface TmdbIdEntry {
  id: number
  name: string
}

export interface Collection {
  id: number
  name: string
  enabled: number
  poster_path: string | null
  backdrop_path: string | null
  use_tmdb: number
  tmdb_company_id: number | null
  tmdb_network_id: number | null
  tmdb_company_ids: string | null
  tmdb_network_ids: string | null
  remove_from_emby: number
  created_at: string
  rules: Rule[]
}

export interface SyncStatus {
  running: boolean
  latest: SyncHistoryItem | null
}

export interface SyncHistoryItem {
  id: number
  started_at: string
  completed_at: string | null
  status: string
  summary: SyncSummary | null
}

export interface SyncSummary {
  collections: CollectionResult[]
  totalAdded: number
  totalRemoved: number
  durationMs: number
  error?: string
}

export interface CollectionResult {
  collectionId: string
  name: string
  added: number
  removed: number
  total: number
  error?: string
}

export interface Studio {
  name: string
  movies: number
  series: number
}

export interface EmbyItem {
  Id: string
  Name: string
  Type: string
  Studios: { Name: string; Id: number }[]
  Genres: string[]
  Tags?: string[]
  ProductionYear?: number
}

export interface Settings {
  emby_host: string
  emby_api_key: string
  sync_schedule: string
  sync_enabled: string
  tmdb_api_key: string
}

// ── App ───────────────────────────────────────────────────────────────────────

export const getVersion = () =>
  api.get<{ version: string }>('/version').then((r) => r.data.version)

// ── Settings ──────────────────────────────────────────────────────────────────

export const getSettings = () =>
  api.get<Settings>('/settings').then((r) => r.data)

export const updateSettings = (data: Partial<Settings>) =>
  api.put('/settings', data).then((r) => r.data)

export const testConnection = (host?: string, apiKey?: string) => {
  const params: Record<string, string> = {}
  if (host) params.host = host
  if (apiKey && apiKey !== '••••••••') params.apiKey = apiKey
  return api.get('/emby/test', { params }).then((r) => r.data)
}

export const testTmdbConnection = (apiKey: string) =>
  api.post<{ ok: boolean; name: string; version: string }>(
    '/settings/tmdb/test',
    { apiKey }
  ).then((r) => r.data)

export const refreshTmdbCache = () =>
  api.post<{ refreshed: number; failed: number }>(
    '/settings/tmdb/cache/refresh'
  ).then((r) => r.data)

export interface TmdbCompanyResult {
  id: number
  name: string
  logo_path: string | null
  origin_country: string
}

export const searchTmdbCompanies = (q: string) =>
  api
    .get<TmdbCompanyResult[]>('/collections/tmdb/search', { params: { q } })
    .then((r) => r.data)

export interface TmdbNetworkResult {
  id: number
  name: string
  logo_path: string | null
  origin_country: string
}

export const searchTmdbNetworks = (q: string) =>
  api
    .get<TmdbNetworkResult[]>('/collections/tmdb/networks/search', { params: { q } })
    .then((r) => r.data)

// ── Collections ───────────────────────────────────────────────────────────────

export const getCollections = () =>
  api.get<Collection[]>('/collections').then((r) => r.data)

export const createCollection = (data: {
  name: string
  rules: Rule[]
  use_tmdb?: number
  tmdb_company_id?: number | null
  tmdb_network_id?: number | null
  tmdb_company_ids?: TmdbIdEntry[]
  tmdb_network_ids?: TmdbIdEntry[]
  remove_from_emby?: number
}) => api.post<Collection>('/collections', data).then((r) => r.data)

export const updateCollection = (
  id: number,
  data: {
    name: string
    rules: Rule[]
    enabled?: boolean
    use_tmdb?: number
    tmdb_company_id?: number | null
    tmdb_network_id?: number | null
    tmdb_company_ids?: TmdbIdEntry[]
    tmdb_network_ids?: TmdbIdEntry[]
    remove_from_emby?: number
  }
) => api.put<Collection>(`/collections/${id}`, data).then((r) => r.data)

export const toggleCollection = (id: number, enabled: boolean) =>
  api
    .patch(`/collections/${id}/toggle`, { enabled })
    .then((r) => r.data)

export const deleteCollection = (id: number) =>
  api.delete(`/collections/${id}`).then((r) => r.data)

export const uploadCollectionImage = (
  id: number,
  type: 'poster' | 'backdrop',
  file: File
) => {
  const form = new FormData()
  form.append('image', file)
  return api
    .post(`/collections/${id}/images/${type}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data)
}

export const deleteCollectionImage = (id: number, type: 'poster' | 'backdrop') =>
  api.delete(`/collections/${id}/images/${type}`).then((r) => r.data)

export const previewCollectionById = (id: number) =>
  api
    .get<{ count: number; items: EmbyItem[] }>(`/collections/${id}/preview`)
    .then((r) => r.data)

export const previewCollectionRules = (
  rules: Rule[]
) =>
  api
    .post<{ count: number; items: EmbyItem[] }>('/collections/preview', {
      rules,
    })
    .then((r) => r.data)

// ── Sync ──────────────────────────────────────────────────────────────────────

export const triggerSync = () =>
  api.post('/sync/run').then((r) => r.data)

export const getSyncStatus = () =>
  api.get<SyncStatus>('/sync/status').then((r) => r.data)

export const getSyncHistory = () =>
  api.get<SyncHistoryItem[]>('/sync/history').then((r) => r.data)

// ── Library ───────────────────────────────────────────────────────────────────

export const getStudios = () =>
  api.get<Studio[]>('/library/studios').then((r) => r.data)

export const getStudioItems = (name: string) =>
  api
    .get<EmbyItem[]>(`/library/studios/${encodeURIComponent(name)}/items`)
    .then((r) => r.data)
