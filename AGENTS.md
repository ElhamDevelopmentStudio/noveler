# Novelova Monorepo — Agent & Developer Guidelines

This repository is a production-grade polyglot monorepo containing a **React 19** frontend and a **FastAPI** backend with **PostgreSQL**, **APScheduler**, and **shadcn/ui**.

All AI agents and contributors working in this codebase **must** adhere strictly to the conventions and rules detailed below.

---

## 1. Repository Architecture & Tooling

- **JS/TS Monorepo Manager**: Turborepo 2 + `pnpm` (v10).
- **Python Workspace Manager**: `uv` (v0.10+).
- **Workspace Layout**:
  - `apps/web`: React 19 + Vite + Tailwind CSS v4 + shadcn/ui + Axios + SWR.
  - `apps/api`: FastAPI + SQLAlchemy 2.0 Async + PostgreSQL (`asyncpg`) + APScheduler.
  - `packages/ui`: Shared design system primitives.
  - `packages/shared-types`: Shared TypeScript interfaces and contracts (`ApiResponse`, `HealthResponse`, `Item`, etc.).
  - `packages/python-core`: Python package (`novelova-core`) for domain models, logging, and exceptions.
- **Turbo UI Mode**: Always run Turborepo in `stream` mode (`"ui": "stream"` in `turbo.json`) to prevent TUI terminal freezes in non-interactive CLI environments.
- **npm Registry**: Always preserve the mirror configured in `.npmrc` (`https://registry.npmmirror.com/`) for reliable network access.

---

## 2. File & Directory Naming Rules

1. **Strict Kebab-Case**:
   - All files and folders across JS/TS, React, and CSS must strictly use **`kebab-case`** (e.g., `api-client.ts`, `scroll-fade.tsx`, `metrics-grid.tsx`).
   - Exception: `index.tsx` / `index.ts` serves as the entry access point for folders.
2. **Never Create Duplicate API Files**:
   - Do **NOT** create `api.ts`. All HTTP client operations must reside in `api-client.ts` or domain-specific service files in `src/services/` (e.g., `items.ts`, `health.ts`, `scheduler.ts`).

---

## 3. Frontend Architecture & Page Structure (`apps/web`)

### Page Folder Organization
All pages under `apps/web/src/pages/` must follow the route-grouping structure:

```
apps/web/src/pages/
├── (auth)/
│   ├── login/
│   │   ├── index.tsx              <-- Access point of the page
│   │   └── components/            <-- Strictly page-local components
│   │       ├── login-form.tsx
│   │       └── otp-step.tsx
│   └── register/
│       ├── index.tsx
│       └── components/
│           └── register-form.tsx
├── (main)/
│   ├── dashboard/
│   │   ├── index.tsx
│   │   └── components/
│   │       ├── architecture-tabs.tsx
│   │       ├── metrics-grid.tsx
│   │       └── shimmer-preview.tsx
│   ├── items/
│   │   ├── index.tsx
│   │   └── components/
│   │       ├── create-item-dialog.tsx
│   │       ├── items-filter.tsx
│   │       └── items-table.tsx
│   ├── scheduler/
│   │   ├── index.tsx
│   │   └── components/
│   │       ├── jobs-filter.tsx
│   │       └── jobs-table.tsx
│   └── components/
│       ├── index.tsx
│       └── components/
│           ├── dicebear-glass-showcase.tsx
│           ├── popover-command-showcase.tsx
│           ├── radio-tooltip-showcase.tsx
│           ├── resizable-showcase.tsx
│           └── scroll-area-showcase.tsx
└── (system)/
    ├── maintenance/
    │   ├── index.tsx
    │   └── components/
    │       └── health-probe-panel.tsx
    └── not-found/
        ├── index.tsx
        └── components/
            └── not-found-card.tsx
```

- **`index.tsx` Rule**: `index.tsx` is always the exported access point for each page folder.
- **`components/` Rule**: Subcomponents belonging exclusively to a single page must live inside that page's local `components/` directory in kebab-case. Shared global components live in `src/components/ui/` or `src/components/`.
- **Router Modularization**:
  - `src/router/auth.tsx`: Auth route definitions.
  - `src/router/main.tsx`: Main application & system route definitions.
  - `src/router/index.tsx`: Combines routes into `createBrowserRouter`.
  - `src/main.tsx`: Mounts `<AppRouter />` with SWR configuration.

---

## 4. UI, Styling & shadcn Conventions

1. **Tailwind CSS v4 (CSS-First)**:
   - Do **not** create or reintroduce `tailwind.config.js` or `postcss.config.js`.
   - All themes, CSS variables, and design tokens are defined in `src/index.css` via `@theme inline` and `@layer base`.
2. **Form Management**:
   - Strictly use **React Hook Form** with **Zod** (`@hookform/resolvers/zod`).
   - Do **not** use TanStack Form or Formik.
3. **Minimal Shimmer Loading Utility**:
   - Global loading screen must show **only** shimmering text defaulting to `"Loading...."` without spinners, cards, or outer chrome.
   - Provided via `<GlobalLoading text="..." />` using `.shimmer-text` background-clip CSS gradient animation.
4. **Dynamic Scroll-Fade Utility**:
   - Use `<ScrollFade>` (`src/components/ui/scroll-fade.tsx`).
   - **Top fade**: Must only appear once the user starts scrolling down (`scrollTop > 0`).
   - **Bottom fade**: Must only appear if the container content is scrollable and not yet at the bottom.
5. **DiceBear Glass Avatar Fallbacks**:
   - `<AvatarFallback>` in `src/components/ui/avatar.tsx` uses `@dicebear/glass` with deterministic seed resolution and client-side SVG caching via `src/lib/dicebear.ts`.

---

## 5. Network Resilience & Backend Availability

1. **API Base URL**:
   - Always resolve backend target dynamically via `import.meta.env.VITE_API_BASE_URL || "/api/v1"`.
2. **Axios Client**:
   - All HTTP requests go through `src/services/api-client.ts`.
3. **CORS / Backend Down Detection & Under Maintenance Page**:
   - Axios response interceptor intercepts network failures (`ERR_NETWORK`, `Network Error`), browser CORS blocks (`!error.response`), connection aborts, and 502/503/504 status codes.
   - Redirects to `/maintenance` unless `skipMaintenanceRedirect: true` is passed in config.
   - The `/maintenance` page polls `/health` (via `checkHealthStatus`) every 3 seconds.
   - The user remains on the maintenance page until the backend is reachable; once health check returns `status: "ok"` (HTTP 200), it automatically redirects back to `/`.

---

## 6. Backend Architecture (`apps/api`)

1. **FastAPI & Lifespan**:
   - App lifespan manages async table initialization (`init_db`) and background scheduler (`start_scheduler` / `shutdown_scheduler`).
2. **Database Support**:
   - PostgreSQL 16 via async SQLAlchemy 2.0 (`asyncpg`).
   - Automatic SQLite (`aiosqlite`) offline fallback for automated test environments where PostgreSQL isn't running.
3. **APScheduler**:
   - APScheduler in-app job queue executes periodic tasks in the FastAPI event loop.
4. **Domain Exceptions**:
   - Domain errors inherit from `novelova_core.exceptions.AppError` and are mapped to structured JSON responses.

---

## 7. Verification Checklist for Changes

Before committing changes, agents must run and verify:
1. `pnpm check-types` (must pass with 0 TypeScript errors across all packages)
2. `pnpm build` (must successfully compile Vite and shared packages)
3. `uv run pytest` (all backend tests must pass)
