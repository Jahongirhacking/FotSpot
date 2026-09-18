# ============================================
# FotSpot API
# NestJS + Prisma + BullMQ + FFmpeg
# ============================================

# --------------------------------------------
# 1. Build stage
# --------------------------------------------
FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

# Install dependencies first for better Docker cache usage
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Prisma schema
COPY prisma ./prisma

# Generate Prisma Client for the build environment.
# schema.prisma contains:
# binaryTargets = ["native", "debian-openssl-3.0.x"]
RUN pnpm prisma generate

# Application source
COPY . .

# Build NestJS and remove development dependencies
RUN pnpm build && pnpm prune --prod


# --------------------------------------------
# 2. Runtime stage
# --------------------------------------------
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# FFmpeg is required by the video processing pipeline.
# ffprobe is included with ffmpeg.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy application files from build stage.
# The runtime container uses the non-root `node` user.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

# Run Prisma migrations before starting NestJS.
CMD ["node", "-e", "require('child_process').execSync('npx prisma migrate deploy',{stdio:'inherit'});require('./dist/src/main.js')"]