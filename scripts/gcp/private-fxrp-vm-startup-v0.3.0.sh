#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

exec > >(logger -s -t private-fxrp-startup) 2>&1

PROJECT_ID="project-d79f9e62-d832-4631-9f6"
REGISTRY="us-west1-docker.pkg.dev"
TEE_IMAGE="$REGISTRY/$PROJECT_ID/private-fxrp/private-fxrp-tee@sha256:2c494746ccb2d1efe38aa4c1639110473c2d51fbe156b066550a4362971298f7"
PROXY_IMAGE="$REGISTRY/$PROJECT_ID/private-fxrp/private-fxrp-proxy@sha256:794d32fe30a21d06cbebbf01bbef20d67828de9168f61ba44fcb34225460579f"
NGROK_IMAGE="ngrok/ngrok:3.39.10-debian"
RUN_DIR="/run/private-fxrp"

echo "Installing runtime dependencies…"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl docker.io iptables jq python3 redis-server
rm -rf /var/lib/apt/lists/*
systemctl enable --now docker

install -d -m 0700 "$RUN_DIR" "$RUN_DIR/docker"

metadata_token() {
  curl --fail --silent --show-error \
    --connect-timeout 5 --max-time 15 \
    -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" \
    | jq -er '.access_token'
}

ACCESS_TOKEN="$(metadata_token)"

secret() {
  local name="${1:?secret name required}"
  echo "Fetching Secret Manager entry: $name" >&2
  curl --fail --silent --show-error \
    --retry 5 --retry-all-errors --connect-timeout 10 --max-time 30 \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/$name/versions/latest:access" \
    | jq -er '.payload.data' \
    | tr '_-' '/+' \
    | base64 --decode
}

echo "Loading runtime secrets…"
export INDEXER_HOST="$(secret private-fxrp-indexer-host)"
export INDEXER_DATABASE="$(secret private-fxrp-indexer-database)"
export INDEXER_USERNAME="$(secret private-fxrp-indexer-username)"
export INDEXER_PASSWORD="$(secret private-fxrp-indexer-password)"
PROXY_PRIVATE_KEY="$(secret private-fxrp-proxy-key)"
export NGROK_DOMAIN="$(secret private-fxrp-ngrok-domain)"
export NGROK_AUTHTOKEN="$(secret private-fxrp-ngrok-authtoken)"

if [[ "$PROXY_PRIVATE_KEY" =~ ^[0-9A-Fa-f]{64}$ ]]; then
  PROXY_PRIVATE_KEY="0x$PROXY_PRIVATE_KEY"
fi

[[ "$INDEXER_HOST" =~ ^[A-Za-z0-9.-]+$ ]] || {
  echo "Invalid indexer host" >&2
  exit 1
}
[[ "$PROXY_PRIVATE_KEY" =~ ^0x[0-9A-Fa-f]{64}$ ]] || {
  echo "Invalid proxy signing key format" >&2
  exit 1
}
[[ "$NGROK_DOMAIN" =~ ^[A-Za-z0-9.-]+\.ngrok-free\.(app|dev)$ ]] || {
  echo "Invalid ngrok development domain" >&2
  exit 1
}
[[ -n "$NGROK_AUTHTOKEN" && "$NGROK_AUTHTOKEN" != *$'\n'* ]] || {
  echo "Invalid ngrok authtoken" >&2
  exit 1
}

python3 <<'PY'
import json
import os
from pathlib import Path

run_dir = Path("/run/private-fxrp")

def quoted(name: str) -> str:
    value = os.environ[name]
    if not value or "\x00" in value:
        raise SystemExit(f"invalid empty or NUL-containing value: {name}")
    return json.dumps(value)

proxy_config = f'''redis_port = "127.0.0.1:6379"
private_key_variable = "PROXY_PRIVATE_KEY"
initial_signing_policy_offset = 2
signing_policy_fetch_interval = "20s"

chain_id = 114

[db]
host = {quoted("INDEXER_HOST")}
port = 3306
database = {quoted("INDEXER_DATABASE")}
username = {quoted("INDEXER_USERNAME")}
password = {quoted("INDEXER_PASSWORD")}
log_queries = false

[addresses]
flare_systems_manager = "0xA90Db6D10F856799b10ef2A77EBCbF460aC71e52"
relay = "0xa10B672D1c62e5457b17af63d4302add6A99d7dE"
voter_registry = "0x6a0AF07b7972177B176d3D422555cbc98DfDe914"

[ports]
internal = "6663"
external = "6664"

[info_timing]
cycle_internal = "10s"
cycle_queue_response_wait = "2s"

[voting]
proposal_expiration = "12s"
max_pending_request = 10000
'''
(run_dir / "proxy.toml").write_text(proxy_config)

ngrok_config = f'''version: 3
agent:
  authtoken: {quoted("NGROK_AUTHTOKEN")}
endpoints:
  - name: private-fxrp
    url: {quoted("NGROK_DOMAIN")}
    upstream:
      url: http://127.0.0.1:6664
      protocol: http1
'''
(run_dir / "ngrok.yml").write_text(ngrok_config)
PY

printf 'PROXY_PRIVATE_KEY=%s\n' "$PROXY_PRIVATE_KEY" >"$RUN_DIR/proxy.env"
cat >"$RUN_DIR/tee.env" <<'EOF'
MODE=1
SIMULATED_TEE=true
CHAIN_ID=114
CHAIN_URL=https://coston2-api.flare.network/ext/C/rpc
INITIAL_OWNER=0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1
GOVERNANCE_SIGNERS=0xd0C3370EcAE1Ea7b2d4aa1B03673439992692ef1
GOVERNANCE_THRESHOLD=1
PROXY_URL=http://127.0.0.1:6663
EXTENSION_ID=0x000000000000000000000000000000000000000000000000000000000001012b
CONFIG_PORT=5501
SIGN_PORT=7701
EXTENSION_PORT=7702
LOG_LEVEL=INFO
EOF

chown 1001:1001 "$RUN_DIR/proxy.toml"
chmod 0400 "$RUN_DIR/proxy.toml"
chmod 0400 "$RUN_DIR/proxy.env" "$RUN_DIR/tee.env"

unset INDEXER_HOST INDEXER_DATABASE INDEXER_USERNAME INDEXER_PASSWORD
unset PROXY_PRIVATE_KEY NGROK_AUTHTOKEN

echo "Configuring ephemeral Redis…"
systemctl disable --now redis-server.service 2>/dev/null || true
cat >/etc/systemd/system/private-fxrp-redis.service <<'EOF'
[Unit]
Description=Private FXRP ephemeral Redis
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/redis-server --bind 127.0.0.1 --protected-mode yes --port 6379 --save "" --appendonly no
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now private-fxrp-redis.service

echo "Authenticating to Artifact Registry and pulling immutable workloads…"
ACCESS_TOKEN="$(metadata_token)"
printf '%s' "$ACCESS_TOKEN" | docker --config "$RUN_DIR/docker" login \
  -u oauth2accesstoken --password-stdin "https://$REGISTRY"
docker --config "$RUN_DIR/docker" pull "$PROXY_IMAGE"
docker --config "$RUN_DIR/docker" pull "$TEE_IMAGE"
docker pull "$NGROK_IMAGE"

NGROK_UID="$(docker run --rm --entrypoint id "$NGROK_IMAGE" -u)"
NGROK_GID="$(docker run --rm --entrypoint id "$NGROK_IMAGE" -g)"
[[ "$NGROK_UID" =~ ^[0-9]+$ && "$NGROK_GID" =~ ^[0-9]+$ ]] || {
  echo "Unable to resolve ngrok container identity" >&2
  exit 1
}
chown "$NGROK_UID:$NGROK_GID" "$RUN_DIR/ngrok.yml"
chmod 0400 "$RUN_DIR/ngrok.yml"

rm -rf "$RUN_DIR/docker"
unset ACCESS_TOKEN

for container in private-fxrp-ngrok private-fxrp-tee private-fxrp-proxy; do
  docker rm -f "$container" >/dev/null 2>&1 || true
done

# Defense in depth: the custom VPC already denies ingress, and the host also
# drops direct traffic to both proxy ports while preserving loopback access.
for port in 6663 6664; do
  iptables -C INPUT ! -i lo -p tcp --dport "$port" -j DROP 2>/dev/null || \
    iptables -A INPUT ! -i lo -p tcp --dport "$port" -j DROP
done

echo "Starting extension proxy…"
docker run -d \
  --name private-fxrp-proxy \
  --network host \
  --restart unless-stopped \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --env-file "$RUN_DIR/proxy.env" \
  --mount "type=bind,src=$RUN_DIR/proxy.toml,dst=/app/config/config.toml,readonly" \
  "$PROXY_IMAGE"

for _ in $(seq 1 60); do
  if curl --fail --silent --output /dev/null http://127.0.0.1:6663/healthy; then
    break
  fi
  sleep 2
done
curl --fail --silent --output /dev/null http://127.0.0.1:6663/healthy

echo "Starting Private FXRP TEE node…"
docker run -d \
  --name private-fxrp-tee \
  --network host \
  --restart unless-stopped \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --env-file "$RUN_DIR/tee.env" \
  "$TEE_IMAGE"

sleep 5
[[ "$(docker inspect --format '{{.State.Running}}' private-fxrp-tee)" == "true" ]]

for _ in $(seq 1 60); do
  if curl --fail --silent --output /dev/null http://127.0.0.1:6664/info; then
    break
  fi
  sleep 2
done
curl --fail --silent --output /dev/null http://127.0.0.1:6664/info

echo "Starting stable ngrok callback endpoint…"
docker run -d \
  --name private-fxrp-ngrok \
  --network host \
  --restart unless-stopped \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --mount "type=bind,src=$RUN_DIR/ngrok.yml,dst=/etc/ngrok.yml,readonly" \
  -e NGROK_CONFIG=/etc/ngrok.yml \
  "$NGROK_IMAGE" start private-fxrp

for _ in $(seq 1 60); do
  if curl --fail --silent --output /dev/null \
    -H 'ngrok-skip-browser-warning: 1' \
    "https://$NGROK_DOMAIN/info"; then
    break
  fi
  sleep 2
done
curl --fail --silent --output /dev/null \
  -H 'ngrok-skip-browser-warning: 1' \
  "https://$NGROK_DOMAIN/info"

install -d -m 0755 /var/lib/private-fxrp
date -u +%FT%TZ >/var/lib/private-fxrp/ready
echo "PRIVATE_FXRP_VM_READY"
