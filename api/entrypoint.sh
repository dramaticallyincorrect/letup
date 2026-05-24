#!/bin/sh
set -e

litestream restore -if-replica-exists -config /etc/litestream.yml /app/data/apps

exec litestream replicate -exec "node /app/api/dist/migrate.js && node /app/api/dist/server.js" \
  -config /etc/litestream.yml
