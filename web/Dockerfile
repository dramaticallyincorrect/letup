FROM node:20-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY web/package.json ./web/
COPY packages/data/package.json ./packages/data/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/data ./packages/data
COPY web ./web

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/web
RUN pnpm run build


FROM nginx:alpine AS runner

COPY --from=builder /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
