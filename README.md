# Alfred

A self-hosted collection manager for [Emby](https://emby.media). Alfred automatically builds and maintains Emby collections based on rules you define — by studio, genre, tag, content type, or any combination — and keeps them in sync on a schedule.

## Features

- **Rule-based collections** — filter by studio (any, primary-only, or primary/secondary excluding streaming services), genre, tag, and content type
- **Scheduled sync** — cron-based sync with preset schedules or custom cron expressions
- **Manual sync** — trigger a sync on demand from the UI
- **Collection preview** — see exactly which items will be included before committing
- **Sync history** — per-collection results with item counts and error reporting
- **Single container** — React frontend + Express API + SQLite, all in one image

## Requirements

- Docker (and optionally Docker Compose)
- A running Emby server with an API key

## Deployment

### Docker Compose (recommended)

```yaml
services:
  alfred:
    image: ghcr.io/grimothy/alfred:latest
    container_name: alfred
    ports:
      - "8099:8099"
    volumes:
      - /your/data/path:/app/data
    environment:
      - NODE_ENV=production
      - PORT=8099
      - DB_PATH=/app/data/alfred.db
    restart: unless-stopped
```

```bash
docker compose up -d
```

Then open `http://localhost:8099` and complete the setup wizard with your Emby host and API key.

### Docker CLI

```bash
docker run -d \
  --name alfred \
  -p 8099:8099 \
  -v /your/data/path:/app/data \
  -e NODE_ENV=production \
  ghcr.io/grimothy/alfred:latest
```

### Build from source

```bash
git clone https://github.com/Grimothy/alfred.git
cd alfred
npm install
npm run build
npm start
```

## Configuration

All configuration is done through the Settings page in the UI. There are no config files to edit.

| Setting | Description |
|---|---|
| Emby Host | Full URL to your Emby server (e.g. `http://192.168.1.10:8096`) |
| API Key | Emby API key from Dashboard → Advanced → API Keys |
| Sync Schedule | How often to sync collections (preset or custom cron) |
| Sync Enabled | Toggle scheduled sync on/off |

### Environment Variables

These are set at container level and are not configurable at runtime:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8099` | Port the server listens on |
| `DB_PATH` | `/app/data/alfred.db` | Path to the SQLite database file |
| `NODE_ENV` | `production` | Set to `development` to disable static file serving |

## Collections

Collections are built from rules. Each collection can combine studios, genres, and tags to precisely target the content you want.

### Content Type

Filters items before any other rule is evaluated.

| Option | Description |
|---|---|
| All | Movies and TV series |
| Movies Only | Movies only |
| TV Only | TV series only |

### Studios / Networks

Select one or more studios or networks from your Emby library. All selected studios are treated as OR — an item matches if it belongs to any of them.

**Studio matching modes** control which studio credit on an item is checked:

| Mode | Description |
|---|---|
| Any Studio | Item matches if the selected studio appears anywhere in its studio list |
| Primary Only | Item matches only if the selected studio is the **first** (primary) studio listed |
| Primary or Secondary (no streaming) | Item matches if the selected studio is the primary studio, or is the secondary studio and the primary studio is **not** a streaming service (e.g. Netflix, Hulu, Disney+). Useful for co-productions where the physical studio should take precedence |

### Genres

Optional. Select one or more genres — items must match at least one.

Available genres: Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Music, Mystery, Romance, Science Fiction, Thriller, War, Western.

### Tags

Optional. Enter one or more comma-separated tags. Items must have **all** listed tags to match. Useful for targeting originals (e.g. `Netflix Original`).

### Images

Optional custom poster and backdrop images can be uploaded per collection (JPG/PNG). If not set, Emby will use its default artwork.

### Preview

Before saving, use the **Preview** button to see exactly which items the current rules would match — without making any changes to your Emby library.

## Development```bash
# Install dependencies
npm install

# Start both server and client with hot reload
npm run dev

# Type check
npm run typecheck
npx tsc -p tsconfig.server.json --noEmit
```

The Vite dev server proxies `/api` requests to the Express server on port `8099`.

## Tech Stack

- **Frontend** — React 18, Vite, TanStack Query, CSS Modules
- **Backend** — Node.js, Express, better-sqlite3
- **Scheduler** — node-cron
- **Container** — 3-stage Docker build (node:20-alpine)

## License

MIT

## Screenshots

![Dashboard](docs/dashboard.png)
![Collections](docs/collections.png)
![Library](docs/library.png)
![Sync History](docs/history.png)
![Settings](docs/settings.png)
