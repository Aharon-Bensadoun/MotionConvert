# MotionConvert

Convert HTML motion design files to MP4 video — **100% local**, no cloud services.

## Architecture

```
apps/web       → Vite + React UI (localhost:5173)
apps/api       → Fastify REST API (localhost:3001)
worker/        → BullMQ consumer (Playwright + FFmpeg)
packages/db    → Prisma + PostgreSQL
packages/shared → Zod schemas, types, presets
packages/converter → Playwright capture + FFmpeg encode
storage/       → Local files (uploads/, outputs/)
```

## Prerequisites (Windows)

| Tool | Purpose | Install |
|------|---------|---------|
| **Node.js 20+** | Runtime | [nodejs.org](https://nodejs.org/) |
| **pnpm** | Monorepo | `npm install -g pnpm` |
| **Docker Desktop** | Postgres 16 + Redis 7 | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **FFmpeg** | MP4 encoding | `winget install Gyan.FFmpeg` or [ffmpeg.org](https://ffmpeg.org/download.html) — must be on PATH |
| **Playwright Chromium** | Headless rendering | `pnpm playwright:install` (after `pnpm install`) |

Install FFmpeg:

```powershell
winget install Gyan.FFmpeg
```

Verify FFmpeg:

```powershell
ffmpeg -version
```

## Quick start

```powershell
# 1. Install dependencies
pnpm install

# 2. Install Playwright Chromium
pnpm playwright:install

# 3. Copy env file
copy .env.example .env

# 4. Start Postgres + Redis
docker compose up -d

# 5. Run database migrations
pnpm db:migrate

# 6. Start API + worker + frontend
pnpm dev
```

Open **http://localhost:5173**, upload an HTML file, choose format/duration, and convert.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start API, worker, and web concurrently |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm test` | Run unit tests across packages |
| `pnpm convert:test` | Integration tests on `html_Motion_examples/` |
| `pnpm storage:clean` | Remove storage files older than 7 days |
| `pnpm playwright:install` | Install Playwright Chromium |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check (DB + Redis) |
| `POST` | `/api/jobs` | Upload HTML + settings (multipart) |
| `GET` | `/api/jobs/:id` | Job status and progress |
| `GET` | `/api/jobs/:id/download` | Download completed MP4 |

### Example: create job

```bash
curl -X POST http://localhost:3001/api/jobs \
  -F "file=@html_Motion_examples/evamedical_motion_design_pub_adaptatif_v3.html" \
  -F 'settings={"preset":"16:9","fps":30,"durationSec":30,"format":"mp4"}'
```

## Conversion pipeline

1. HTML saved to `storage/uploads/{jobId}.html`
2. Job enqueued in BullMQ (Redis)
3. Worker serves HTML via local HTTP server (avoids `file://` CORS issues)
4. Chromium headless shell captures frames under **CDP virtual time**: the page
   clock is frozen before navigation and advanced by exactly `1000/fps` ms per
   frame, so `setTimeout`/`setInterval`, `requestAnimationFrame`, CSS
   animations/transitions and the Web Animations API all progress
   deterministically — frame N always shows the page at exactly `N/fps` seconds
5. FFmpeg encodes frames to H.264 MP4 (no audio in v1)
6. Output written to `storage/outputs/{jobId}.mp4`

## Settings

- **Presets**: 9:16 (1080×1920), 16:9 (1920×1080), 1:1 (1080×1080)
- **FPS**: 24, 30, or 60
- **Duration**: 1–120 seconds (manual — set to match your animation loop)
- **Max upload**: 10 MB

## Test fixtures

Included in `html_Motion_examples/`:

- `evamedical_motion_design_pub_adaptatif_v3.html` — CSS animation, 30s loop (`--duration: 30s`)
- `judayka_spot_mobile_clean_9x16_text_fixed.html` — JS scene timeline, use 9:16 preset

Integration tests use short 3-second samples to keep CI/dev runs fast. For full exports, set duration to match your animation (e.g. 30s for EvaMedical, 45–60s for Judayka).

## Troubleshooting

### FFmpeg not found

Install FFmpeg and ensure `ffmpeg` is available in your terminal PATH. Restart the terminal after installing.

### Playwright Chromium not installed

```powershell
pnpm playwright:install
```

### Database connection refused

Ensure Docker is running and containers are up:

```powershell
docker compose up -d
docker compose ps
```

### Worker not processing jobs / stuck on "Queued"

1. Check the worker terminal — it must stay running alongside the API.
2. If you restarted the app mid-conversion, clear orphaned Redis jobs:
   ```powershell
   pnpm queue:recover
   ```
3. If uploads were created before a storage-path fix, migrate them to the shared folder:
   ```powershell
   pnpm storage:migrate
   ```
4. All services must use the same storage directory: `<repo>/storage/` (not `apps/api/storage`).

Prerequisites (FFmpeg + Chromium) are checked per job; missing FFmpeg marks the job as **Failed** with an explicit message.

### Fonts not loading

External Google Fonts may need network access during capture. The converter waits for `document.fonts.ready` with a generous timeout.

## File structure

```
MotionConvert/
├── apps/
│   ├── api/                 # Fastify REST API
│   └── web/                 # Vite + React frontend
├── packages/
│   ├── converter/           # Playwright + FFmpeg pipeline
│   ├── db/                  # Prisma schema + client
│   └── shared/              # Zod validation, types
├── worker/                  # BullMQ job consumer
├── storage/
│   ├── uploads/             # Uploaded HTML files
│   └── outputs/             # Generated MP4 files
├── html_Motion_examples/    # Test fixtures
├── docker-compose.yml       # Postgres + Redis
└── scripts/
    └── storage-clean.mjs    # Cleanup old files
```

## License

Private / local use.
