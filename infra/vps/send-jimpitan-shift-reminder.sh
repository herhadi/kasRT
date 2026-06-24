#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${KASRT_PROJECT_DIR:-/opt/kasrt}"
ENV_FILE="${KASRT_ENV_FILE:-$PROJECT_DIR/backend/.env}"
BACKEND_URL="${KASRT_BACKEND_URL:-http://127.0.0.1:3005}"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "Environment file tidak dapat dibaca: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "CRON_SECRET belum dikonfigurasi" >&2
  exit 1
fi

curl --fail-with-body --silent --show-error --max-time 60 \
  --request POST \
  --header "x-cron-secret: ${CRON_SECRET}" \
  --header "Content-Type: application/json" \
  "${BACKEND_URL%/}/jimpitan/send-shift-reminder"
