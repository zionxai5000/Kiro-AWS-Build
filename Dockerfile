# SeraphimOS Agent Runtime Container
# Multi-stage build: compile TypeScript, then run the Shaar API server
# Build: 2026-05-07v2 — Fix: HTTP server starts immediately for ALB health checks
# Build: 2026-05-05v2 — Aurora persistence layer active
# Build: 2026-05-04 — includes Phase 5 (Learning Engine) + Phase 6 (SME Architecture)

# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Force cache bust for CDK asset hash
ARG BUILD_VERSION=20260507-v2

WORKDIR /app

# Copy root package files for workspace resolution
COPY package.json package-lock.json tsconfig.json ./

# Copy workspace package.json files first (for layer caching)
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
COPY packages/services/package.json packages/services/tsconfig.json packages/services/
COPY packages/drivers/package.json packages/drivers/tsconfig.json packages/drivers/
COPY packages/app/package.json packages/app/tsconfig.json packages/app/

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts

# Copy source code
COPY packages/core/src packages/core/src
COPY packages/services/src packages/services/src
COPY packages/drivers/src packages/drivers/src
COPY packages/app/src packages/app/src

# Build all packages (TypeScript compilation — order matters for project references)
RUN npx tsc --build packages/core/tsconfig.json 2>&1 || true && \
    npx tsc --build packages/drivers/tsconfig.json 2>&1 || true && \
    npx tsc --build packages/app/tsconfig.json 2>&1 || true && \
    npx tsc --build packages/services/tsconfig.json 2>&1 || true && \
    ls packages/core/dist/agent-runtime/runtime.js && \
    ls packages/services/dist/shaar/production-server.js

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    # Playwright Chromium dependencies
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    libwayland-client0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy workspace package.json files
COPY packages/core/package.json packages/core/
COPY packages/services/package.json packages/services/
COPY packages/drivers/package.json packages/drivers/
COPY packages/app/package.json packages/app/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Install Playwright Chromium for Shaar Guardian browser observation
RUN npx playwright install chromium 2>/dev/null || true

# Copy compiled output from builder
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/services/dist packages/services/dist
COPY --from=builder /app/packages/drivers/dist packages/drivers/dist
COPY --from=builder /app/packages/app/dist packages/app/dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
  CMD curl -f http://localhost:3000/health || exit 1

# Run the Shaar API server (production mode)
CMD ["node", "packages/services/dist/shaar/production-server.js"]
