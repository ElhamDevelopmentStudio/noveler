.PHONY: help install dev build test lint format clean docker-up docker-down

help:
	@echo "Available commands:"
	@echo "  make install     Install all dependencies for Node and Python workspaces"
	@echo "  make dev         Run both frontend and backend concurrently in dev mode"
	@echo "  make build       Build all frontend and shared packages"
	@echo "  make test        Run all Python and frontend tests"
	@echo "  make lint        Run all linters (ESLint, Ruff)"
	@echo "  make format      Format code with Prettier and Ruff"
	@echo "  make clean       Clean cache and build artifacts"
	@echo "  make docker-up   Start docker-compose services"
	@echo "  make docker-down Stop docker-compose services"

install:
	pnpm install
	uv sync

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test
	uv run pytest

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
