FROM node:20-slim AS builder

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
RUN pnpm run build:ts


FROM node:20-slim AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/api/node_modules ./api/node_modules
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/api/drizzle ./api/drizzle
COPY --from=builder /app/api/src/prompts ./api/dist/prompts
COPY api/package.json ./api/
COPY pnpm-workspace.yaml package.json ./

ENV NODE_ENV=production
ENV DATA_DIR=/app/data/apps

EXPOSE 3000

CMD sh -c "node /app/api/dist/migrate.js && node /app/api/dist/server.js"
