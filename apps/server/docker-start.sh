#!/bin/sh
# Container start for hosts without a separate release step (Render's free plan, render.yaml):
# apply pending migrations and the idempotent seed, then start the API. Only safe with a single
# API instance; with several, run migrations as a one-off job instead (docs/DEPLOYMENT.md).
set -e
node_modules/.bin/prisma migrate deploy
node_modules/.bin/tsx prisma/seed.ts
exec node dist/main.js
