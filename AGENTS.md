# AGENTS.md — Alfred Codebase Guide

Alfred is a self-hosted Emby collection manager: Node.js/Express backend + React/Vite
frontend, SQLite via better-sqlite3, containerised in a single Docker image.

---

## Context Hygiene — MANDATORY

**Read `.opencode/context/navigation.md` at the start of every session.**

After making ANY of the following changes, `.opencode/context/navigation.md` MUST be
updated to reflect the change before the session ends:

- Adding, removing, or renaming any route (src/client/App.tsx)
- Adding, removing, or renaming any page component (src/client/pages/)
- Adding, removing, or renaming any shared component (src/client/components/)
- Adding, removing, or renaming any API function or type (src/client/api/index.ts)
- Adding, removing, or renaming any server endpoint (src/server/index.ts or routes/)
- Any change to image URL patterns, authentication flows, or data-fetching conventions
- Any structural change to the DB schema or query layer

**This is not optional.** If in doubt whether something needs updating — update it.
Stale documentation is worse than no documentation. The navigation.md file is the
source of truth for the codebase's public interface.

---

## Project Layout

```
src/server/          Express API, SQLite, Emby client, sync engine
  db/schema.ts       DB init + WAL pragma (run once at boot via initDb())
  db/queries.ts      All typed SQLite access — no raw SQL elsewhere
  emby/client.ts     EmbyClient class + getEmbyClient() singleton factory
  sync/engine.ts     runSync(), previewCollection() — core business logic
  sync/scheduler.ts  node-cron wrapper; call startScheduler() after initDb()
  routes/            One file per resource: settings, collections, sync, library
  index.ts           Express boot: middleware → routes → static → initDb() → listen

src/client/          React 18 + Vite SPA
  api/index.ts       All axios calls, typed return values — no fetch() elsewhere
  App.tsx            BrowserRouter layout + sidebar nav
  components/        Shared UI: Button, Card, Badge, Toggle, CollectionEditor
  pages/             One file per route: Dashboard, Collections, CollectionDetail,
                      Library, History, Settings, Setup
  index.css          CSS custom properties (design tokens) — source of truth for theme
  vite-env.d.ts      *.module.css type declaration

Dockerfile           3-stage: client-builder → server-builder → production
docker-compose.yml   Single service, port 8099, volumes on /app/data + /app/config
```

---

## Commands

```bash
# Development (runs both concurrently; Vite proxies /api → :8099)
npm run dev

# Server only (tsx watch, auto-restarts)
npm run dev:server

# Client only (Vite HMR)
npm run dev:client

# Production build
npm run build           # build:client (Vite) then build:server (tsc)
npm run build:client    # → dist/client/
npm run build:server    # → dist/server/

# Run production build
npm start               # node dist/server/index.js

# Type checking (no emit)
npm run typecheck       # checks src/client + src/shared via tsconfig.json
npx tsc -p tsconfig.server.json --noEmit   # server only

# Docker
docker compose up --build
docker compose up -d    # detached
```

**There is no test framework configured yet.** When adding tests:
- Use **vitest** for unit tests (compatible with the existing Vite setup)
- Place test files alongside source as `*.test.ts` / `*.test.tsx`
- Run a single test file: `npx vitest run src/server/sync/engine.test.ts`
- Run all tests: `npx vitest run`

---

## TypeScript Configuration

Two tsconfigs — keep them in sync:

| File | Scope | Module | Output |
|---|---|---|---|
| `tsconfig.json` | client + shared | ESNext/bundler | noEmit (Vite handles emit) |
| `tsconfig.server.json` | server + shared | CommonJS | `dist/server/` |

- `strict: true` in both — no implicit `any`, no unchecked indexing.
- `skipLibCheck: true` — don't fix errors in node_modules type declarations.
- Path aliases: `@/*` → `src/client/*`, `@shared/*` → `src/shared/*` (client only).
  Server code uses relative imports; do not use `@/` on the server.

---

## Code Style

### General
- **2-space indentation**, single quotes, no semicolons are _not_ enforced by a
  linter yet — match the existing style: **no semicolons on the server** is
  acceptable but the generated code uses them; be consistent within a file.
- Max line length: ~100 characters (soft limit).
- Trailing commas on multiline structures.

### Imports
- Group order (separated by a blank line):
  1. Node built-ins (`path`, `fs`)
  2. Third-party packages (`express`, `axios`, `@tanstack/react-query`)
  3. Internal server modules (`../db/queries`, `../emby/client`)
  4. Internal client modules (`../api`, `../components/Button`)
- No barrel `index.ts` re-exports inside `components/` or `pages/` — import
  directly.
- CSS Modules: import as `styles` — `import styles from './Component.module.css'`

### Types
- Prefer `interface` for object shapes that may be extended; `type` for unions,
  aliases, and utility types.
- Export row types from `db/queries.ts` (`CollectionRow`, `SyncHistoryRow`, etc.)
  and reuse them — don't redeclare equivalent shapes in routes.
- API response types live in `src/client/api/index.ts` — keep them in sync with
  what the server actually returns.
- Avoid `as unknown as X` casts. Use type guards or narrowing.
- `unknown` over `any` for caught errors: `err instanceof Error ? err.message : String(err)`.

### Naming
- Files: `camelCase.ts` for modules, `PascalCase.tsx` for React components,
  `PascalCase.module.css` for CSS Modules.
- React components: PascalCase, one per file.
- DB query functions: verb-first — `getCollections`, `createCollection`,
  `toggleCollection`, `startSyncRecord`.
- Route files: lowercase resource name — `collections.ts`, `settings.ts`.
- CSS Module class names: camelCase — `.navLink`, `.syncBanner`, `.studioRow`.

### React Patterns
- Functional components only. No class components.
- Data fetching exclusively via **TanStack Query** (`useQuery`, `useMutation`).
  Never call API functions directly inside `useEffect`.
- Invalidate query caches in `onSuccess` of mutations:
  `qc.invalidateQueries({ queryKey: ['collections'] })`.
- Poll for sync status: `refetchInterval: 5000` on the `['sync-status']` query.
- Co-locate a page's CSS Module with the page file (`Dashboard.tsx` +
  `Dashboard.module.css` in the same directory).

### Error Handling
- Server route handlers: always return a response — use early `return res.status(N).json(...)`.
- Wrap async route logic in try/catch; return `500` with `{ error: message }`.
- Sync engine: catch per-collection errors internally, store in `CollectionSyncResult.error`,
  and continue — don't abort the whole sync for a single collection failure.
- Client: extract error messages via
  `(err as AxiosError<{ error?: string }>)?.response?.data?.error ?? 'Unknown error'`.

### Database
- All DB access through `src/server/db/queries.ts` — no `db.prepare()` calls in
  route files or the sync engine.
- Use transactions (`db.transaction(fn)`) for any multi-statement write.
- `initDb()` is idempotent — safe to call on every boot.
- SQLite file location is controlled by `DB_PATH` env var, defaults to
  `./data/alfred.db`. The data directory is created automatically.

### Emby Client
- Use `getEmbyClient(host, apiKey)` — it returns a cached singleton and rebuilds
  only when credentials change.
- Call `resetEmbyClient()` whenever settings are saved (already done in the
  settings route).
- All Emby API calls go through `EmbyClient` methods — no raw axios in the sync
  engine or routes.

---

## Design Tokens (CSS)

All colours and sizing live in `:root` in `src/client/index.css`.
Do not hardcode hex values in component CSS files — always use a `var(--*)`.

Key tokens:
```
--bg-primary: #1a1a1f       Dark charcoal background
--bg-card: #2a2a34          Card surfaces
--accent-gold: #c9a84c      Primary accent (butler brass)
--accent-gold-glow: rgba(201,168,76,0.15)
--text-primary: #f0eee8     Body text
--text-muted: #5c5a54       De-emphasised text
--font-display: 'Playfair Display'   Headings only
--font-mono: 'DM Mono'              All other text
```

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Enables static file serving from `dist/client` when `production` |
| `PORT` | `8099` | Express listen port |
| `DB_PATH` | `./data/alfred.db` | SQLite file location |

Settings (Emby host, API key, cron schedule) are stored in SQLite, not env vars.
