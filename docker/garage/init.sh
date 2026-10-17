#!/bin/sh
# Prepares the local Garage once it runs (`bun run db:up`, CI): node layout, the `coverband` bucket
# and the development access key from .env.example. Safe to run again.
set -e
cd "$(dirname "$0")/../.."

BUCKET=coverband
KEY_ID=GKc0ffeeb0a7d0000000000001
KEY_SECRET=c0ffeeb0a7d0c0ffeeb0a7d0c0ffeeb0a7d0c0ffeeb0a7d0c0ffeeb0a7d00001

garage() {
  docker compose exec -T -e RUST_LOG=warn garage /garage "$@"
}

node=$(garage status | awk '/NO ROLE ASSIGNED/ { print $1 }')
if [ -n "$node" ]; then
  garage layout assign -z dc1 -c 1G "$node" >/dev/null
  garage layout apply --version 1 >/dev/null
fi
garage bucket info "$BUCKET" >/dev/null 2>&1 || garage bucket create "$BUCKET" >/dev/null
garage key info "$KEY_ID" >/dev/null 2>&1 || garage key import --yes -n coverband-dev "$KEY_ID" "$KEY_SECRET" >/dev/null
garage bucket allow --read --write --owner "$BUCKET" --key "$KEY_ID" >/dev/null
echo "Garage ready: bucket $BUCKET on http://localhost:3900"
