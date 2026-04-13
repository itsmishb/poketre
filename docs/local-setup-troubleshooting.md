# ローカル開発のつまずき（Docker / migrate / psql が無い）

## 1. `Cannot connect to the Docker daemon`

**原因**: Docker Desktop が起動していない、または未インストール。

**対処**:

- [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/) を入れて起動してから `docker compose up -d`  
- Docker を使わない場合は **Homebrew で PostgreSQL** を入れる:
  ```bash
  brew install postgresql@16
  brew services start postgresql@16
  createuser -s poketre 2>/dev/null || true
  psql postgres -c "CREATE USER poketre WITH PASSWORD 'poketre_dev' SUPERUSER;" 2>/dev/null || true
  psql postgres -c "CREATE DATABASE poketre OWNER poketre;"
  export DATABASE_URL="postgres://poketre:poketre_dev@localhost:5432/poketre?sslmode=disable"
  ```

（既に `postgres` ユーザーがある環境ではコマンドを読み替えてください。）

---

## 2. `migrate: command not found`

**対処 A（推奨・CLI 不要）**: リポジトリの **Node スクリプト**でマイグレーションする。

```bash
cd app/web
export DATABASE_URL="postgres://poketre:poketre_dev@localhost:5432/poketre?sslmode=disable"
npm run db:migrate
```

**対処 B**: `brew install golang-migrate` 後、ルートで `make migrate-up`。

---

## 3. `psql: command not found`

**対処 A（推奨）**: **Node でシード**する（`psql` 不要）。

```bash
cd app/web
export DATABASE_URL="postgres://poketre:poketre_dev@localhost:5432/poketre?sslmode=disable"
npm run db:seed
```

**対処 B**: `brew install libpq && brew link --force libpq` で `psql` を入れる。

---

## 4. 最短フロー（Postgres が localhost で動いている前提）

```bash
cd app/web
npm install
export DATABASE_URL="postgres://poketre:poketre_dev@localhost:5432/poketre?sslmode=disable"
npm run db:migrate
npm run db:seed
echo "DATABASE_URL=$DATABASE_URL" >> .env.local
npm run dev
```

- ヘルス: http://localhost:3000/api/health  
- 登録待ち: http://localhost:3000/staging（シードに `stg_sample_dev_001` あり）

ルートの `make dev-db` は **Docker + migrate + psql** 前提です。上記のように **Postgres だけ先に起動**し、`app/web` の `npm run db:*` を使ってください。
