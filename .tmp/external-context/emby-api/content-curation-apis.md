---
source: dev.emby.media (official Emby REST API reference)
library: Emby Server
package: emby-api
topic: content-curation-and-home-screen-apis
fetched: 2026-04-08T01:48:00.000Z
official_docs: https://dev.emby.media/reference/RestAPI.html
swagger_static: http://swagger.emby.media/?staticview=true
---

# Emby API: Content Curation & Presentation Capabilities

A comprehensive reference of all Emby REST API endpoints relevant to content
surfacing, home screen curation, and user-facing presentation — beyond basic
Collections.

---

## 1. Playlists

**Service:** `PlaylistService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/Playlists` | Create a new playlist |
| `GET` | `/Playlists/{Id}/Items` | Get items in a playlist |
| `POST` | `/Playlists/{Id}/Items` | Add items to a playlist |
| `DELETE` | `/Playlists/{Id}/Items` | Remove items from a playlist |
| `POST` | `/Playlists/{Id}/Items/{ItemId}/Move/{NewIndex}` | Reorder items in a playlist |
| `GET` | `/Playlists/{Id}/AddToPlaylistInfo` | Get info for adding to playlist |

**Key distinction from Collections:** Playlists are ordered, playback-oriented
sequences. Collections are unordered groupings. Playlists appear as a
`Playlist` item type in the library and are backed by a virtual folder.

---

## 2. Instant Mixes (Auto-Generated Playlists)

**Service:** `InstantMixService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Items/{Id}/InstantMix` | Auto-mix based on any item |
| `GET` | `/Albums/{Id}/InstantMix` | Auto-mix from an album |
| `GET` | `/Songs/{Id}/InstantMix` | Auto-mix from a song |
| `GET` | `/Artists/InstantMix` | Auto-mix from an artist |
| `GET` | `/Playlists/{Id}/InstantMix` | Auto-mix from a playlist |
| `GET` | `/MusicGenres/{Name}/InstantMix` | Auto-mix from a music genre |
| `GET` | `/AudioBooks/NextUp` | "Next up" queue for audiobooks |

Emby automatically generates a dynamic playlist seeded from the given item,
using genre/mood/artist similarity. This is read-only; Emby computes the mix
server-side.

---

## 3. "Next Up" (Continue Watching / Up Next)

**Service:** `TvShowsService`, `InstantMixService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Shows/NextUp` | Next unplayed episode for each series user is watching |
| `GET` | `/Shows/Upcoming` | Episodes airing soon (Live TV context) |
| `GET` | `/AudioBooks/NextUp` | Next audiobook chapter / book |

**`/Shows/NextUp` parameters of note:**
- `UserId` — per-user watch state
- `SeriesId` — filter to specific series
- `StartIndex`, `Limit` — paginate
- `EnableImages`, `Fields` — response shaping

This is the canonical "Continue Watching" for TV. It returns the first unplayed
episode per active series.

---

## 4. "Latest" Items (Recently Added)

**Service:** `UserLibraryService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Users/{UserId}/Items/Latest` | Recently added items across all or a specific library |

**Parameters of note:**
- `ParentId` — scope to a specific library/folder (e.g., only Movies library)
- `IncludeItemTypes` — filter by type (Movie, Series, etc.)
- `Limit` — max items returned
- `IsPlayed` — filter to unplayed only
- `GroupItems` — group episodes into series

This is the standard "Recently Added" home screen row in Emby clients.

---

## 5. Resume / Continue Watching

**Service:** `ItemsService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Users/{UserId}/Items/Resume` | Items with in-progress playback |

**Parameters:** Full filtering suite including `IncludeItemTypes`, `Limit`,
`MediaTypes`, `IsMovie`, `IsSeries`, `SortBy`, `ParentId`.

Returns items where the user has a non-zero `PlaybackPositionTicks` and has not
marked them fully played.

---

## 6. User Suggestions (Unplayed Recommendations)

**Service:** `SuggestionsService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Users/{UserId}/Suggestions` | Personalized unplayed item suggestions |

Supports the full item filter suite (genres, ratings, item types, sort orders,
etc.). This is Emby's personalized recommendation surface — it draws from
unplayed items and can be filtered/shaped extensively.

---

## 7. Movie Recommendations (Categorized)

**Service:** `MoviesService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Movies/Recommendations` | Returns categorized movie recommendation buckets |

**Parameters:**
- `CategoryLimit` — max number of recommendation categories
- `ItemLimit` — items per category
- `UserId` — attach user watch state
- `ParentId` — scope to library

**Response shape:** Returns `RecommendationDto[]`, each with:
- `Items` — the recommended movies
- `RecommendationType` — the recommendation logic type (enum)
- `BaselineItemName` — the item used as the seed for this category
- `CategoryId` — unique category identifier

`RecommendationType` enum values indicate the recommendation reasoning (e.g.,
similar director, similar genre, etc.).

---

## 8. Similar Items

**Service:** `LibraryService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Items/{Id}/Similar` | Generic similar items for any item |
| `GET` | `/Movies/{Id}/Similar` | Similar movies |
| `GET` | `/Shows/{Id}/Similar` | Similar TV shows |
| `GET` | `/Albums/{Id}/Similar` | Similar albums |
| `GET` | `/Artists/{Id}/Similar` | Similar artists |
| `GET` | `/Trailers/{Id}/Similar` | Similar trailers |

Emby computes similarity server-side based on genre, studio, year, people, etc.

---

## 9. Special Features & Extras

**Service:** `UserLibraryService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Users/{UserId}/Items/{Id}/SpecialFeatures` | Get bonus/special features for a movie |
| `GET` | `/Users/{UserId}/Items/{Id}/LocalTrailers` | Get local trailer files for an item |
| `GET` | `/Users/{UserId}/Items/{Id}/Intros` | Get intro videos to play before main item |
| `GET` | `/Videos/{Id}/AdditionalParts` | Get split-file multi-part video parts |

These surface the "Extras" content (behind-the-scenes, deleted scenes, featurettes,
interviews, shorts, trailers) that Emby auto-discovers from the filesystem.

---

## 10. Theme Media (Ambient UI Content)

**Service:** `LibraryService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Items/{Id}/ThemeMedia` | Get both theme songs and theme videos for an item |
| `GET` | `/Items/{Id}/ThemeSongs` | Get theme/background music tracks |
| `GET` | `/Items/{Id}/ThemeVideos` | Get background video loops |

Theme media plays ambience audio/video in Emby UI backgrounds when browsing
an item. Useful for building cinematic detail pages.

---

## 11. Trailers

**Service:** `TrailersService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Trailers` | Find movies and trailers similar to a given trailer |

Supports same filter suite as Items. Allows building a "Trailers" section.

---

## 12. User Views (Home Screen Library Sections)

**Service:** `UserViewsService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Users/{UserId}/Views` | Get the top-level library views for a user |

**Parameters:**
- `UserId` — required
- `IncludeExternalContent` — whether to include channels, live TV, etc.

This returns the user's configured library sections (Movies, TV Shows, Music,
Photos, etc.) as `BaseItemDto` items with `CollectionType` set. Each view has
a `DisplayPreferencesId` that can be used with the DisplayPreferences API.

**Critical for home screen building:** This is the root of the Emby nav tree.
Each item returned is a virtual folder that can be drilled into with
`/Users/{UserId}/Items?ParentId={viewId}`.

---

## 13. DisplayPreferences (Per-User View Settings)

**Service:** `DisplayPreferencesService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/DisplayPreferences/{Id}` | Get display prefs for an item/view (per user, per client) |
| `POST` | `/DisplayPreferences/{DisplayPreferencesId}` | Update display prefs |
| `GET` | `/UserSettings/{UserId}` | Get all user settings as key-value dictionary |
| `POST` | `/UserSettings/{UserId}` | Update user settings |
| `POST` | `/UserSettings/{UserId}/Partial` | Partially update user settings |

**`DisplayPreferences` object shape:**
```json
{
  "Id": "string",
  "SortBy": "string",
  "CustomPrefs": { "key": "value" },
  "SortOrder": "Ascending | Descending",
  "Client": "string"
}
```

The `CustomPrefs` dictionary is a free-form key-value store **per client**.
Emby's own web client uses this to store home screen section ordering,
which rows are pinned/hidden, scroll positions, view mode (poster/list),
and more.

**`UserSettings`** returns a flat `Dictionary<string, string>` — also a
free-form store. Different Emby clients write their preferences here.

> **Important limitation:** Neither `DisplayPreferences` nor `UserSettings`
> has a typed schema for home screen sections. They're open-ended
> dictionaries. The actual home screen section ordering is client-driven;
> the server just stores and returns whatever the client writes.

---

## 14. Favorites & Ratings (User-Curated Content)

**Service:** `UserLibraryService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/Users/{UserId}/FavoriteItems/{Id}` | Mark item as favorite |
| `DELETE` | `/Users/{UserId}/FavoriteItems/{Id}` | Unmark favorite |
| `POST` | `/Users/{UserId}/Items/{Id}/Rating` | Set user rating |
| `DELETE` | `/Users/{UserId}/Items/{Id}/Rating` | Remove rating |
| `POST` | `/Users/{UserId}/Items/{Id}/HideFromResume` | Hide item from "Resume" row |

Favorites can be queried via `GET /Users/{UserId}/Items?Filters=IsFavorite` to
build a "My Favorites" shelf.

---

## 15. Item Visibility Controls

**Service:** `UserLibraryService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/Items/{Id}/MakePrivate` | Make item private (only visible to owner) |
| `POST` | `/Items/{Id}/MakePublic` | Restore item to public visibility |
| `POST` | `/Items/Access` | Update user-level access to an item |

---

## 16. Critic Reviews

**Service:** `LibraryService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Items/{Id}/CriticReviews` | Get critic review quotes for an item |

Returns review text, source, date, and positive/negative flag.

---

## 17. Items Query (Universal Content Surfacing)

**Service:** `ItemsService`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/Users/{UserId}/Items` | Full query with all filters |
| `GET` | `/Items` | Admin-level full query |

**Key sort options for curation:**
- `SortBy=DateCreated` → Recently Added
- `SortBy=DatePlayed` → Recently Watched
- `SortBy=PlayCount` → Most Played
- `SortBy=CommunityRating` → Highest Rated
- `SortBy=CriticRating` → Critic Favorites
- `SortBy=PremiereDate` → By Release Date
- `SortBy=Random` → Random picks
- `SortBy=Runtime` → By length

**Key boolean item filters:**
- `IsFavorite=true` → Favorites shelf
- `Filters=IsUnplayed` → Unplayed content
- `Filters=IsResumable` → Resume row
- `IsHD=true` → HD content
- `HasTrailer=true` → Items with trailers
- `HasSpecialFeature=true` → Items with extras
- `HasThemeVideo=true` → Items with theme ambience

**`GroupItemsIntoCollections=true`** — hides individual items that belong to a
boxset/collection behind their collection parent.

---

## 18. What Emby Does NOT Expose via API

### ❌ No Native "Hero Banner" / Spotlight API
Emby has no first-class API endpoint for designating a "featured" or "hero
banner" item. There is no `POST /Items/{Id}/Feature` or `/FeaturedContent`
endpoint. Hero/spotlight presentation is entirely a **client-side concern** —
clients choose what to feature (typically the most recently added unwatched
item, or a random high-rated item).

### ❌ No "Pinned" Content API
No endpoint to pin specific items to the top of the home screen. The
`DisplayPreferences.CustomPrefs` dictionary is the only mechanism, and clients
interpret this key-value store themselves.

### ❌ No Dedicated Home Screen Sections API
Emby doesn't serve a "here are your home screen rows" payload. The Emby Web
client assembles sections itself from multiple parallel API calls:
1. `GET /Users/{Id}/Items/Resume` → Continue Watching row
2. `GET /Shows/NextUp` → Next Up row
3. `GET /Users/{Id}/Items/Latest?ParentId={moviesLibraryId}` → Latest Movies
4. `GET /Users/{Id}/Items/Latest?ParentId={tvLibraryId}` → Latest TV
5. etc.

Section ordering and visibility is stored in `CustomPrefs` per client.

### ❌ No "Recommendation Engine" Settings API
The `SuggestionsService` and `MoviesService/Recommendations` are read-only.
There's no API to tune or configure the recommendation algorithm.

---

## 19. Image Types Available for Presentation

`BaseItemDto` exposes these image types via `ImageTags` and `BackdropImageTags`:
- `Primary` — main poster/thumbnail
- `Backdrop` — wide hero/background images (array — multiple supported)
- `Logo` — transparent logo overlay
- `Thumb` — landscape thumbnail
- `Banner` — wide banner strip
- `Art` — clearart
- `Disc` — disc art

Image URL pattern:
```
GET /Items/{Id}/Images/{ImageType}
GET /Items/{Id}/Images/{ImageType}/{ImageIndex}  (for backdrop[0], backdrop[1], etc.)
```

Parameters: `maxWidth`, `maxHeight`, `quality`, `fillWidth`, `fillHeight`,
`tag` (cache-buster), `format`.

---

## 20. Summary: What's Possible for Content Curation in Alfred

| Feature | API Support | Notes |
|---------|-------------|-------|
| Playlists (ordered playback lists) | ✅ Full CRUD | `PlaylistService` |
| "Continue Watching" row | ✅ Read | `/Users/{Id}/Items/Resume` |
| "Next Up" TV row | ✅ Read | `/Shows/NextUp` |
| "Recently Added" row | ✅ Read | `/Users/{Id}/Items/Latest` |
| "Suggested for You" row | ✅ Read | `/Users/{Id}/Suggestions` |
| Movie Recommendation categories | ✅ Read | `/Movies/Recommendations` |
| Similar content shelf | ✅ Read | `/Items/{Id}/Similar` |
| Favorites shelf | ✅ Read+Write | Filter by `IsFavorite` |
| Special Features / Extras | ✅ Read | `/Items/{Id}/SpecialFeatures` |
| Trailers section | ✅ Read | `/Trailers` |
| Instant Mixes (music) | ✅ Read | `InstantMixService` |
| User library views (nav) | ✅ Read | `/Users/{Id}/Views` |
| Display preferences storage | ✅ Read+Write | Free-form `CustomPrefs` dict |
| Hero/spotlight banner | ❌ None | Client must implement |
| Pinned content | ❌ None | Client must implement |
| Home screen section ordering API | ❌ None | Client stores in `CustomPrefs` |
| "Featured" content designation | ❌ None | No server-side concept |
