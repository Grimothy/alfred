# TMDB API Research for Studio-Based Content Groupings

**Date:** 2026-04-07
**Purpose:** Research TMDB and related APIs to enhance studio-based content groupings/collections in Alfred

---

## 1. TMDB API Key Endpoints

### 1.1 Collections (Franchises/Series)

TMDB's **Collections** endpoint returns official franchise groupings that go well beyond what Emby's "studio" metadata provides.

#### Get Collection Details
```
GET https://api.themoviedb.org/3/collection/{collection_id}
```
**Example Response (Star Wars Collection - ID: 10):**
```json
{
  "id": 10,
  "name": "Star Wars Collection",
  "overview": "An epic space-opaque theatrical film series...",
  "poster_path": "/22dj38IckjzEEUZwN1tPU5VJ1qq.jpg",
  "backdrop_path": "/4z9ijhgEthfRHShoOvMaBlpciXS.jpg",
  "parts": [
    { "id": 11, "name": "Star Wars", "release_date": "1977-05-25", ... },
    { "id": 1891, "name": "The Empire Strikes Back", ... },
    { "id": 1892, "name": "Return of the Jedi", ... },
    { "id": 1893, "name": "Star Wars: Episode I - The Phantom Menace", ... },
    // ... through Episode IX
  ]
}
```

#### Search Collections
```
GET https://api.themoviedb.org/3/search/collection?query={franchise_name}
```
**Example:** Searching "Avengers Collection" returns ID 86311 with full MCU grouping.

#### Collection Images
```
GET https://api.themoviedb.org/3/collection/{collection_id}/images
```

#### Collection Translations
```
GET https://api.themoviedb.org/3/collection/{collection_id}/translations
```

**Key Insight:** TMDB Collections represent **official franchise groupings** maintained by TMDB curators. These include:
- "The Lord of the Rings Collection" (ID: 119)
- "Star Wars Collection" (ID: 10)
- "The Avengers Collection" (ID: 86311)
- "Spider-Man Collection" (various Spider-Verse movies)
- "X-Men Series" (all X-Men films grouped)

---

### 1.2 Company (Studio) Endpoints

#### Get Company Details
```
GET https://api.themoviedb.org/3/company/{company_id}
```
**Example (Lucasfilm - ID: 1):**
```json
{
  "description": "",
  "headquarters": "San Francisco, California",
  "homepage": "https://www.lucasfilm.com",
  "id": 1,
  "logo_path": "/o86DbpburjxrqAzEDhXZcyE8pDb.png",
  "name": "Lucasfilm Ltd.",
  "origin_country": "US",
  "parent_company": null
}
```

#### Company Alternative Names
```
GET https://api.themoviedb.org/3/company/{company_id}/alternative_names
```
**Example (Lucasfilm):**
```json
{
  "id": 1,
  "results": [
    { "name": "루카스필름", "type": "" },
    { "name": "Lucasfilm Limited, LLC", "type": "" },
    { "name": "Lucasfilm Ltd. LLC", "type": "" },
    { "name": "Lucasfilm", "type": "" }
  ]
}
```

#### Search Companies
```
GET https://api.themoviedb.org/3/search/company?query={studio_name}
```

**Key Insight:** Company Alternative Names is crucial for matching! It captures:
- Localized names (Korean, Japanese, etc.)
- Former names ("20th Century Fox" → "20th Century Studios")
- Abbreviations ("Warner Bros." → "Warner Brothers")
- Parent/child relationships

---

### 1.3 Discover Endpoint (Powerful Filtering)

The Discover endpoint is the most powerful for finding content:
```
GET https://api.themoviedb.org/3/discover/movie
```

**Key Query Parameters for Studio Enhancement:**

| Parameter | Description |
|-----------|-------------|
| `with_companies` | Filter by production company IDs (comma-separated for AND, pipe-separated for OR) |
| `with_genres` | Filter by genre IDs |
| `with_keywords` | Filter by keyword IDs |
| `with_cast` | Filter by actor IDs |
| `with_crew` | Filter by director/writer/etc. |
| `with_companies` | Can use pipe (`\|`) for OR logic |
| `sort_by` | `popularity.desc`, `vote_average.desc`, `release_date.desc`, etc. |
| `primary_release_date.gte/lte` | Date range filters |
| `vote_count.gte` | Minimum vote threshold |
| `region` | Filter by release region |

**Example:** Find all Marvel Studios movies sorted by popularity:
```
GET /3/discover/movie?with_companies=420&sort_by=popularity.desc
```
(Warner Bros. Pictures = 174, Universal Pictures = 4, etc.)

---

### 1.4 Movie Details Endpoints

#### Get Movie by ID
```
GET https://api.themoviedb.org/3/movie/{movie_id}
```
Returns: title, overview, release_date, runtime, genres, production companies, revenue, etc.

#### Movie Keywords
```
GET https://api.themoviedb.org/3/movie/{movie_id}/keywords
```
**Example Response (Fight Club - ID: 550):**
```json
{
  "id": 550,
  "keywords": [
    { "id": 818, "name": "based on novel or book" },
    { "id": 825, "name": "support group" },
    { "id": 851, "name": "dual identity" },
    { "id": 1541, "name": "nihilism" },
    { "id": 4565, "name": "dystopia" },
    // ... 15 keywords total
  ]
}
```

#### Alternative Titles
```
GET https://api.themoviedb.org/3/movie/{movie_id}/alternative_titles
```
Returns localized titles in different regions (useful for international matching).

#### Production Companies (on movie details)
The `/movie/{movie_id}` endpoint includes `production_companies` array with company IDs and names.

---

### 1.5 Recommendations & Similar Content

#### Movie Recommendations
```
GET https://api.themoviedb.org/3/movie/{movie_id}/recommendations
```
Returns movies recommended based on user viewing patterns (collaborative filtering).

#### Similar Movies
```
GET https://api.themoviedb.org/3/movie/{movie_id}/similar
```
**Description:** "Get the similar movies based on genres and keywords."

**Key Difference:**
- **Recommendations:** Based on TMDB user behavior (what users watched after this)
- **Similar:** Based on content attributes (genres + keywords matching)

#### TV Show Recommendations/Similar
```
GET https://api.themoviedb.org/3/tv/{series_id}/recommendations
GET https://api.themoviedb.org/3/tv/{series_id}/similar
```

---

### 1.6 Keyword Discovery

#### Search Keywords
```
GET https://api.themoviedb.org/3/search/keyword?query={term}
```

#### Get Movies by Keyword
```
GET https://api.themoviedb.org/3/keyword/{keyword_id}/movies
```
Returns paginated list of movies with that keyword.

**Example:** Keyword ID 1701 (Marvel Cinematic Universe) returns all MCU films.

---

### 1.7 Genre Discovery

#### Get Movie Genres
```
GET https://api.themoviedb.org/3/genre/movie/list
```
Returns:
```json
{
  "genres": [
    { "id": 28, "name": "Action" },
    { "id": 12, "name": "Adventure" },
    { "id": 878, "name": "Science Fiction" },
    // ... all 19 genres
  ]
}
```

---

### 1.8 Search Endpoints

| Endpoint | URL Pattern |
|----------|-------------|
| Search Movies | `GET /3/search/movie?query={title}` |
| Search TV | `GET /3/search/tv?query={title}` |
| Search Collections | `GET /3/search/collection?query={franchise}` |
| Search Companies | `GET /3/search/company?query={studio}` |
| Search Keywords | `GET /3/search/keyword?query={term}` |
| Search Multi | `GET /3/search/multi?query={term}` (searches all) |

---

## 2. Other APIs Worth Considering

### 2.1 Trakt API

**Documentation:** https://trakt.docs.apiary.io/

Trakt has strong **lists** functionality:
- User-created lists (watchlist, favorites, custom lists)
- **Official Trakt collections** (what users own/collect)
- **Watchlist** synchronization
- Public lists (popular, trending)

**Relevant Endpoints:**
- `GET /search/movie` - Search with type filtering
- `GET /movies/{id}/related` - Related movies
- `GET /shows/{id}/related` - Related shows
- User lists: `GET /users/{username}/lists`
- List items: `GET /users/{username}/lists/{list_id}/items`

**Strengths:**
- User behavior data (what people watch together)
- Strong TV show database
- Already used by some Emby alternatives (Sonarr/Radarr integrate)

**Weaknesses:**
- Requires OAuth for full access
- Less emphasis on corporate/franchise groupings
- No official "collections" (franchise) concept like TMDB

### 2.2 IMDb Non-Commercial Datasets

**Data Location:** https://datasets.imdbws.com/

IMDb provides bulk data files (updated daily):
- `title.basics.tsv.gz` - Movies/TV with genres, runtime, startYear
- `title.crew.tsv.gz` - Directors, writers
- `title.ratings.tsv.gz` - Ratings and vote counts
- `name.basics.tsv.gz` - People with knownForTitles
- `title.akas.tsv.gz` - Alternative titles by region

**Strengths:**
- Comprehensive, free, updated daily
- Full alternative titles across regions
- No API rate limits

**Weaknesses:**
- Bulk download, not real-time API
- No franchise/collection groupings
- Must process TSV files yourself
- No "Marvel Cinematic Universe" grouping - just individual titles

### 2.3 OMDb API (Open Movie Database)

**Documentation:** https://www.omdbapi.com/

**Endpoints:**
- `GET /?t={title}&apikey={key}` - Search by title
- `GET /?i={imdbid}&apikey={key}` - Search by IMDb ID
- `GET /?s={search}&apikey={key}` - Search returns multiple

**Parameters:**
- `plot=short|full`
- `type=movie|series|episode`
- `y={year}`

**Strengths:**
- Simple, free tier available (1000 requests/day)
- Returns Rotten Tomatoes ratings
- Good for lookups by title

**Weaknesses:**
- No franchise/collection data
- Limited filtering
- Not real-time (data can be stale)

---

## 3. TMDB vs Emby: How TMDB Collections Differ

### TMDB Collections (Franchises)
TMDB maintains **curated franchise groupings** that include:

| Collection | Contents |
|------------|----------|
| Star Wars Collection | Episodes I-IX (all 9 films) |
| The Lord of the Rings Collection | LOTR + Hobbit (6 films) |
| The Avengers Collection | All MCU Avengers films (not all Marvel) |
| Spider-Man Collection | Spider-Man 2002, Spider-Man 2, Spider-Man 3 |
| Batman Collection | Burton, Nolan, and Snyder Batman films separately |
| X-Men Collection | All Fox X-Men films including Deadpool |

**Key TMDB advantage:** Relationships between films that go beyond just studio:
- Marvel Studios produces "Avengers" but "The Avengers Collection" groups Avengers films specifically
- Disney produced both Star Wars and Marvel, but TMDB groups by franchise

### Emby's Studio Metadata
Emby extracts `Studios` from media metadata (typically from file metadata or scanning). This gives:
- "Marvel Studios" → listed as studio on MCU films
- "Walt Disney Pictures" → listed as studio
- "Lucasfilm" → listed as studio

**Emby's limitation:** Studio groupings are:
1. **One-to-many**: A movie has studios; the same studio doesn't mean same franchise
2. **Not hierarchical**: No concept of "Marvel Studios is part of Disney"
3. **Not curated**: A film co-produced by WB and Legendary shows both as studios

### Practical Example: "Marvel Studios" in Emby vs TMDB

| Aspect | Emby | TMDB |
|--------|------|------|
| Groups films by studio | Yes | Yes (`with_companies=420`) |
| Knows MCU is a franchise | No (just studio name) | Yes (Collection ID 86311) |
| Includes Fox Marvel films | Would miss (Fox, not Marvel Studios) | Could include via collection |
| Curated ordering | No | Yes (chronological/canonical) |

---

## 4. Workflow for TMDB Integration

### 4.1 Workflow: Enrich "Studio" Collection with Franchise Data

**Goal:** When user creates "Marvel Studios" collection, also include related Marvel franchise films TMDB knows about but Emby might not tag with "Marvel Studios"

```
1. Get Emby items with "Marvel Studios" as primary studio
2. For each movie, query TMDB for:
   a. Keywords: GET /movie/{id}/keywords
   b. Collection membership: Not directly available, but can:
      - Search collection: GET /search/collection?query=Avengers
3. Expand collection using Discover:
   GET /discover/movie?with_keywords=1701&sort_by=popularity.desc
   (where 1701 = Marvel Cinematic Universe keyword)
4. Cross-reference with Emby library to find matches
```

**Step-by-step:**

```typescript
// 1. Find Marvel Studios movies in Emby
const marvelEmby = allItems.filter(item => 
  item.Studios.some(s => s.Name.toLowerCase().includes('marvel'))
);

// 2. Search TMDB for Marvel-related collections
const mcuCollection = await tmdbSearchCollection('Avengers Collection');
// Returns: { id: 86311, name: "The Avengers Collection" }

// 3. Get the collection to find all parts
const collection = await tmdbGetCollection(86311);
// Returns all MCU Avengers films

// 4. Use Discover with Marvel keyword (1701)
const relatedMovies = await tmdbDiscover({
  with_keywords: 1701, // Marvel Cinematic Universe keyword
  sort_by: 'popularity.desc',
  vote_count_gte: 100
});

// 5. Match TMDB IDs to Emby items
const tmdbIds = new Set(relatedMovies.map(m => m.id));
const expanded = allItems.filter(item => 
  tmdbIds.has(item.tmdbId) // assuming you store TMDB IDs
);
```

### 4.2 Workflow: Expand Studio Grouping with Related Films

**Goal:** Given a studio (e.g., "Warner Bros. Pictures"), find all related franchise films that Emby might not have tagged

```
1. Get studio's TMDB company ID via search
   GET /search/company?query=Warner Bros. Pictures
   Returns: { id: 174, name: "Warner Bros. Pictures" }

2. Get alternative names (handles rebranding)
   GET /company/174/alternative_names
   Returns: Warner Bros., Warner Bros. Pictures, etc.

3. Discover movies by company
   GET /discover/movie?with_companies=174&sort_by=popularity.desc

4. Filter to franchise-related using:
   - Keywords: GET /movie/{id}/keywords
   - Or use known franchise keywords (search: "marvel", "dc comics", etc.)
```

**Critical insight from Company Alternative Names:**
```
Warner Bros. Pictures (ID: 174) has NO alternative names in TMDB
But:
- "New Line Cinema" (ID: 12) - separate company, produced LOTR, Hobbit
- "DC Comics" - not a production company, but movies have "DC Comics" as keyword
```

### 4.3 Workflow: Create Franchise-Aware Collections

**Goal:** Offer users a "Franchise" option in addition to "Studio"

```
1. User selects "Franchise" as collection type
2. User searches TMDB collections: "Lord of the Rings"
3. Alfred queries: GET /search/collection?query=Lord%20of%20the%20Rings
4. Returns collection ID 119
5. Alfred stores collection mapping: Alfred Collection → TMDB Collection ID
6. During sync, Alfred:
   a. Gets collection parts: GET /collection/119
   b. Matches by TMDB ID to Emby items
   c. Adds missing items, removes extras
```

**New Database Schema Addition:**
```sql
ALTER TABLE collections ADD COLUMN tmdb_collection_id INTEGER;
ALTER TABLE collections ADD COLUMN tmdb_company_id INTEGER;
```

### 4.4 TMDB ID Cross-Reference

Alfred needs to store TMDB IDs to efficiently cross-reference. Options:

1. **Store TMDB ID during sync** - add `tmdb_id` to local item cache
2. **Lookup on-demand** - use `/find/{external_id}` endpoint:
   ```
   GET /find/{imdb_id}?external_source=imdb
   ```
   Returns TMDB IDs for movies, TV, people

3. **Build local TMDB ID index** - periodic sync of TMDB IDs for user's library

---

## 5. Rate Limits & API Considerations

**TMDB Rate Limits (as of documentation):**
- 40 requests/10 seconds
- Recommended: ~4 requests/second max
- If exceeded: HTTP 429 response

**Best Practices:**
1. Cache aggressively (TMDB data changes slowly)
2. Use `append_to_response` to batch data (e.g., get keywords + alternative_titles in one call)
3. Store TMDB IDs locally to avoid repeated searches
4. Use `/discover` for bulk operations, not individual `/movie/{id}` calls

---

## 6. Recommended Implementation Approach

### Phase 1: Basic TMDB Lookup
1. Add TMDB API key to settings
2. Implement `/search/company` to match Emby studio names to TMDB IDs
3. Store TMDB company ID in local cache

### Phase 2: Collection Enhancement
1. Add "TMDB Collection" as collection source type
2. Allow user to link Alfred collection to TMDB collection ID
3. During sync, pull collection parts from TMDB

### Phase 3: Intelligent Expansion
1. For studio-based collections, optionally include "related" movies via:
   - TMDB Similar endpoint
   - TMDB Recommendations endpoint
   - Franchise keywords
2. Deduplicate against existing Emby items

### Phase 4: Full Integration
1. Store TMDB IDs for all library items
2. Enable bidirectional sync (what's in TMDB but not in Emby?)
3. Support for "missing from collection" alerts

---

## 7. Quick Reference: TMDB IDs for Major Studios

| Studio | TMDB Company ID |
|--------|---------------|
| Lucasfilm | 1 |
| Warner Bros. Pictures | 174 |
| Universal Pictures | 4 |
| Paramount Pictures | 4? (verify) |
| Sony Pictures | 34? (verify) |
| Walt Disney Pictures | 2? (verify) |
| Marvel Studios | 420 |
| DC Films |  1? (verify) |
| New Line Cinema | 12 |
| DreamWorks | 21 |
| Lionsgate | 35 |
| MGM | 21? |
| 20th Century Fox | 757? |

**Note:** Verify IDs via `GET /search/company?query={name}`

---

## 8. Summary: API Selection

| Capability | TMDB | Trakt | IMDb | OMDb |
|-----------|------|-------|------|------|
| **Franchise/Collection grouping** | ✅ Collections | ❌ Lists only | ❌ | ❌ |
| **Studio/Company search** | ✅ Full | ✅ | ❌ | ❌ |
| **Movie keywords** | ✅ | ❌ | ❌ | ❌ |
| **Similar/Related movies** | ✅ | ✅ | ❌ | ❌ |
| **Genre discovery** | ✅ | ✅ | ✅ (in data) | ✅ |
| **Real-time API** | ✅ | ✅ | ❌ (bulk only) | ✅ |
| **Free tier** | ✅ (with key) | ✅ | ✅ | ✅ (1000/day) |
| **Alternative titles** | ✅ | ❌ | ✅ (bulk) | ❌ |

**Recommendation:** TMDB is the primary API to integrate for franchise/studio enrichment. OMDb can supplement for quick lookups. IMDb data files are useful for bulk processing but not real-time needs.
