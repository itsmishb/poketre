# Poketre — よく使うコマンド（ルートで実行）
# Docker / migrate / psql が無い場合は docs/local-setup-troubleshooting.md を参照。
# または: cd app/web && npm run db:migrate && npm run db:seed

.PHONY: db-up db-down db-psql migrate-up migrate-down migrate-force seed-dev \
        web-install web-lint web-build dev-db help migrate-up-node seed-dev-node \
        setup-hooks scan-secrets

DATABASE_URL ?= postgres://poketre:poketre_dev@localhost:5432/poketre?sslmode=disable

help:
	@echo ""
	@echo "Poketre — Makefile ターゲット一覧"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  setup-hooks         Git フック（シークレット検出）をセットアップ"
	@echo "  scan-secrets        gitleaks で全履歴をスキャン"
	@echo "  db-up / db-down     Docker Compose（要 Docker Desktop 起動）"
	@echo "  migrate-up          golang-migrate（無ければ Node にフォールバック）"
	@echo "  migrate-down        直前のマイグレーションを1件ロールバック"
	@echo "  seed-dev            psql（無ければ Node にフォールバック）"
	@echo "  migrate-up-node     app/web の npm run db:migrate のみ"
	@echo "  seed-dev-node       app/web の npm run db:seed のみ"
	@echo "  dev-db              db-up + migrate-up + seed-dev"
	@echo "  web-lint            ESLint 実行"
	@echo "  web-build           Next.js ビルド"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "詳細: docs/management-guide.md"

# ─── セキュリティ ────────────────────────────────────────────────────────────

setup-hooks:
	@echo "Git フック（シークレット検出）をセットアップ中..."
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	@if ! command -v gitleaks >/dev/null 2>&1; then \
		echo "[warn] gitleaks が見つかりません。インストールを推奨します:"; \
		echo "         brew install gitleaks"; \
	else \
		echo "  gitleaks: $$(gitleaks version)"; \
	fi
	@echo "セットアップ完了。次のコミットからシークレットが自動検出されます。"

scan-secrets:
	@command -v gitleaks >/dev/null || (echo "gitleaks が必要です: brew install gitleaks"; exit 1)
	gitleaks detect --config .gitleaks.toml --redact --verbose

db-up:
	docker compose up -d

db-down:
	docker compose down

db-psql:
	@command -v psql >/dev/null || (echo "psql がありません: brew install libpq  または  make seed-dev-node"; exit 1)
	psql "$(DATABASE_URL)"

migrate-up:
	@if command -v migrate >/dev/null 2>&1; then \
		migrate -path db/migrations -database "$(DATABASE_URL)" up; \
	else \
		echo "[info] migrate CLI なし → Node で適用 (app/web/scripts/migrate-up.mjs)"; \
		cd app/web && DATABASE_URL="$(DATABASE_URL)" npm run db:migrate; \
	fi

migrate-up-node:
	cd app/web && DATABASE_URL="$(DATABASE_URL)" npm run db:migrate

migrate-down:
	@command -v migrate >/dev/null || (echo "down は golang-migrate が必要です: brew install golang-migrate"; exit 1)
	migrate -path db/migrations -database "$(DATABASE_URL)" down 1

migrate-force:
	@echo "例: migrate -path db/migrations -database \"\$$DATABASE_URL\" force 2"

seed-dev:
	@if command -v psql >/dev/null 2>&1; then \
		psql "$(DATABASE_URL)" -f db/seeds/dev_seed.sql; \
	else \
		echo "[info] psql なし → Node でシード (app/web/scripts/seed-dev.mjs)"; \
		cd app/web && DATABASE_URL="$(DATABASE_URL)" npm run db:seed; \
	fi

seed-dev-node:
	cd app/web && DATABASE_URL="$(DATABASE_URL)" npm run db:seed

web-install:
	cd app/web && npm install

web-lint:
	cd app/web && npm run lint

web-build:
	cd app/web && npm run build

dev-db: db-up migrate-up seed-dev
