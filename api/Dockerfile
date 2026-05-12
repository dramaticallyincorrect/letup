FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY api/package.json ./api/
COPY packages/data/package.json ./packages/data/

RUN pnpm install --frozen-lockfile

COPY packages/data ./packages/data
COPY api/src ./api/src
COPY api/tsconfig.json ./api/
COPY api/drizzle.config.ts ./api/
COPY api/drizzle ./api/drizzle

WORKDIR /app/api
RUN pnpm run build:ts


FROM node:20-alpine AS runner

RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY api/package.json ./api/
COPY packages/data/package.json ./packages/data/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/api/drizzle ./api/drizzle
COPY --from=builder /app/api/drizzle.config.ts ./api/drizzle.config.ts
COPY --from=builder /app/api/src/prompts ./api/dist/prompts

ENV NODE_ENV=production
ENV DATA_DIR=/app/data/apps

EXPOSE 3000

CMD sh -c "cd /app/api && pnpm drizzle-kit migrate --config /app/api/drizzle.config.ts && node /app/api/dist/server.js"
