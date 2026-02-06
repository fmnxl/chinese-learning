# Chinese Backend

Litestar-based API backend for the Chinese Learning App with JWT authentication and PostgreSQL.

## Quick Start

```bash
# Enter dev shell
cd backend
nix develop ..#backend

# Start dev server (SQLite locally)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

## Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Local Dev | Production |
|----------|-----------|------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///./dev.db` | `postgresql+asyncpg://...` |
| `JWT_SECRET` | `change-me-in-production` | Random 64-char hex |
| `IS_ALPHA` | `true` | `true` (free access) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Get JWT token |
| GET | `/auth/me` | Current user (auth required) |
| GET | `/courses` | List courses |
| GET | `/health` | Health check |

## Tech Stack

- **Litestar** — Async ASGI framework with JWT
- **SQLAlchemy 2.0** — Async ORM
- **PostgreSQL** (prod) / **SQLite** (dev)
- **bcrypt** — Password hashing
- **uv2nix** — Nix Python packaging

## Deployment

Production on `chinese.fmnxl.xyz/api/` via NixOS flake in `~/fmnxl`.
