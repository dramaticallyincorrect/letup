FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY api/package.json ./api/
COPY packages/data/package.json ./packages/data/

RUN pnpm install --frozen-lockfile

COPY packages/data ./packages/data
COPY api/src ./api/src
COPY api/tsconfig.json ./api/
COPY api/drizzle ./api/drizzle

WORKDIR /app/api
RUN pnpm run build:ts && cp -r src/prompts dist/prompts

# Rebuild better-sqlite3 by resolving its exact path in pnpm's virtual store
RUN node -e "\
    const path = require('path'); \
    const { execSync } = require('child_process'); \
    const pkgDir = path.dirname(require.resolve('better-sqlite3/package.json')); \
    console.log('Rebuilding better-sqlite3 at:', pkgDir); \
    execSync('npx --yes node-gyp rebuild', { cwd: pkgDir, stdio: 'inherit' }); \
"

ENV NODE_ENV=production
ENV DATA_DIR=/app/data/apps

EXPOSE 3000

CMD sh -c "node /app/api/dist/migrate.js && node /app/api/dist/server.js"
