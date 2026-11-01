# syntax=docker/dockerfile:1
# API image. Build from the repository root:
#   docker build -f apps/server/Dockerfile -t tienlen-server .
# The image also runs migrations (`node_modules/.bin/prisma migrate deploy`), the seed and
# `prisma/set-role.ts`, so it keeps the Prisma CLI and tsx.

FROM node:20-bookworm-slim AS base
# Prisma's query engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @tienlen/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @tienlen/shared build && pnpm --filter @tienlen/server build

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/data/uploads
COPY --from=build --chown=node:node /repo /repo
RUN mkdir -p /data/uploads && chown node:node /data/uploads
WORKDIR /repo/apps/server
USER node
EXPOSE 4000
VOLUME ["/data/uploads"]
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
