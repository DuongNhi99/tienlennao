# syntax=docker/dockerfile:1
# Web image (Next.js standalone server). Build from the repository root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 -t tienlen-web .
# NEXT_PUBLIC_API_URL is inlined at build time: build one image per public API URL.

FROM node:20-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @tienlen/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ARG BUILD_ID=docker
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    BUILD_ID=$BUILD_ID \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @tienlen/shared build && pnpm --filter @tienlen/web exec next build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# The standalone output mirrors the monorepo layout; static files are copied beside it.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/manifest.webmanifest').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
