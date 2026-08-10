#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="project-d79f9e62-d832-4631-9f6"
SITE_URL="https://veyra-fxrp.web.app"

command -v firebase >/dev/null || {
  echo "FIREBASE_CLI_MISSING" >&2
  exit 1
}

firebase deploy --only hosting:app --project="$PROJECT_ID"

curl --fail --silent --show-error "$SITE_URL/health" | grep -q '"status":"ok"'
curl --fail --silent --show-error "$SITE_URL/" | grep -q 'id="root"'

echo "VEYRA_FIREBASE_HOSTING_LIVE url=$SITE_URL"
