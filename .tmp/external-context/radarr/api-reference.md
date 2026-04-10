---
source: Radarr OpenAPI Specification (openapi.json from Radarr GitHub repository)
library: Radarr
package: radarr
topic: api-reference
fetched: 2026-04-10
official_docs: https://radarr.video/docs/api/
---

# Radarr API Reference

## Base URL & Authentication

**Default Base URL**: `http://localhost:7878/api/v3`

**Authentication Methods**:
1. **Header (preferred)**: `X-Api-Key: <your_api_key>`
2. **Query Parameter**: `?apikey=<your_api_key>`

API key is found in Radarr Settings → General → API Key.

**Validation Endpoint**: `GET /api` returns `{ "current": "v3", "deprecated": [] }`

---

## Core Endpoints

### Movies

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v3/movie` | Get all movies (or single by `?tmdbId=`) |
| `POST` | `/api/v3/movie` | Add a new movie |
| `GET` | `/api/v3/movie/{id}` | Get movie by ID |
| `PUT` | `/api/v3/movie/{id}` | Update movie |
| `DELETE` | `/api/v3/movie/{id}` | Delete movie (`?deleteFiles=false&addImportExclusion=false`) |

### Other Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v3/calendar` | Upcoming movies (filter by `start`, `end`, `unmonitored`, `tags`) |
| `GET /api/v3/health` | System health checks |
| `GET /api/v3/system/backup` | List backups |
| `POST /api/v3/command` | Execute commands (e.g., `RefreshMovie`, `RescanMovie`) |
| `GET /api/v3/queue` | Current download queue |
| `GET /api/v3/profile` | Quality profiles |
| `GET /api/v3/rootfolder` | Root folders |
| `GET /api/v3/tag` | All tags |

---

## Adding a Movie (POST /api/v3/movie)

### Minimum Required Fields

```json
{
  "tmdbId": 603692,        // REQUIRED: TMDB ID (integer)
  "qualityProfileId": 1,    // REQUIRED: Quality profile ID (integer)
  "rootFolderPath": "/movies",  // REQUIRED if not providing full "path"
  "monitored": true,       // OPTIONAL (default: true)
  "addOptions": {
    "searchForMovie": false // OPTIONAL (default: true - triggers automatic search)
  }
}
```

### Alternative: Add by Title (without tmdbId)

```json
{
  "title": "The Matrix",   // Movie title (used if tmdbId not provided)
  "qualityProfileId": 1,
  "rootFolderPath": "/movies",
  "monitored": true,
  "addOptions": {
    "searchForMovie": true
  }
}
```

### Full MovieResource Schema

```typescript
interface MovieResource {
  id: number;
  title: string;
  originalTitle: string;
  originalLanguage: Language;
  alternateTitles: AlternativeTitleResource[];
  secondaryYear: number | null;
  sortTitle: string;
  sizeOnDisk: number | null;
  status: MovieStatusType; // "tba" | "announced" | "inCinemas" | "released" | "deleted"
  overview: string;
  inCinemas: Date | null;
  physicalRelease: Date | null;
  digitalRelease: Date | null;
  releaseDate: Date | null;
  images: MediaCover[];
  website: string;
  year: number;
  youTubeTrailerId: string;
  studio: string;
  path: string;  // Full path (e.g., "/movies/The Matrix (1999)")
  qualityProfileId: number;
  hasFile: boolean;
  monitored: boolean;
  minimumAvailability: MovieStatusType;
  isAvailable: boolean;
  folderName: string;
  runtime: number;  // minutes
  imdbId: string;
  tmdbId: number;
  titleSlug: string;
  rootFolderPath: string;
  genres: string[];
  tags: number[];  // Tag IDs
  added: Date;
  addOptions: AddMovieOptions;
  ratings: Ratings;
  statistics: MovieStatisticsResource;
}
```

### AddMovieOptions Schema

```typescript
interface AddMovieOptions {
  ignoreEpisodesWithFiles?: boolean;  // Radarr: not used (movies only)
  ignoreEpisodesWithoutFiles?: boolean;
  monitor: MonitorTypes; // "all" | "movieOnly" | "none" | "future" | "existing"
  searchForMovie: boolean;  // Trigger automatic search after add
  addMethod?: AddMovieMethod; // "auto" | "manual"
}
```

---

## Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success (GET, PUT) |
| `201` | Created (POST - returns created movie) |
| `400` | Bad Request (validation error) |
| `404` | Not Found |
| `500` | Server Error |

---

## Connection Validation Pattern

```typescript
// Validate Radarr connection
async function validateRadarrConnection(host: string, apiKey: string): Promise<boolean> {
  try {
    const response = await axios.get(`${host}/api`, {
      headers: { 'X-Api-Key': apiKey }
    });
    return response.data?.current === 'v3';
  } catch {
    return false;
  }
}

// Alternative: Use health endpoint
async function checkRadarrHealth(host: string, apiKey: string): Promise<HealthResource[]> {
  const response = await axios.get(`${host}/api/v3/health`, {
    headers: { 'X-Api-Key': apiKey }
  });
  return response.data;
}
```

---

## Radarr vs Sonarr API Differences

| Aspect | Radarr | Sonarr |
|--------|--------|--------|
| **Media Type** | Movies | TV Shows / Episodes |
| **ID Source** | TMDB (preferred) | TVDB (primary), TMDB (anime) |
| **Content Unit** | `Movie` / `MovieFile` | `Series` / `Episode` |
| **Default Port** | `7878` | `8989` |
| **Minimum for Add** | `tmdbId` + `qualityProfileId` | `tvdbId` + `qualityProfileId` |
| **Monitor Options** | Movie-level only | Series + Episode level |
| **Calendar** | Movies by release date | Episodes by air date |
| **Collection** | Movie collections (TMDB) | Not applicable |

### Key Sonarr-Specific Endpoints (for comparison)

Sonarr has additional series/episode-specific endpoints:
- `GET /api/v3/series` - All series
- `GET /api/v3/episode` - Episodes (filter by `seriesId`)
- `GET /api/v3/season` - Seasons by series

Radarr equivalents:
- `GET /api/v3/movie` - All movies
- `GET /api/v3/movie/{id}` - Single movie with files

---

## Common Integration Patterns

### 1. Add Movie with Search

```typescript
await axios.post(`${host}/api/v3/movie`, {
  tmdbId: 603692,
  qualityProfileId: 1,
  rootFolderPath: "/movies",
  monitored: true,
  addOptions: { searchForMovie: true }
}, { headers: { 'X-Api-Key': apiKey } });
```

### 2. Get Movie Details

```typescript
// By TMDB ID
const { data } = await axios.get(`${host}/api/v3/movie`, {
  params: { tmdbId: 603692 },
  headers: { 'X-Api-Key': apiKey }
});

// By internal ID
const { data } = await axios.get(`${host}/api/v3/movie/1`, {
  headers: { 'X-Api-Key': apiKey }
});
```

### 3. Refresh Movie Metadata

```typescript
await axios.post(`${host}/api/v3/command`, {
  name: "RefreshMovie",
  movieId: 123
}, { headers: { 'X-Api-Key': apiKey } });
```

---

## Error Handling Example

```typescript
try {
  const response = await axios.post(`${host}/api/v3/movie`, movieData, {
    headers: { 'X-Api-Key': apiKey }
  });
  return response.data;
} catch (err) {
  if (err.response?.status === 400) {
    const errors = err.response.data;
    // Validation errors: { "property": "error message" }
  }
  throw err;
}
```

---

## Official Documentation

- **API Docs**: https://radarr.video/docs/api/
- **Swagger UI**: `http://localhost:7878/api-docs` (when Radarr is running)
- **Full OpenAPI Spec**: [Radarr GitHub](https://github.com/Radarr/Radarr/blob/develop/src/Radarr.Api.V3/openapi.json)
- **Wiki**: https://wiki.servarr.com/radarr
