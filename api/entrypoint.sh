#!/bin/sh
set -e

node /app/api/dist/migrate.js

exec litestream replicate -exec "node /app/api/dist/server.js" \
  -config /etc/litestream.yml
