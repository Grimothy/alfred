---
source: Web research (Seerr/Overseerr/Radarr/Sonarr official sites)
topic: Media Detail Pages & Request UI Patterns
fetched: 2026-04-10
official_docs:
  - https://docs.seerr.dev/
  - https://www.seerr.dev/
  - https://radarr.video/
  - https://sonarr.tv/
  - https://github.com/seerr-team/seerr
  - https://github.com/sct/overseerr (archived)
---

# Media Request UI Research: Seerr/Overseerr & Radarr/Sonarr

## Overview

**Seerr** (successor to Jellyseerr/Overseerr) is the primary modern open-source media request manager supporting Jellyfin, Plex, and Emby. It integrates with Sonarr (TV) and Radarr (Movies) for automated download management.

---

## 1. Media Detail Page Information

### Poster & Background Images
- **Hero poster**: Large poster image displayed prominently at top
- **Backdrop/background**: Wide cinematic background image (fanart style)
- Multiple image views available (poster, backdrop, banner)

### Metadata Displayed
From Seerr's description: *"Media pages display organized, easy-to-digest information. We show you the information you care about: ratings, the cast and crew, streaming availability, and more."*

### Key Metadata Fields
- **Ratings**: Star ratings (often from TMDB or IMDB)
- **Cast/Crew**: Actor list with photos, director, writer info
- **Streaming availability**: Which platforms have the content
- **Genres**: Genre tags
- **Release dates**: Movie/TV premiere dates
- **Runtime/Episode duration**
- **Status**: Airing/Ended/Upcoming for TV shows
- **Overview/Synopsis**: Plot description

---

## 2. TV Show Season/Episode Structure

### Seerr Season Selection UI
- Users can select **individual seasons** to request
- Select **specific episodes** within a season
- Partial season requests supported

### Radarr/Sonarr UI Patterns
- **Posters view**: Grid of movie/show posters
- **Table view**: List format with sortable columns
- **Overview view**: Dashboard with statistics
- **Collection lists**: Grouped content views

### Season Display Pattern
Typical pattern:
```
[Season 1] ████████░░ 8/10 episodes  ← Progress bar
[Season 2] ░░░░░░░░░ 0/10 episodes
[Season 3] REQUEST BUTTON
```

---

## 3. Request Content UI

### Request Flow (Seerr)
1. Navigate to media detail page
2. View availability status (already in library or not)
3. Click "Request" button
4. For TV: Select specific seasons/episodes
5. For Movies: Single click request
6. Optional: Advanced options (quality profile, destination folder)
7. Submit request

### Advanced Request Options (Seerr)
- Change destination folders
- Select quality profiles
- Override rules for custom request handling

### Request States
- **Available**: Content already in library (no request needed)
- **Pending**: Request submitted, awaiting approval (if moderation enabled)
- **Approved**: Sent to Sonarr/Radarr
- **Downloading**: In download queue
- **Available**: Download complete

---

## 4. Available vs Missing Indicators

### Availability Display
- **Library scan** syncs with Jellyfin/Plex/Emby to show what's already available
- Shows which seasons/episodes are present
- Shows which seasons/episodes are missing

### Visual Indicators
- **Checkmarks/Green**: Available content
- **Progress bars**: Partial availability (e.g., "8/10 episodes")
- **Request button**: Missing content that can be requested
- **Disabled/locked**: Content not available for request (permission denied)

### Sonarr/Radarr Patterns
- **Wanted/Missing** tabs showing content pending download
- **Cutoff not met** indicators for quality issues
- **Missing** episode counts per series

---

## 5. Radarr Movie Details UI

From radarr.video screenshots:
- Movie poster displayed prominently
- Background/fanart image
- **Quality profile** selector
- **Download status** indicators
- **Trailer** playback option
- **Info tabs**: Overview, Cast, Releases, Alternative Titles
- **Movie cast**: With headshots and character names
- **Alternative titles** for international releases

---

## 6. Key UI Components Summary

### Media Card
```
┌─────────────┐
│   [Poster]  │  ← Image (poster/cover)
│             │
│  Title      │  ← Media title
│  Year       │  ← Release year
│  ★★★★☆     │  ← Rating
│  [Available]│  ← Status badge
└─────────────┘
```

### Media Detail Hero
```
┌────────────────────────────────────────────┐
│ [Background Image - Fanart]                │
│                                            │
│ ┌──────┐                                  │
│ │[Post]│  Title (Year)                     │
│ │  er  │  ★★★★☆ (8.5) | Genre | Runtime   │
│ └──────┘  Status: Released                 │
│                                            │
│ [Request Button] [Add to Watchlist]        │
└────────────────────────────────────────────┘
```

### Season Episode Selector
```
Season 1  ✓ Complete (10 episodes)
  ├─ Episode 1 ✓ Available
  ├─ Episode 2 ✓ Available
  └─ Episode 3-10 ☑ Select to Request

Season 2  ○ Not Available (10 episodes)
  └─ All episodes ☑ Select to Request

[Request Selected]
```

---

## 7. Reference Links

- **Seerr Docs**: https://docs.seerr.dev/
- **Seerr GitHub**: https://github.com/seerr-team/seerr
- **Overseerr (archived)**: https://github.com/sct/overseerr
- **Radarr**: https://radarr.video/
- **Sonarr**: https://sonarr.tv/
- **Servarr Wiki**: https://wiki.servarr.com/

---

## 8. Design Pattern Notes for Alfred

### Potential UI Elements to Consider
1. **Availability badge**: "In Library" / "Not in Library" status
2. **Request button**: Prominent CTA for missing content
3. **Season selector**: Expandable season list with episode checkboxes
4. **Progress indicator**: Shows partial season completion
5. **Metadata section**: Ratings, genres, synopsis, cast
6. **Media backdrop**: Background image (fanart) behind details
7. **Quality indicators**: 4K/HDR badges
8. **Streaming availability**: Platform logos/icons

### Request Workflow
1. User browses media → sees "Not in Library"
2. Clicks media → detail page shows full info
3. Selects specific seasons/episodes (for TV)
4. Clicks Request → sent to Sonarr/Radarr
5. Status updates: Pending → Approved → Downloading → Available
