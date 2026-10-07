# novelova-api

FastAPI backend service for Novelova.

## Quickstart

Run development server:

```bash
uv run uvicorn app.main:app --reload --port 8000
```

or via monorepo turbo:

```bash
pnpm dev --filter novelova-api
```

## Endpoints

- Interactive Docs: [http://localhost:8000/docs](http://localhost:8000/docs)
- Health Check: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)
- Items API: [http://localhost:8000/api/v1/items](http://localhost:8000/api/v1/items)
