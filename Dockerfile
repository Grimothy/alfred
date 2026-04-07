# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src/client ./src/client
COPY src/shared ./src/shared

RUN npm run build:client

# ── Stage 2: Build TypeScript server ─────────────────────────────────────────
FROM node:20-alpine AS server-builder

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY tsconfig.server.json ./
COPY src/server ./src/server
COPY src/shared ./src/shared

RUN npm run build:server

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=client-builder /build/dist/client ./dist/client
COPY --from=server-builder /build/dist/server ./dist/server
COPY --from=server-builder /build/dist/shared ./dist/shared

# Create data directory
RUN mkdir -p /app/data /app/config

ENV NODE_ENV=production
ENV PORT=8099
ENV DB_PATH=/app/data/alfred.db

EXPOSE 8099

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8099/api/health || exit 1

CMD ["node", "dist/server/index.js"]
