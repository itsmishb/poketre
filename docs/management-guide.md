# Poketre 管理設計ガイド

> 作成日: 2026-04-15
> 今回のGemini APIキー漏洩インシデント（2026-04-15）を踏まえて策定。

---

## 目次

1. [シークレット管理](#1-シークレット管理)
2. [開発フロー](#2-開発フロー)
3. [データベース管理](#3-データベース管理)
4. [インフラ管理（GCP）](#4-インフラ管理gcp)
5. [モニタリング・アラート](#5-モニタリングアラート)
6. [インシデント対応](#6-インシデント対応)
7. [リリース管理](#7-リリース管理)

---

## 1. シークレット管理

### 1.1 シークレット管理の原則

| 原則 | 詳細 |
|------|------|
| **コードに書かない** | APIキー・パスワードはソースコードに一切書かない |
| **環境ごとに分離** | ローカル / Vercel / Cloud Run で別々に設定 |
| **最小権限** | 各キーは必要なスコープのみに制限 |
| **定期ローテーション** | 3ヶ月ごとにキーを更新 |
| **漏洩を前提に設計** | 漏洩時に即時無効化できる体制を常に維持 |

### 1.2 環境変数の管理場所

```
ローカル開発: app/web/.env.local（.gitignore 済み）
Vercel本番:   Vercel Dashboard → Settings → Environment Variables
Cloud Run:    GCP Console → Cloud Run → サービス → 変数とシークレット
Cloud Tasks Worker: 同上（OCR_WORKER_SHARED_SECRET など）
```

### 1.3 シークレットスキャンの設定

#### pre-commit フック（ローカル）

```bash
# 初回セットアップ（リポジトリクローン後に必ず実行）
make setup-hooks

# 手動スキャン
make scan-secrets
```

#### CI（GitHub Actions）

- すべての push / PR で `gitleaks` が自動実行
- シークレットが検出された場合: コミット・マージをブロック
- 設定: `.gitleaks.toml`

### 1.4 GCPシークレットの一覧と管理

| シークレット | 保管場所 | ローテーション周期 |
|-------------|---------|----------------|
| Gemini API Key | Vertex AI（使用のため不要）または Vertex AI連携 | — |
| GCS Service Account | Vercel / Cloud Run 環境変数 | 6ヶ月 |
| Cloud SQL パスワード | Vercel 環境変数 (DATABASE_URL) | 3ヶ月 |
| OCR Worker Shared Secret | Vercel + Cloud Run 環境変数 | 3ヶ月 |
| Supabase Anon Key | Vercel 環境変数 | 必要時 |

> **推奨**: GCP Secret Manager を使用してシークレットを一元管理する。
> `GCP Console → Security → Secret Manager`

---

## 2. 開発フロー

### 2.1 ブランチ戦略

```
main          ─── 本番環境（常にデプロイ可能）
  └── develop ─── 開発統合ブランチ（任意）
        ├── feature/xxx   ─── 機能開発
        ├── fix/xxx       ─── バグ修正
        └── hotfix/xxx    ─── 緊急修正（mainから直接ブランチ）
```

#### ルール

- `main` への直接コミット禁止（PRのみ）
- `hotfix/` は main から切って、main + develop 両方にマージ
- feature ブランチは完成後に削除

### 2.2 コミットメッセージ規約

```
<type>(<scope>): <subject>

type:
  feat     — 新機能
  fix      — バグ修正
  hotfix   — 緊急バグ修正（本番影響あり）
  docs     — ドキュメントのみ
  chore    — ビルド・CI・依存関係
  refactor — リファクタリング（動作変更なし）
  security — セキュリティ修正

例:
  feat(ocr): add TCGdex card lookup in pipeline
  fix(staging): remove hp column from INSERT
  security(api): use timingSafeEqual for worker auth
  hotfix(db): fix missing column causing 500 errors
```

### 2.3 PRチェックリスト

PR作成時に確認すること:

- [ ] `make scan-secrets` を実行して漏洩がないか確認
- [ ] TypeScript 型エラーがないか（`npx tsc --noEmit`）
- [ ] ESLint 警告がないか（`npm run lint`）
- [ ] DB スキーマを変更した場合、マイグレーションの up/down が両方ある
- [ ] 環境変数を追加した場合、`.env.local.example` に追加した
- [ ] 新しいAPIエンドポイントに認証がある（`requireOperatorOrAdminUser`）

### 2.4 ローカル開発セットアップ

```bash
# 1. リポジトリクローン後
make setup-hooks        # シークレット検出フック（必須）
cp app/web/.env.local.example app/web/.env.local
# .env.local に実際の値を設定

# 2. DB起動
make dev-db             # Docker + migrate + seed

# 3. Next.js 起動
cd app/web && npm run dev
```

---

## 3. データベース管理

### 3.1 マイグレーション規約

```
db/migrations/
  NNNNNN_description.up.sql   ← 適用（必ず BEGIN/COMMIT で囲む）
  NNNNNN_description.down.sql ← ロールバック（必ず BEGIN/COMMIT で囲む）

NNNNNN: 6桁連番（例: 000007）
```

#### テンプレート

```sql
-- NNNNNN_description.up.sql
BEGIN;

ALTER TABLE example ADD COLUMN new_col TEXT;

COMMIT;
```

```sql
-- NNNNNN_description.down.sql
BEGIN;

ALTER TABLE example DROP COLUMN IF EXISTS new_col;

COMMIT;
```

### 3.2 マイグレーション実行

```bash
# 本番（Cloud SQL）
make migrate-up DATABASE_URL="postgres://user:pass@host:5432/poketre"

# ローカル（Docker）
make migrate-up   # デフォルト: poketre_dev@localhost

# ロールバック（1件）
make migrate-down DATABASE_URL="..."
```

### 3.3 バックアップ

| タイミング | 方法 |
|-----------|------|
| 日次 | Cloud SQL 自動バックアップ（保持30日）|
| マイグレーション前 | 手動スナップショット |
| 月次 | pg_dump でエクスポートしてGCSに保存 |

```bash
# 手動バックアップ（pg_dump）
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d).sql
gsutil cp backup_*.sql gs://poketre-backups/db/
```

### 3.4 スキーマ変更のルール

- **カラム削除は2段階**:
  1. アプリコードで参照を削除（デプロイ）
  2. DBマイグレーションでカラム削除（次のデプロイ）
- **NOT NULL追加は3段階**:
  1. NULLABLEで追加 → デフォルト値でバックフィル → NOT NULL制約追加
- **大規模データ変更**（100万行以上）はメンテナンスウィンドウを設けて実施

---

## 4. インフラ管理（GCP）

### 4.1 GCPリソース一覧

| リソース | 名前 | 用途 |
|---------|------|------|
| GCS Bucket | `$GCS_BUCKET` | OCRアップロード画像の一時保存 |
| Cloud Tasks Queue | `poketre-ocr-queue` | OCRジョブのキューイング |
| Cloud Run Service | Vercel + `/api/ocr/process-job` | OCRワーカー |
| Cloud SQL | Poketre PostgreSQL | メインDB |
| Vertex AI | gemini-2.5-flash | OCR・説明文生成 |

### 4.2 GCSライフサイクル設定

OCRアップロード画像は処理後に不要なため、自動削除を設定:

```bash
# 30日後に自動削除するルールを設定
cat > /tmp/lifecycle.json << 'EOF'
{
  "lifecycle": {
    "rule": [{
      "action": {"type": "Delete"},
      "condition": {
        "age": 30,
        "matchesPrefix": ["ocr-uploads/"]
      }
    }]
  }
}
EOF

gsutil lifecycle set /tmp/lifecycle.json gs://$GCS_BUCKET
```

### 4.3 コスト管理

| サービス | 目安（10,000枚/月） | アラート閾値 |
|---------|-------------------|------------|
| Vertex AI (Gemini) | ~$6 | $10 |
| GCS | ~$0.5 | $2 |
| Cloud Tasks | ~$0.4 | $1 |
| Cloud SQL | ~$7 | $15 |
| **合計** | **~$14** | **$25** |

```bash
# GCP 予算アラートの設定
# GCP Console → Billing → Budgets & alerts → Create budget
# 閾値: $25/月、アラート: 50% / 90% / 100%
```

### 4.4 サービスアカウント権限（最小権限の原則）

| サービスアカウント | 必要なロール |
|-----------------|------------|
| Vercel (Next.js) | `storage.objectAdmin` (GCS) + `cloudtasks.enqueuer` |
| Cloud Run Worker | `storage.objectViewer` (GCS) + `aiplatform.user` (Vertex) |
| Cloud SQL Proxy | `cloudsql.client` |

---

## 5. モニタリング・アラート

### 5.1 現在のモニタリング状況

| 項目 | 状態 | 推奨ツール |
|-----|------|---------|
| OCRジョブ成功率 | DB確認のみ | GCP Monitoring ダッシュボード |
| APIレスポンス時間 | なし | Vercel Analytics |
| エラー率 | なし | Sentry または GCP Error Reporting |
| コスト | 手動確認 | GCP Budget Alert |

### 5.2 推奨モニタリング設定（優先順）

#### ① GCP Error Reporting（無料枠あり）

```bash
# Cloud Run / Cloud Tasks のエラーを自動収集
# GCP Console → Error Reporting → 自動有効化
```

#### ② OCRジョブ失敗アラート

```sql
-- 失敗率が10%を超えた場合に通知するクエリ
SELECT
  batch_id,
  COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'FAILED') / COUNT(*), 1) AS failure_pct
FROM ocr_jobs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY batch_id
HAVING COUNT(*) FILTER (WHERE status = 'FAILED') > COUNT(*) * 0.1;
```

#### ③ Vercel Analytics

Vercel Dashboard → Analytics から有効化（Web Vitals・エラー追跡）

### 5.3 ヘルスチェック

```bash
# APIヘルスチェック
curl https://your-app.vercel.app/api/health

# DB接続確認（ローカル）
make db-psql -c "SELECT COUNT(*) FROM ocr_jobs WHERE created_at > NOW() - INTERVAL '1 day';"
```

---

## 6. インシデント対応

### 6.1 インシデント分類

| レベル | 内容 | 目標対応時間 |
|-------|------|------------|
| P0 緊急 | シークレット漏洩 / データ流出 / サービス全断 | 30分以内 |
| P1 重大 | OCR全停止 / DB接続不可 | 2時間以内 |
| P2 警告 | OCR失敗率>10% / API応答遅延 | 24時間以内 |
| P3 軽微 | UI表示崩れ / 非本質的機能の不具合 | 次のスプリント |

### 6.2 シークレット漏洩（P0）

→ [SECURITY.md](../SECURITY.md) を参照

### 6.3 OCR停止（P1）

```bash
# 1. Cloud Tasks キューの状態確認
gcloud tasks queues describe poketre-ocr-queue --location=asia-northeast1

# 2. 失敗ジョブの確認
psql "$DATABASE_URL" -c "
  SELECT job_id, status, error_message, updated_at
  FROM ocr_jobs
  WHERE status = 'FAILED'
  ORDER BY updated_at DESC
  LIMIT 10;
"

# 3. Cloud Run ログ確認
gcloud logging read "resource.type=cloud_run_revision" --limit=50

# 4. Vertex AI 障害確認
# https://status.cloud.google.com/
```

### 6.4 インシデントレポート

`docs/incidents/YYYY-MM-DD-description.md` に以下を記録:

```markdown
# インシデントレポート: YYYY-MM-DD

## 概要
<!-- 何が起きたか1〜2文で -->

## タイムライン
- HH:MM 発生検知
- HH:MM 原因特定
- HH:MM 対応完了

## 根本原因

## 対応内容

## 再発防止策
- [ ] 対応1
- [ ] 対応2
```

---

## 7. リリース管理

### 7.1 デプロイフロー

```
feature/xxx → PR → CI通過 → mainマージ → Vercel自動デプロイ
                                          ↓
                                    DB マイグレーション
                                    （手動実行 or CI）
```

### 7.2 デプロイ前チェックリスト

- [ ] CIがすべてグリーン（secret-scan / typecheck / lint / build）
- [ ] DBマイグレーションがある場合、ダウンタイム影響を確認
- [ ] 新しい環境変数がVercelに設定済み
- [ ] ロールバック手順を確認済み

### 7.3 ロールバック手順

```bash
# Vercel でのロールバック
# Vercel Dashboard → Deployments → 直前のデプロイ → Redeploy

# DBロールバック（1件）
make migrate-down DATABASE_URL="..."

# 複数件ロールバック
migrate -path db/migrations -database "$DATABASE_URL" down 2
```

### 7.4 バージョニング

- **セマンティックバージョニング**: `MAJOR.MINOR.PATCH`
- タグ付け: `git tag -a v1.2.0 -m "Release v1.2.0"`
- GitHub Releases でリリースノートを管理

---

## 付録: 便利なコマンド集

```bash
# ── ローカル開発 ─────────────────────────────────────────────
make setup-hooks          # シークレット検出フックのセットアップ
make dev-db               # DB起動 + マイグレーション + シード
make scan-secrets         # 手動シークレットスキャン

# ── DB操作 ──────────────────────────────────────────────────
make migrate-up           # マイグレーション適用
make migrate-down         # 1件ロールバック
make db-psql              # psql コンソール

# ── コード品質 ───────────────────────────────────────────────
make web-lint             # ESLint
cd app/web && npx tsc --noEmit  # 型チェック
make web-build            # ビルド確認

# ── GCP ─────────────────────────────────────────────────────
gcloud tasks queues describe poketre-ocr-queue --location=asia-northeast1
gcloud logging read "resource.type=cloud_run_revision" --limit=20
gsutil ls gs://$GCS_BUCKET/ocr-uploads/ | wc -l  # アップロード数確認
```
