#!/bin/sh
# Rolls out one release on the server: backup, pull, migrate, restart, wait until healthy.
# Run from /opt/tienlen (the Deploy workflow does this over SSH):
#   IMAGE_PREFIX=ghcr.io/owner/repo IMAGE_TAG=<commit sha> ./deploy.sh
# Without arguments it redeploys the release recorded in .env.
set -eu
cd "$(dirname "$0")"

set_env() {
  if grep -q "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >>.env
  fi
}

# Record the release in .env, so plain `docker compose` commands (logs, restart) use it too.
if [ -n "${IMAGE_PREFIX:-}" ]; then set_env IMAGE_PREFIX "$IMAGE_PREFIX"; fi
if [ -n "${IMAGE_TAG:-}" ]; then set_env IMAGE_TAG "$IMAGE_TAG"; fi
unset IMAGE_PREFIX IMAGE_TAG

mkdir -p backups

# Migrations are forward-only: keep a dump from just before every release.
if docker compose ps --status running --services | grep -qx postgres; then
  dump="backups/pre-deploy-$(date +%F-%H%M%S).dump"
  echo "Backing up the database to $dump"
  docker compose exec -T postgres pg_dump --format=custom --no-owner -U tienlen tienlen >"$dump"
fi

echo "Pulling images"
docker compose --profile tools pull --quiet

echo "Applying migrations and seed"
docker compose up -d --wait postgres redis
docker compose run --rm migrate

echo "Starting the release"
docker compose up -d --wait --remove-orphans

docker image prune -f >/dev/null
docker compose ps
echo "Deployed $(grep '^IMAGE_TAG=' .env | cut -d= -f2)"
