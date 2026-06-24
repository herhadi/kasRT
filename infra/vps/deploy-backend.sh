#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${KASRT_PROJECT_DIR:-/opt/kasrt}"
BRANCH="${DEPLOY_BRANCH:-main}"
LOG_DIR="${DEPLOY_LOG_DIR:-${PROJECT_DIR}/logs/deploy}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/kasrt-deploy.lock}"
STARTED_AT="$(date +%s)"
HEAD_SHA=""

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

on_error() {
  local exit_code="$1"
  local line_no="$2"
  local failed_command="$3"

  echo "Deployment KasRT gagal di line ${line_no}." >&2
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

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Deployment lain sedang berjalan." >&2
  exit 1
fi

echo "Mulai deploy KasRT"
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

docker compose -f docker-compose.vps.yml build kasrt-backend
docker compose -f docker-compose.vps.yml up --detach --no-deps kasrt-backend

for attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:3005/ >/dev/null; then
    finished_at="$(date +%s)"
    echo "Deploy KasRT berhasil. Commit: $HEAD_SHA, durasi: $((finished_at - STARTED_AT))s"
    docker compose -f docker-compose.vps.yml ps
    exit 0
  fi
  sleep 2
done

echo "Health check backend gagal setelah 60 detik." >&2
docker compose -f docker-compose.vps.yml logs --tail=100 kasrt-backend >&2
exit 1
