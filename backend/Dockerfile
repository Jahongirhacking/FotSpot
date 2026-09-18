FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma

# Diagnostic + Prisma Client generation
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN pnpm prisma generate \
    && echo "=== PRISMA VERSION ===" \
    && pnpm prisma -v \
    && echo "=== OPENSSL VERSION ===" \
    && openssl version \
    && echo "=== PRISMA ENGINES ===" \
    && find /app/node_modules -type f \( -name '*query-engine*' -o -name '*libquery_engine*' \) -print

COPY . .

RUN pnpm build && pnpm prune --prod


FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node

EXPOSE 3000

CMD ["node", "-e", "require('child_process').execSync('npx prisma migrate deploy',{stdio:'inherit'});require('./dist/src/main.js')"]