# Novelova Monorepo

> Production-grade polyglot monorepo featuring **React 19**, **Tailwind CSS v4**, **FastAPI**, **PostgreSQL**, **APScheduler**, **Turborepo**, and **uv**.

---

## 🏗 Architecture Overview

```text
novelova/
├── apps/
│   ├── web/                    # React 19 Frontend (Vite + Tailwind v4 + Axios + SWR + React Router v7)
│   │   ├── src/
│   │   │   ├── components/     # Application layout & navigation (Layout.tsx)
│   │   │   ├── pages/          # Modular page views
│   │   │   │   ├── auth/       # LoginPage.tsx, RegisterPage.tsx
│   │   │   │   ├── main/       # DashboardPage.tsx, ItemsPage.tsx, SchedulerPage.tsx
│   │   │   │   └── NotFoundPage.tsx
│   │   │   ├── router/         # Clean route architecture
│   │   │   │   ├── auth.tsx    # Auth route definitions
│   │   │   │   ├── main.tsx    # App route definitions
│   │   │   │   └── index.tsx   # Combined router & RouterProvider
│   │   │   ├── services/       # Typed Axios API services (apiClient, items, health, scheduler)
│   │   │   ├── index.css       # Tailwind CSS v4 CSS-first configuration
│   │   │   └── main.tsx        # Mounts AppRouter wrapped with global SWRConfig
│   │   └── vite.config.ts      # Tailwind v4 plugin + /api reverse proxy
│   └── api/                    # FastAPI Backend (Python 3.11+, SQLAlchemy 2.0 Async, PostgreSQL, APScheduler)
│       ├── app/
│       │   ├── api/v1/         # Endpoints: /health, /items (CRUD), /scheduler/jobs
│       │   ├── core/           # Pydantic Settings & CORS configuration
│       │   ├── db/             # SQLAlchemy 2.0 async session, engine & auto-seeding
│       │   ├── models/         # Database models (ItemModel, JobLogModel)
│       │   ├── scheduler/      # APScheduler AsyncIOScheduler background job manager
│       │   ├── schemas/        # Pydantic validation schemas
│       │   └── main.py         # Application entrypoint & lifespan lifecycle hooks
│       └── tests/              # Pytest suite with async test coverage
├── packages/
│   ├── ui/                     # Shared React component library (@novelova/ui)
│   ├── shared-types/           # Shared TypeScript contracts & schemas (@novelova/shared-types)
│   ├── tsconfig/               # Shared TypeScript configurations (@novelova/tsconfig)
│   ├── eslint-config/          # Shared ESLint configurations (@novelova/eslint-config)
│   └── python-core/            # Shared Python library (novelova-core)
├── .github/workflows/ci.yml    # CI pipeline for linting, testing, and building
├── Dockerfile.api              # Container image for FastAPI service
├── Dockerfile.web              # Multi-stage container image for React service
├── docker-compose.yml          # Multi-service stack: Web, API, PostgreSQL 16, Redis 7
├── Makefile                    # Developer CLI ergonomics
├── pnpm-workspace.yaml         # pnpm workspace definition
├── pyproject.toml              # uv workspace & Ruff configuration
└── turbo.json                  # Turborepo task pipeline
```

---

## ⚡️ Technology Stack

| Layer | Tooling | Purpose |
|---|---|---|
| **Orchestration** | [Turborepo](https://turbo.build/) | Task runner & caching across frontend and backend |
| **JS/TS Manager** | [pnpm](https://pnpm.io/) | Disk-efficient workspace package management |
| **Python Tooling** | [uv](https://docs.astral.sh/uv/) + [Ruff](https://docs.astral.sh/ruff/) | Ultra-fast dependency resolution and linting |
| **Frontend** | React 19 + Tailwind CSS v4 + Vite | Modern, high-performance UI and styling |
| **State & Data Fetching** | Axios + SWR | Robust HTTP interceptors and stale-while-revalidate caching |
| **Routing** | React Router v7 | Modular route architecture (`router/auth.tsx`, `router/main.tsx`, `router/index.tsx`) |
| **Backend** | FastAPI + Pydantic v2 | Modern typed async REST API |
| **Database** | PostgreSQL 16 + SQLAlchemy 2.0 (asyncpg) | Async connection pool, declarative models & migration support |
| **Job Scheduler** | APScheduler | Background interval, cron, and on-demand job execution |

---

## 🚀 Getting Started

### 1. Installation

Install all JavaScript/TypeScript dependencies and sync the Python virtual environment:

```bash
make install
```

Or manually:

```bash
pnpm install
uv sync --all-packages
```

### 2. Environment Setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Key environment settings:
- `VITE_API_BASE_URL`: Base URL used by the Axios client (defaults to `/api/v1` or `http://localhost:8000/api/v1`).
- `DATABASE_URL`: PostgreSQL connection string (`postgresql+asyncpg://postgres:postgres@localhost:5432/novelova`).
- `USE_SQLITE_FALLBACK`: Set to `true` to allow seamless local development without a running PostgreSQL container.

### 3. Development Server

Start both the frontend and backend concurrently:

```bash
make dev
```
*(or `pnpm dev`)*

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend**: [http://localhost:8000](http://localhost:8000)
- **Interactive OpenAPI Docs**: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)

---

## 🐳 Docker Compose Stack

Run the complete multi-service stack (PostgreSQL 16, Redis 7, FastAPI API, React Web) in containers:

```bash
make docker-up
```

- Web App: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000](http://localhost:8000)
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
