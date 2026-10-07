# Novelova Monorepo

> Production-grade polyglot monorepo featuring **React 19**, **FastAPI**, **Turborepo**, **pnpm workspaces**, and **uv**.

---

## 🏗 Architecture Overview

```
novelova/
├── apps/
│   ├── web/                    # React 19 Frontend (Vite + TypeScript + Tailwind CSS)
│   └── api/                    # FastAPI Backend (Python 3.11+, Pydantic v2, Uvicorn)
├── packages/
│   ├── ui/                     # Shared React component library (@novelova/ui)
│   ├── shared-types/           # Shared TypeScript contracts & schemas (@novelova/shared-types)
│   ├── tsconfig/               # Shared TypeScript configurations (@novelova/tsconfig)
│   ├── eslint-config/          # Shared ESLint configurations (@novelova/eslint-config)
│   └── python-core/            # Shared Python library (novelova-core)
├── .github/
│   └── workflows/ci.yml        # Unified CI pipeline (lint, test, build for JS & Python)
├── .vscode/                    # Editor settings for Python, Ruff, Prettier, ESLint
├── Dockerfile.api              # Container image for FastAPI service
├── Dockerfile.web              # Container image for React Vite service
├── docker-compose.yml          # Multi-container orchestration
├── Makefile                    # Developer CLI commands
├── pnpm-workspace.yaml         # pnpm workspace definition
├── pyproject.toml              # uv workspace & Ruff linter configuration
└── turbo.json                  # Turborepo task pipeline
```

---

## ⚡️ Technology Stack

| Layer                     | Tooling                                                                 | Purpose                                                       |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Orchestration**         | [Turborepo](https://turbo.build/)                                       | High-performance monorepo build system & task runner          |
| **JS/TS Package Manager** | [pnpm](https://pnpm.io/)                                                | Fast, disk-efficient workspace package management             |
| **Python Tooling**        | [uv](https://docs.astral.sh/uv/) + [Ruff](https://docs.astral.sh/ruff/) | Blazing-fast Python package resolution, workspaces, & linting |
| **Frontend**              | React 19 + Vite + Tailwind CSS                                          | Fast development server and bundle optimization               |
| **Backend**               | FastAPI + Pydantic v2                                                   | Modern, typed async Python REST API                           |
| **Design System**         | Lucide Icons + Shared UI                                                | Modular and composable UI primitives                          |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:

- **Node.js** `>= 20`
- **pnpm** `>= 10` (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Python** `>= 3.11`
- **uv** `>= 0.5` (`brew install uv` or `curl -LsSf https://astral.sh/uv/install.sh | sh`)

### 1. Installation

Install all JavaScript/TypeScript dependencies and sync the Python virtual environment:

```bash
make install
```

Or manually:

```bash
pnpm install
uv sync
```

### 2. Environment Setup

Copy the example environment configuration:

```bash
cp .env.example .env
```

### 3. Running Development Servers

Start both the React web application and FastAPI backend concurrently:

```bash
make dev
```

_(or `pnpm dev`)_

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend**: [http://localhost:8000](http://localhost:8000)
- **Interactive OpenAPI Docs**: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)

---

## 🛠 Available Commands

All common workflows are mapped in the root `Makefile` and `package.json`:

| Command                     | Action                                                       |
| --------------------------- | ------------------------------------------------------------ |
| `make dev` / `pnpm dev`     | Run all applications concurrently in hot-reload mode         |
| `make build` / `pnpm build` | Build all frontend apps and shared packages                  |
| `make test`                 | Run tests for both backend (`pytest`) and frontend apps      |
| `make lint`                 | Run linters across JavaScript/TypeScript and Python (`ruff`) |
| `make format`               | Automatically format all code (`prettier` + `ruff`)          |
| `make clean`                | Remove build artifacts, caches, and node_modules             |
| `make docker-up`            | Build and start containerized stack with Docker Compose      |

To run commands for a specific package, use Turborepo filters:

```bash
# Run only web app
pnpm dev --filter novelova-web

# Run only FastAPI backend
pnpm dev --filter novelova-api

# Run Python tests directly
uv run pytest
```

---

## 📦 Shared Packages

### `@novelova/shared-types`

Shared TypeScript data models, API envelopes, and interfaces (`ApiResponse<T>`, `HealthResponse`, `Item`). Keeps frontend contracts aligned with backend schemas.

### `@novelova/ui`

A shared React component library featuring Tailwind-styled primitives:

- `Button`: Multiple variants (`primary`, `secondary`, `outline`, `ghost`, `danger`) and loading states.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- `Badge`: Status badges (`success`, `warning`, `danger`, `outline`).

### `@novelova/tsconfig`

Reusable base, React, and Node `tsconfig.json` definitions used across packages and apps.

### `@novelova/eslint-config`

Shared ESLint flat configuration for TypeScript and React codebases.

### `packages/python-core` (`novelova-core`)

A shared Python package configured via `uv` workspace:

- Structured console logging (`setup_logger`)
- Base Pydantic schemas and mixins (`BaseSchema`, `DateTimeMixin`, `ApiResponse`)
- Standard error classes (`AppError`, `NotFoundError`, `ConflictError`, `ValidationError`)
- Common utilities (e.g., `slugify`)

---

## 🐳 Docker Support

To run the whole stack in isolated containers:

```bash
docker compose up --build
```

- Web service accessible on [http://localhost:3000](http://localhost:3000)
- API service accessible on [http://localhost:8000](http://localhost:8000)

---

## 🔒 Continuous Integration (CI)

The repository includes a GitHub Actions workflow in `.github/workflows/ci.yml` that automatically:

1. Installs Node dependencies via `pnpm` with lockfile verification.
2. Syncs Python dependencies via `uv`.
3. Runs Python linting (`ruff check`) and formatting checks (`ruff format --check`).
4. Executes Python unit and integration tests (`pytest`).
5. Performs TypeScript type checking (`tsc --noEmit`) and builds all apps.
