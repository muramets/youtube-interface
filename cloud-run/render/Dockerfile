# ─── Stage 1: Build TypeScript ──────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# Re-install without devDependencies for the production image
RUN rm -rf node_modules && npm ci --omit=dev

# ─── Stage 2: Production image ─────────────────────────────────────────
FROM node:20-slim

# Install ffmpeg (static build, ~80 MB)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy compiled JS and production node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Cloud Run injects PORT env var (default 8080 for Jobs, but we don't serve HTTP)
# Cloud Run Jobs execute the CMD and exit when done
CMD ["node", "dist/index.js"]
