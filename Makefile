.PHONY: help install dev dev-front dev\:front build test lint format clean docker-up docker-down docker\:prod\:up docker\:prod\:down docker-prod-up docker-prod-down seed seed-user

help:
	@echo "Available commands:"
	@echo "  make install         Install all dependencies for Node and Python workspaces"
	@echo "  make dev             Run both frontend and backend concurrently in dev mode"
	@echo "  make dev:front       Run only the frontend (connects to remote backend)"
	@echo "  make build           Build all frontend and shared packages"
	@echo "  make test            Run all Python and frontend tests"
	@echo "  make lint            Run all linters (ESLint, Ruff)"
	@echo "  make format          Format code with Prettier and Ruff"
	@echo "  make seed            Seed initial admin user into database"
	@echo "  make clean           Clean cache and build artifacts"
	@echo "  make docker-up       Start docker-compose services"
	@echo "  make docker-down     Stop docker-compose services"
	@echo "  make docker:prod:up   Start production docker-compose services in background (-d)"
	@echo "  make docker:prod:down Stop production docker-compose services"

install:
	pnpm install
	uv sync

dev:
	pnpm dev

dev-front dev\:front:
	pnpm dev:front

build:
	pnpm build

test:
	pnpm test
	uv run pytest

seed:
	uv run --directory apps/api python -m app.db.seed

seed-user: seed

lint:
	pnpm lint
	uv run ruff check .

format:
	pnpm format

clean:
	pnpm clean
	rm -rf .venv

docker-up:
	docker compose up --build

docker-down:
	docker compose down

docker-prod-up docker\:prod\:up:
	docker compose -f docker-compose.prod.yml up -d --build

docker-prod-down docker\:prod\:down:
	docker compose -f docker-compose.prod.yml down
