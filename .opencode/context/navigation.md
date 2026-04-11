# Alfred — Navigation & Architecture Context

## Client Routes (src/client/App.tsx)

| Path | Component | File |
|---|---|---|
| `/` | Dashboard | pages/Dashboard.tsx |
| `/collections` | Collections grid | pages/Collections.tsx |
| `/collections/:id` | Collection detail page | pages/CollectionDetail.tsx |
| `/library` | Library browser | pages/Library.tsx |
| `/library/item/:id` | Media detail page | pages/MediaDetail.tsx |
| `/history` | Sync history | pages/History.tsx |
| `/settings` | Settings form | pages/Settings.tsx |
| `/setup` | First-run setup | pages/Setup.tsx |

## Pages

### Collections (`/collections`)
- Poster card grid (`auto-fill minmax(160px)`)
- Clicking a card navigates to `/collections/:id`
- Hover bar: Edit, Remove
- Top-right toggle per card: enable/disable
- "New Collection" button opens `CollectionEditor` drawer
- "Sync Now" button triggers sync

### CollectionDetail (`/collections/:id`)
- Full-bleed backdrop hero (420px), gradient scrim
- Poster thumbnail (130×195) overlapping hero bottom edge
- Title, rule badges, item count, enabled toggle, "TMDB matches" toggle (TMDB-backed only), Edit/Remove actions in hero
- **Filter/sort panel** above items grid: search input, type pills (All/Movie/Series), sort select (Name/Year/Rating), year range inputs, genre chips (dynamic from data), rating chips (dynamic from Emby OfficialRating values)
  - Genre filter applies to both Emby items (by Genres[]) and TMDB items (by genres[] from enriched TMDB detail)
  - Rating filter applies to Emby items only (OfficialRating field); TMDB items excluded since vote_average doesn't map cleanly to rating labels
  - Year/type/search filters apply to both Emby and TMDB items
- Items grid below (`auto-fill minmax(130px)`) with real Emby poster images
- **Clicking any item card navigates to `/library/item/:id`** (Emby items) or `/library/item/:id?source=tmdb...` (TMDB matches)
- When "TMDB matches" is enabled: two-section layout — "In collection" grid + "Not in collection — TMDB matches" grid (purple glow cards); both filtered by the panel above
- "← Collections" back button top-left
- Opens `CollectionEditor` drawer for editing

### MediaDetail (`/library/item/:id`)
- Full-bleed backdrop hero + poster overlapping bottom edge (same layout as CollectionDetail)
- Title, year badge, type badge, studio badge, genre badges
- Synopsis/Overview section, Details section (runtime, IDs)
- For Series: season rows with availability indicators (✓ Available, ⚠ Partial, ✗ Missing)
- Season availability: compared against `EpisodesInSeason` vs `EpisodeCount` from Emby
- **Sonarr integration (series)**: "Request Full Series to Sonarr" button in hero; per-season "Request Missing" / "Request Season" buttons; bottom-right floating panel with quality profile + root folder selectors; success toast on completion; error display in panel
- **Partial season request**: `seasonStatuses = [{ seasonNumber, monitored: true }]` — only that season monitored
- **Full series request**: no `seasonStatuses` — all seasons monitored
- `addOptions.searchForMissingEpisodes: true` — triggers automatic search after adding
- **Radarr integration (movies)**: "Request to Radarr" button in hero; floating panel with quality profile + root folder selectors; success toast; error display in panel
- `addOptions.searchForMovie: true` — triggers automatic search after adding
- Back navigation via `navigate(-1)`
  - TMDB items not yet in Emby: navigated via `?source=tmdb&tmdbId=X&type=Y&name=Z&year=W` params
  - **TMDB-only view**: when `source=tmdb` and item is not in Emby, fetches full TMDB detail via `GET /api/library/tmdb/:id?type=tv|movie`; renders backdrop, poster, overview, genres, Details (TMDB/TVDB/IMDB IDs, network, episodes), and season rows (all shown as ✗ missing since not in library)

## Shared Components (src/client/components/)

| Component | Props summary |
|---|---|
| Button | variant: primary/secondary/ghost/danger, size: sm/md/lg, loading |
| Badge | label, variant: default/gold/success/error, onRemove? |
| Toggle | checked, onChange, disabled? |
| Card | children, className?, accent? |
| CollectionEditor | open, collection?, onClose — full create/edit drawer (480px) |

## API (src/client/api/index.ts)

Key functions and return types:
- `getCollections()` → `Collection[]`
- `getSettings()` / `setSettings()` → `Settings`
- `toggleCollection(id, enabled)` → void
- `toggleTmdbMatches(id, include)` → void  (TMDB-backed collections only)
- `deleteCollection(id)` → void
- `previewCollectionById(id, refresh?)` → `{ count, items }` | `ExpandedPreviewResponse` (see below)
- `getSyncStatus()` → `SyncStatus`
- `triggerSync()` → void
- `getItemDetail(id, tmdbId?)` → `EmbyItemDetail` (full item with seasons for series; pass tmdbId to resolve via TMDB provider ID)
- `getTmdbDetail(tmdbId, type)` → `TmdbTvDetail | TmdbMovieDetail` (full TMDB metadata for items not in Emby)
- `testSonarrConnection(url?, apiKey?)` → `{ ok, version?, error? }`
- `testRadarrConnection(url?, apiKey?)` → `{ ok, version?, error? }`
- `addSonarrSeries(opts)` → Sonarr series (full or partial season)
- `addRadarrMovie(opts)` → Radarr movie
- `getSonarrQualityProfiles()`, `getSonarrRootFolders()`, `getSonarrSeries()`
- `getRadarrQualityProfiles()`, `getRadarrRootFolders()`, `getRadarrMovies()`

Key types:
- `Collection` — id, name, enabled (0|1), poster_path (abs FS path), backdrop_path (abs FS path), use_tmdb, include_tmdb_matches (0|1), rules: Rule[]
- `EmbyItem` — Id, Name, Type, Studios, Genres, Tags?, ProductionYear?, OfficialRating?, CommunityRating?, Overview?, ProviderIds, ImageTags?, BackdropImageTags?, SeasonCount?, Seasons?[]
- `EmbyItemDetail` — extends EmbyItem with full detail (Seasons for series)
- `Rule` — field, value, content_type?, match_type?
- `TmdbDiscoveryItem` — id, name, type: 'movie'|'tv', imdb_id, tvdb_id, poster_path, release_date?, first_air_date?, genres?: string[], vote_average?: number
- `ExpandedPreviewResponse` — count, inCollection: EmbyItem[], notInCollection: TmdbDiscoveryItem[]
- `TmdbTvDetail` — id, name, overview, first_air_date, last_air_date, status, poster_path, backdrop_path, genres[], networks[], seasons: TmdbTvSeason[], number_of_seasons, number_of_episodes, vote_average, external_ids (imdb_id, tvdb_id)
- `TmdbMovieDetail` — id, title, overview, release_date, runtime, poster_path, backdrop_path, genres[], production_companies[], vote_average, external_ids (imdb_id)
- `TmdbTvSeason` — season_number, episode_count, name, overview?, air_date?, poster_path?

## Image URL Patterns

| Source | Storage | Browser URL |
|---|---|---|
| Collection poster/backdrop | Abs FS path in DB e.g. `/app/data/images/collection-1-poster.jpg` | `/images/collection-1-poster.jpg` (via `toImageUrl()` helper) |
| Emby item poster | `item.ImageTags.Primary` tag | `/api/emby/image/:itemId?type=Primary&tag=:tag&w=300` (server proxy) |
| TMDB item poster | `poster_path` from TMDB API | `https://image.tmdb.org/t/p/w300${poster_path}` |

## Server Routes (src/server/)

| Mount | Router file |
|---|---|
| `GET /images/*` | Static — serves `IMAGES_DIR` (data/images/) |
| `/api/settings` | routes/settings.ts |
| `/api/collections` | routes/collections.ts |
| `/api/sync` | routes/sync.ts |
| `/api/library` | routes/library.ts |
| `/api/sonarr` | routes/sonarr.ts |
| `/api/radarr` | routes/radarr.ts |
| `GET /api/emby/image/:itemId` | Inline in index.ts — proxies Emby image, hides API key |
| `GET /api/emby/test` | Inline in index.ts |
| `GET /api/health` | Inline in index.ts |
| `GET /api/version` | Inline in index.ts |

### Sonarr API (`/api/sonarr`)
- `GET /api/sonarr/status` — configured, url, hasApiKey
- `POST /api/sonarr/test` — test connection
- `GET /api/sonarr/qualityprofiles` — list quality profiles
- `GET /api/sonarr/rootfolders` — list root folders
- `GET /api/sonarr/lookup?term=` — search series by term
- `GET /api/sonarr/series` — list all series in Sonarr
- `POST /api/sonarr/series` — add series; body: `{ tvdbId, seasonStatuses?, qualityProfileId?, rootFolderPath? }`; `seasonStatuses` for partial season monitoring

### Radarr API (`/api/radarr`)
- `GET /api/radarr/status` — configured, url, hasApiKey
- `POST /api/radarr/test` — test connection
- `GET /api/radarr/qualityprofiles` — list quality profiles
- `GET /api/radarr/rootfolders` — list root folders
- `GET /api/radarr/lookup?term=` — search movies by term
- `GET /api/radarr/movie` — list all movies in Radarr
- `POST /api/radarr/movie` — add movie; body: `{ tmdbId, qualityProfileId?, rootFolderPath? }`; `addOptions.searchForMovie: true`

### Collections API additions
- `PATCH /api/collections/:id/toggle-tmdb-matches` — toggles `include_tmdb_matches` (0|1); only valid when `use_tmdb=1`
- `GET /api/collections/:id/preview` — when `include_tmdb_matches=1`: returns `{ count, inCollection, notInCollection }`; use `?refresh=true` to bypass 72h TMDB discovery cache

### Library API additions
- `GET /api/library/item/:id` — full Emby item detail including `Seasons[]` for series; fields: Studios, Genres, Tags, ProductionYear, OfficialRating, CommunityRating, ProviderIds, ImageTags, BackdropImageTags, Overview, SeasonCount, CumulativeRuntime, EpisodeRunTime
- `GET /api/library/item/:id?tmdbId=X` — resolves Emby item by TMDB provider ID first; returns 404 `{ error: 'Item not in Emby library' }` if not found (client falls back to TMDB-only view)
- `GET /api/library/tmdb/:id?type=movie|tv` — fetches full TMDB detail (overview, genres, seasons, networks, external IDs) for items not yet in Emby; requires `tmdb_api_key` in settings

## Key Server Files

| File | Purpose |
|---|---|
| `src/server/db/schema.ts` | `initDb()` — SQLite WAL init, idempotent; manages `collections`, `collection_rules`, `sync_history`, `tmdb_company_cache`, `tmdb_discovery_cache`, `tmdb_item_details` tables |
| `src/server/db/queries.ts` | All typed SQLite access — `getCollections`, `createCollection`, etc.; discovery cache: `getDiscoveryCache`, `setDiscoveryCache`, `invalidateDiscoveryCache`; item detail cache: `getTmdbItemDetail`, `setTmdbItemDetail`, `getTmdbItemDetailBatch` (7-day TTL, per-item) |
| `src/server/emby/client.ts` | `EmbyClient` class + `getEmbyClient()` singleton |
| `src/server/sync/engine.ts` | `runSync()`, `previewTmdbCollection*()`, `previewCollectionWithRules()`, `IMAGES_DIR` |
| `src/server/sync/scheduler.ts` | node-cron wrapper |

## Design Tokens (index.css)

- `--bg-primary: #1a1a1f` `--bg-card: #2a2a34` `--bg-secondary`
- `--accent-gold: #c9a84c` `--accent-gold-glow: rgba(201,168,76,0.15)`
- `--accent-purple: #9370DB` `--accent-purple-glow: rgba(147,112,219,0.22)` — used for "not in collection" TMDB match cards
- `--text-primary: #f0eee8` `--text-muted: #5c5a54`
- `--font-display: 'Playfair Display'` (headings only)
- `--font-mono: 'DM Mono'` (all other text)
- `--border-subtle` `--border-accent` `--radius-sm` `--radius-md`
