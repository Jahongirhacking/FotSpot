# FotSpot API — and the ffmpeg the video pipeline needs.
#
# ## Why this file exists now
#
# The deployment had no image definition at all: `pnpm start` on whatever host
# happened to have Node. That was fine while nothing outside Node was required.
# It stopped being fine when a clip uploaded by a browser that cannot compress
# had to be transcoded server-side — `VideoTranscoderService` shells out to
# ffmpeg, and a host without it publishes nothing rather than publishing an
# unoptimised original.
#
# ## One image, two roles
#
# The API and the BullMQ worker are the same process today (`main.ts` registers
# the processor), so one image serves both. When transcoding volume justifies a
# separate worker container, it is this image with a different command — the
# split is a deployment change, not a code change.
FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

# Dependencies first, so a source change does not reinstall them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm prisma generate

COPY . .
RUN pnpm build && pnpm prune --prod


FROM node:22-bookworm-slim AS runtime

# The one system dependency. `ffmpeg` brings `ffprobe`, which the transcoder
# uses to read a source's dimensions before choosing a bitrate.
#
# `--no-install-recommends` keeps this to the codecs and not a desktop's worth of
# X11: the difference is roughly 250 MB against well over a gigabyte.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

# Not root. The transcoder writes temporary files and runs a subprocess over
# bytes a stranger uploaded, which is the combination worth containing.
USER node

EXPOSE 3000

# Migrations then boot, matching the existing `start` script.
CMD ["node", "-e", "require('child_process').execSync('npx prisma migrate deploy',{stdio:'inherit'});require('./dist/src/main.js')"]
