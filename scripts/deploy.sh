#!/usr/bin/env bash
# Blue-green deploy for a single-container service (k8s-style rollout):
#   1. pull new image
#   2. start candidate container next to the running old one
#   3. readiness/health check on the candidate
#   4. if healthy -> kill old container, put candidate in its place
#      if not     -> kill candidate, old container keeps running
#
# Usage: deploy.sh <service-name> <image-ref> <port>
#   EXTRA_ARGS env var is appended to `docker run` (e.g. extra -e flags)

set -euo pipefail

NAME="${1:?usage: deploy.sh <name> <image> <port>}"
IMAGE="${2:?usage: deploy.sh <name> <image> <port>}"
PORT="${3:?usage: deploy.sh <name> <image> <port>}"

NETWORK="${NETWORK:-hostmate-net}"
CANDIDATE="${NAME}-next"
HEALTH_PATH="${HEALTH_PATH:-/readyz}"
TRIES="${TRIES:-30}"

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null

echo ">> pulling $IMAGE"
docker pull "$IMAGE"

docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true

echo ">> starting candidate '$CANDIDATE'"
docker run -d \
  --name "$CANDIDATE" \
  --network "$NETWORK" \
  --restart unless-stopped \
  -e PORT="$PORT" \
  ${EXTRA_ARGS:-} \
  "$IMAGE" >/dev/null

echo ">> readiness check: $HEALTH_PATH on :$PORT (max $((TRIES * 2))s)"
healthy=""
for _ in $(seq "$TRIES"); do
  if docker exec "$CANDIDATE" wget -q -O- "http://127.0.0.1:${PORT}${HEALTH_PATH}" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [ -z "$healthy" ]; then
  echo "!! candidate failed readiness check — keeping old container"
  docker logs --tail 50 "$CANDIDATE" 2>/dev/null || true
  docker rm -f "$CANDIDATE" >/dev/null 2>&1 || true
  exit 1
fi

echo ">> candidate healthy — cutting over"
docker rm -f "$NAME" >/dev/null 2>&1 || true   # stop old container, free name + port
docker rm -f "$CANDIDATE" >/dev/null 2>&1      # port bindings can't change at runtime
docker run -d \
  --name "$NAME" \
  --network "$NETWORK" \
  --network-alias "$NAME" \
  --restart unless-stopped \
  -e PORT="$PORT" \
  -p "127.0.0.1:${PORT}:${PORT}" \
  ${EXTRA_ARGS:-} \
  "$IMAGE" >/dev/null

for _ in $(seq 15); do
  if docker exec "$NAME" wget -q -O- "http://127.0.0.1:${PORT}${HEALTH_PATH}" >/dev/null 2>&1; then
    echo ">> deployed: $NAME <- $IMAGE"
    exit 0
  fi
  sleep 1
done

echo "!! $NAME not responding after swap"
docker logs --tail 50 "$NAME" 2>/dev/null || true
exit 1
