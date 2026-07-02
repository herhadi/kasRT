#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${KASRT_PROJECT_DIR:-/srv/kasrt/app}"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG_DIR="${DEPLOY_LOG_DIR:-${PROJECT_DIR}/logs/deploy}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/kasrt-wa-gateway-deploy.lock}"
STARTED_AT="$(date +%s)"
HEAD_SHA=""

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-wa-gateway-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

on_error() {
  local exit_code="$1"
  local line_no="$2"
  local failed_command="$3"

  echo "Deployment WA Gateway KasRT gagal di line ${line_no}." >&2
  echo "Command: ${failed_command}" >&2
  echo "Exit code: ${exit_code}" >&2
  exit "$exit_code"
}

trap 'on_error "$?" "$LINENO" "$BASH_COMMAND"' ERR

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Command wajib tidak ditemukan: $1" >&2
    exit 1
  }
}

require_command git
require_command docker
require_command curl
require_command flock

cd "$PROJECT_DIR"

if [[ ! -f docker-compose.vps.yml ]]; then
  echo "docker-compose.vps.yml tidak ditemukan di $PROJECT_DIR" >&2
  exit 1
fi

if [[ ! -f wa-gateway/.env ]]; then
  echo "wa-gateway/.env belum ada. Buat dulu dan isi WA_GATEWAY_SECRET." >&2
  exit 1
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Deployment WA gateway lain sedang berjalan." >&2
  exit 1
fi

echo "Mulai deploy KasRT WA Gateway"
echo "Root: $PROJECT_DIR"
echo "Branch: $BRANCH"
echo "Log: $LOG_FILE"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Repository production tidak bersih. Bersihkan perubahan lokal sebelum deploy." >&2
  git status --short
  exit 1
fi

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
HEAD_SHA="$(git rev-parse --short HEAD)"

COMPOSE_FILE="docker-compose.vps.yml"
SERVICE="kasrt-wa-gateway"

if ! docker compose -f "$COMPOSE_FILE" config --services | grep -Fxq "$SERVICE"; then
  echo "Service ${SERVICE} tidak ditemukan pada ${COMPOSE_FILE}." >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" build "$SERVICE"
docker compose -f "$COMPOSE_FILE" up --detach --no-deps --force-recreate "$SERVICE"

if ! docker compose -f "$COMPOSE_FILE" ps --status running --services | grep -Fxq "$SERVICE"; then
  echo "Container service ${SERVICE} tidak berjalan setelah deploy." >&2
  docker compose -f "$COMPOSE_FILE" ps >&2
  exit 1
fi

for attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:3010/ >/dev/null; then
    finished_at="$(date +%s)"
    echo "Deploy WA Gateway KasRT berhasil. Commit: $HEAD_SHA, durasi: $((finished_at - STARTED_AT))s"
    docker compose -f "$COMPOSE_FILE" ps "$SERVICE"
    exit 0
  fi
  sleep 2
done

echo "Health check WA gateway gagal setelah 60 detik." >&2
docker compose -f "$COMPOSE_FILE" logs --tail=100 "$SERVICE" >&2
exit 1
