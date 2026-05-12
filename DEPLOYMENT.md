# Production Deployment Instructions

Stack: **Fastify API + React frontend + PostgreSQL + SQLite (per-app) → Hetzner VPS + Coolify**

---

## Overview

| What | How |
|------|-----|
| VPS | Hetzner CX22 (2 vCPU, 4 GB RAM) |
| PaaS layer | Coolify (self-hosted, runs on top of Docker) |
| Reverse proxy + HTTPS | Traefik (built into Coolify, auto Let's Encrypt) |
| PostgreSQL | Coolify-managed service (runs on same VPS) |
| SQLite files | Coolify persistent volume (survives redeploys) |
| Auto-deploy | Coolify GitHub webhook (push to `main` → deploy) |

---

## Step 1 — Provision the Hetzner VPS

1. Go to [console.hetzner.cloud](https://console.hetzner.cloud) → New Project → Add Server
2. Choose:
   - **Location**: closest to your users
   - **OS**: Ubuntu 24.04
   - **Type**: CX22 (2 vCPU, 4 GB RAM) — ~€4/month
   - **SSH key**: add your public key
3. Click **Create & Buy**
4. Note the VPS **IP address**

**Docs**: [Hetzner Cloud Getting Started](https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/)

---

## Step 2 — Point Your Domain to the VPS

In your DNS provider, add two A records:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `<VPS IP>` |
| A | `api` | `<VPS IP>` |

This gives you `yourdomain.com` (frontend) and `api.yourdomain.com` (backend).

Wait for DNS to propagate (usually a few minutes, up to 1 hour).

---

## Step 3 — Install Coolify on the VPS

SSH into your VPS:
```bash
ssh root@<VPS IP>
```

Run the Coolify one-line installer:
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

This installs Docker, Docker Compose, and Coolify. Once done, Coolify runs at `http://<VPS IP>:8000`.

Open it in your browser and complete the initial setup (create your admin account).

**Docs**: [Coolify Installation](https://coolify.io/docs/installation)

---

## Step 4 — Connect Your Server to Coolify

In the Coolify dashboard:
1. Go to **Servers** → **Add Server**
2. Choose **Localhost** (since Coolify is on the same server)
3. Verify the connection

**Docs**: [Coolify Server Setup](https://coolify.io/docs/servers/introduction)

---

## Step 5 — Add PostgreSQL in Coolify

1. Go to **Services** → **New Service** → **PostgreSQL**
2. Set a database name (e.g. `my_new_idea`) and a strong password
3. Click **Deploy**
4. Once running, copy the **internal connection string** — it will look like:
   ```
   postgresql://postgres:<password>@<service-name>:5432/my_new_idea
   ```
   You'll use this as `DATABASE_URL` in the next steps.

**Docs**: [Coolify Services](https://coolify.io/docs/services/overview)

---

## Step 6 — Create the Docker Files in Your Repo

You need to add these files to your project before deploying. Ask Claude Code to implement them, or create them manually:

### `api/Dockerfile`
Multi-stage build that compiles TypeScript and runs `node dist/server.js` in production.
- Uses Node 20 Alpine
- Installs pnpm, builds TypeScript, copies only production artifacts to final stage
- Runs DB migrations before starting (`pnpm db:migrate`)
- Exposes port `3000`

### `web/Dockerfile`
Multi-stage build that runs `pnpm build` and serves the static output with Nginx.
- Uses Node 20 Alpine to build, then `nginx:alpine` to serve
- Includes SPA fallback: `try_files $uri /index.html`
- Exposes port `80`

### `web/nginx.conf`
Minimal Nginx config for a React SPA (handles client-side routing).

### `.env.production.example`
Template — commit this but **not** `.env.production`:
```env
DATABASE_URL=postgresql://postgres:PASSWORD@SERVICE_NAME:5432/my_new_idea
ANTHROPIC_API_KEY=
NODE_ENV=production
DATA_DIR=/app/data/apps
FRONTEND_URL=https://yourdomain.com
```

### Code changes also needed:
- **`api/src/db/appDb.ts`**: Change the SQLite data directory to read from `process.env.DATA_DIR` (with fallback to the existing local path)
- **`api/src/server.ts`**: Only use `pino-pretty` when `NODE_ENV !== 'production'` (JSON logs in prod)
- **`api/src/app.ts`**: Restrict CORS `origin` to `process.env.FRONTEND_URL` in production

---

## Step 7 — Deploy the API in Coolify

1. **New Resource** → **Application** → **GitHub** (connect your GitHub account if not done)
2. Select your repository and branch `main`
3. Set **Dockerfile location**: `api/Dockerfile`
4. Set **Domain**: `api.yourdomain.com`
5. Under **Environment Variables**, add:
   ```
   DATABASE_URL=postgresql://postgres:PASSWORD@SERVICE_NAME:5432/my_new_idea
   ANTHROPIC_API_KEY=sk-ant-...
   NODE_ENV=production
   DATA_DIR=/app/data/apps
   FRONTEND_URL=https://yourdomain.com
   ```
6. Under **Persistent Storage / Volumes**, add:
   - **Container path**: `/app/data/apps`
   - **Host path**: `/data/apps` (this is where SQLite files live on the VPS)
7. Click **Deploy**

**Docs**: [Coolify Applications](https://coolify.io/docs/applications/overview) | [Coolify Persistent Storage](https://coolify.io/docs/applications/persistent-storage)

---

## Step 8 — Deploy the Frontend in Coolify

1. **New Resource** → **Application** → **GitHub**
2. Same repo, branch `main`
3. Set **Dockerfile location**: `web/Dockerfile`
4. Set **Domain**: `yourdomain.com`
5. Under **Environment Variables**, add:
   ```
   VITE_API_URL=https://api.yourdomain.com
   ```
6. Click **Deploy**

> **Note**: `VITE_API_URL` is a build-time variable. Coolify needs to pass it during the Docker build, not just at runtime. In Coolify, set it as a **build argument** (not just an env var) — look for "Build Arguments" or "ARG" in the app settings.

**Docs**: [Vite Env Variables](https://vite.dev/guide/env-and-mode)

---

## Step 9 — Run Database Migrations

After the API deploys for the first time, run the Drizzle migrations:

1. In Coolify, open your API application
2. Go to **Terminal** (or exec into the container)
3. Run:
   ```bash
   pnpm --filter api db:migrate
   ```

After the first run, you can automate this by adding it as the first command in your Dockerfile's `CMD`, or as a Coolify pre-deploy hook.

**Docs**: [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)

---

## Step 10 — Enable Auto-Deploy

In Coolify for both applications:
1. Go to the app settings
2. Enable **Auto Deploy** (on push to `main`)
3. Coolify will add a webhook to your GitHub repo automatically

From this point on, `git push origin main` → both apps rebuild and redeploy automatically.

---

## Step 11 — Set Up Backups

SSH into the VPS and set up `rclone` for Hetzner Object Storage:

### Install rclone
```bash
curl https://rclone.org/install.sh | sudo bash
```

### Configure rclone for Hetzner Object Storage
```bash
rclone config
```
Choose `s3` provider, `Other` → enter Hetzner S3 endpoint: `https://fsn1.your-objectstorage.com` (region depends on your bucket location).

**Docs**: [Hetzner Object Storage](https://docs.hetzner.com/storage/object-storage/) | [rclone S3 config](https://rclone.org/s3/)

### Add cron jobs
```bash
sudo crontab -e
```

Add these lines:
```cron
# PostgreSQL backup — daily at 2am
0 2 * * * docker exec $(docker ps -qf "name=coolify-db-postgres") pg_dump -U postgres my_new_idea | gzip > /backups/pg_$(date +\%Y\%m\%d).sql.gz && rclone copy /backups/ hetzner-s3:your-bucket/pg-backups/

# SQLite files backup — every hour
0 * * * * rclone sync /data/apps hetzner-s3:your-bucket/sqlite-backups/
```

Create the backups directory:
```bash
mkdir -p /backups
```

---

## Verification Checklist

- [ ] `https://api.yourdomain.com/` returns `{"root": true}` (health check)
- [ ] `https://yourdomain.com` loads the React app
- [ ] Sign up / log in works (PostgreSQL is reachable)
- [ ] Create a test app → the AI agent runs
- [ ] Run a query on the test app → SQLite file was created at `/data/apps/{appId}.db`
- [ ] Redeploy the API → confirm `/data/apps/` still has the SQLite files (volume persists)
- [ ] Run a manual `rclone sync` → verify files appear in Object Storage

---

## Troubleshooting

**API won't start**: Check `DATABASE_URL` is correct — the service name in Coolify must match exactly.

**SQLite files disappear on redeploy**: Means the volume isn't configured. Double-check the persistent storage settings in Coolify for the API app.

**CORS errors in the browser**: `FRONTEND_URL` env var is missing or wrong in the API app settings.

**Frontend shows blank page / 404 on refresh**: Nginx SPA fallback (`try_files $uri /index.html`) is missing from `web/nginx.conf`.

**Migrations fail**: The `DATABASE_URL` inside the container may need to use the internal Docker network hostname (Coolify service name), not `localhost`.
