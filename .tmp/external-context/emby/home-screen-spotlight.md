---
source: Live research (emby.media/community, dev.emby.media, github.com/soderlund91)
library: Emby Server
package: emby
topic: home-screen-spotlight-featured-content
fetched: 2026-04-08T01:52:00Z
official_docs: https://dev.emby.media/reference/RestAPI.html
---

# Emby Home Screen & Featured/Spotlight Content — Research Summary

## 1. How the Emby Home Screen Works

The Emby home screen is a **per-user, per-client** arrangement of horizontal "sections" (rows).
Each section is essentially a named query against the library. The server stores these as
**DisplayPreferences** and **UserSettings**, keyed by a `DisplayPreferencesId` and `UserId`.

### Default sections (web/Theater clients)
The home screen renders rows driven by well-known section types:
- **Continue Watching** — in-progress items per user
- **Next Up** — next unwatched episode of shows in progress
- **Latest in [Library]** — one row per library (Movies, TV, etc.) showing recently added items
- **Live TV** — if configured
- **My Media** — library tiles / shortcuts at the top
- **Suggestions** — powered by `/Users/{UserId}/Suggestions` endpoint

Users (and admins for all users) can reorder, hide, or add sections via the web UI:
  Dashboard → My Media, or per-client via user profile → Home Screen preferences.

### TV/app clients
Android TV, Apple TV, Roku, Fire TV all render the same section model but with their own
visual treatment. None support a hero/full-width spotlight banner natively.

---

## 2. Built-in Featured Content / Spotlight

**Emby has NO native "Featured Content" or "Spotlight" / hero-banner feature.**

There is no built-in mechanism to pin a specific title to a prominent hero position
(like Netflix's top banner or Plex's "Featured" row). The home screen is strictly
a list of horizontal scroll rows.

The closest built-in tools:
- **Pinning items to top of a library view** — not a home screen feature
- **Collections** — a library can show a "Collections" row on the home screen
- **"My Media"** — library tiles shown at the top of the home screen (not spotlight)

No official Emby plugin in the built-in catalog provides spotlight/hero functionality.

---

## 3. Home Screen Section Customization (API)

### DisplayPreferences API
```
GET  /DisplayPreferences/{Id}?UserId={UserId}
POST /DisplayPreferences/{DisplayPreferencesId}?UserId={UserId}
```
Body: `{ Id, SortBy, SortOrder, CustomPrefs: {object}, Client }`

`CustomPrefs` is a free-form key-value store used by clients to persist home screen
section configuration. The **Home Screen Companion plugin** (see §5) writes section
definitions into this object directly via the Emby SDK.

### UserSettings API
```
GET  /UserSettings/{UserId}
POST /UserSettings/{UserId}
POST /UserSettings/{UserId}/Partial
```
Stores per-user settings as an array of key-value pairs. Clients use this to store
which sections are enabled/disabled and their order.

### Suggestions API
```
GET /Users/{UserId}/Suggestions
```
Returns a list of suggested items for a user (used in the "Suggestions" home row).
No way to curate/override what appears here — it's algorithm-driven.

### Home Screen Section Types (known)
Based on community research and plugin source, sections have a `SectionType` field:
- `librarybuttons` — My Media tiles
- `resume` — Continue Watching
- `nextup` — Next Up  
- `latestmedia` — Latest in [Library]
- `livetv` — Live TV guide
- `activerecordings` — DVR
- Collections rows (added by plugins or manually)

---

## 4. Third-Party Plugins for Home Screen / Spotlight

### ✅ Home Screen Companion (Community Plugin — Active, Jan 2026)
**GitHub**: https://github.com/soderlund91/HomeScreenCompanion  
**Forum**: https://emby.media/community/topic/146080-plugin-home-screen-companion/  
**Latest**: v3.3.1.0 (Apr 1, 2026) — requires Emby Server 4.10.0.8+ (beta)

**What it does:**
- Automatically manages **tags** and **collections** by connecting to external sources
- Creates dedicated **home screen section rows** for any tag or collection
- Supports **home screen sync** — mirror one user's layout to all other users

**Source types:**
| Type | Description |
|------|-------------|
| External List | Trakt.tv or MDBList URLs (trending, popular, user lists) |
| Smart Playlist | Rule-based filter on your own library (genre, rating, codec, etc.) |
| AI List | OpenAI or Gemini generates a list from a natural-language prompt |
| Local Collection | Based on an existing Emby Collection |
| Local Playlist | Based on an existing Emby Playlist |

**Home Screen Section config options:**
| Setting | Options |
|---------|---------|
| Section Type | `Single Collection` (boxset row) or `Dynamic Media` (tag-filtered items) |
| Item Types | Movie, Series, Episode, MusicVideo |
| Custom Title | Override displayed section name |
| Image Type | Default, Primary, Backdrop, Thumb |
| Sort By | Rating, Date Added, Name, Runtime, Release Date, Year, Random |
| Sort Order | Ascending, Descending, Default |
| Scroll Direction | Horizontal, Vertical, Default |
| Target Users | Specific users to apply the section to |

**Scheduling:**
- Annual windows (e.g., Dec 1–31 for "Christmas Movies")
- Weekly (e.g., Fridays only)
- Specific date ranges (one-time events)
- Tags/collections auto-added AND auto-removed when window closes

**Key limitation**: This creates horizontal scroll rows, NOT a hero/spotlight banner.
The visual treatment is the same as any other home screen row.

**Installation**: Drop the `.dll` in Emby plugins folder, restart server.

---

## 5. Emby Premiere Features (relevant to curation)

**Emby Premiere** ($4.99/mo, $54/yr, $119 lifetime) adds:
- Hardware-accelerated transcoding
- DVR recording
- Offline sync / download
- Cover Art plugin (30+ image overlay styles)
- Cinema Intros (trailers before playback — Premiere-only)
- Folder sync / backup
- Smart Home integration

**No content curation, spotlight, or featured-content features are part of Premiere.**
Premiere is focused on playback quality, recording, and device support — not home screen layout.

The **Cover Art plugin** (Premiere) adds visual treatments to posters (3D, HDR badge, 
subtitle overlay, etc.) — relevant to making featured content _look_ distinct, but 
doesn't create spotlight UI.

---

## 6. Cinematic Home Screen / Themes

Emby does NOT have a "Cinematic" home screen mode built-in (unlike Plex which has
a "Cinematic" mode with large backdrop images).

However:
- **Emby Theater** (Premiere feature) — a dedicated TV-focused app with a more 
  cinematic layout; uses backdrop images for the currently-focused item
- **CSS Customization** — the Emby web app supports custom CSS injection 
  (Dashboard → General → Custom CSS). The community forum has extensive CSS 
  theming threads that can achieve cinematic-style visuals
- **WMC UI Beta** — Emby has an in-development new UI (Windows Media Center style)
  with a different visual layout; currently in beta

---

## 7. API Integration Points for Alfred

To build a "featured/spotlight" collection in Alfred that surfaces on the Emby home
screen, the viable approach is:

### Option A: Collections-based row (native, no plugin)
1. Create/update an Emby Collection via `POST /Collections` with selected items
2. The collection will appear in the "Collections" library
3. Users can manually add a "Latest Collections" section to their home screen
4. **Limitation**: Requires manual user action per-user; no automatic home row injection

### Option B: Tags + Home Screen Companion plugin
1. Alfred applies a tag (e.g., `alfred-featured`) to selected items via item update API
2. Home Screen Companion plugin picks up the tag and creates/maintains a home row
3. **Limitation**: Requires the plugin to be installed on the Emby server; Alfred 
   can't directly inject home screen sections without it

### Option C: Direct UserSettings API manipulation
Directly write home screen section definitions via:
```
POST /UserSettings/{UserId}/Partial
```
This is what Home Screen Companion does internally. The exact key format for home
section definitions is undocumented but observed from plugin source code to use
the `CustomPrefs` blob on `DisplayPreferences`.

### Option D: Collections as the "Featured" mechanism
Alfred creates a special Collection (e.g., "✦ Featured This Week") — users see it
in their Collections library and can pin it to their home screen manually.

---

## 8. Key Findings Summary

| Question | Answer |
|----------|--------|
| Built-in spotlight/hero | ❌ None |
| Featured content plugin (official) | ❌ None in official catalog |
| Community plugin for home rows | ✅ Home Screen Companion (v3.3.1.0, Apr 2026) |
| API to manage home screen sections | ✅ `/DisplayPreferences` + `/UserSettings` |
| Emby Premiere curation features | ❌ None — Premiere is playback/recording focused |
| TV client hero banner | ❌ Not available on any client |
| Collections as spotlight proxy | ✅ Viable — creates a browseable "featured" collection |
| Scheduled/seasonal featured content | ✅ Via Home Screen Companion scheduling |

---

## 9. Relevant API Endpoints

```
# Read/write home screen display prefs
GET  /DisplayPreferences/{Id}?UserId={uid}&Client=emby
POST /DisplayPreferences/{DisplayPreferencesId}?UserId={uid}

# Read/write user-level settings (home section order/visibility)
GET  /UserSettings/{UserId}
POST /UserSettings/{UserId}
POST /UserSettings/{UserId}/Partial

# Collections (create featured collections)
GET  /Collections
POST /Collections
POST /Collections/{Id}/Items?Ids={itemIds}
DELETE /Collections/{Id}/Items?Ids={itemIds}

# Tagging items (for Home Screen Companion integration)
POST /Items/{Id}   (ItemUpdateService — update Tags field)

# Suggestions (read-only, algorithm-driven)
GET  /Users/{UserId}/Suggestions
```
