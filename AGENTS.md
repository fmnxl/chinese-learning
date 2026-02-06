# Agent Instructions

Development environment and workflow for the Chinese Learning App.

## Dev Shells

```bash
# Frontend (SvelteKit)
nix develop            # Node.js 20
cd sveltekit-app && npm run dev -- --port 8080

# Backend (Litestar)
nix develop .#backend  # Python 3.12 + uv
cd backend && uvicorn app.main:app --reload --port 8100
```

## Project Layout

| Path | Purpose |
|------|---------|
| `sveltekit-app/` | Frontend SvelteKit app |
| `backend/` | Litestar API backend |
| `data/` | ETL output (`radicals.json`) |
| `parse_unihan.py` | ETL script |

## Backend

- **Local DB**: SQLite (`dev.db`) via `sqlite+aiosqlite`
- **Prod DB**: PostgreSQL on vultr VPS
- **Auth**: JWT with bcrypt password hashing
- **Entry**: `app.main:app`

### Running Locally

```bash
cd backend
cp .env.example .env        # First time setup
nix develop ..#backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

### API Routes (no `/api` prefix locally)

- `POST /auth/register` — Register user
- `POST /auth/login` — Get JWT token
- `GET /auth/me` — Current user (requires auth)
- `GET /courses` — List courses

## Deployment

Production: `chinese.fmnxl.xyz`

- **Frontend**: Static build in `~/fmnxl/chinese/`
- **Backend**: systemd service on port 8100, nginx proxies `/api/` → `/`
- **Config**: `~/fmnxl/configuration.nix`
- **Deploy**: `cd ~/fmnxl && nix develop --command deploy`
