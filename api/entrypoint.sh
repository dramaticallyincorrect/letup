#!/bin/sh
set -e

if [ -z "$(ls -A /app/data/apps 2>/dev/null)" ]; then
  litestream restore -if-replica-exists -config /etc/litestream.yml /app/data/apps
fi

exec litestream replicate -exec "node /app/api/dist/migrate.js && node /app/api/dist/server.js" \
  -config /etc/litestream.yml
