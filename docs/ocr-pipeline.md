# OCR パイプライン仕様（DB 直書き・Vision / LLM）

更新日: 2026-04-06

前提: [decided-direction.md](./decided-direction.md) §4、[recommended-architecture.md](./recommended-architecture.md) §6。スプレッドシートへの追記は行わない。

---

## 1. 目的

- Drive Inbox の画像からカード情報を抽出し、**`ocr_staging` テーブル**に保存する。
- **ポケモンカードに特化**した精度（セット記号・番号レンジ・レア・PSA スラブ等）を可能な限り高める。
- **Google Cloud Vision** と **LLM（現行: Gemini）** を **切替または併用**できるようにする。

---

## 2. 処理フロー（論理）

1. **トリガ**: HTTP（Scheduler 等）または Pub/Sub。
2. **入力**: Inbox 内の画像（JPEG/PNG）。**冪等**: `processed_files.drive_file_id` または **`ocr_staging.drive_file_id` の UNIQUE** でスキップ。
3. **ロック**: 同一ファイルの並行処理を防ぐ（[operations-and-edge-cases.md](./operations-and-edge-cases.md) §4）。
4. **前処理**: リサイズ・形式正規化（現行 `main.py` と同等の方針を踏襲可能）。
5. **認識（既定）**: **ハイブリッド** — 主に **Gemini** で JSON 構造化、失敗・低 confidence 時に **Vision（DOCUMENT_TEXT_DETECTION）** → 同一スキーマへ正規化。環境変数 `OCR_ENGINE` で `gemini` / `vision` / `hybrid` を切替可能。
6. **保存**: `ocr_staging` へ INSERT。`status` は初期値 `登録待ち`（または `PENDING` に英語統一）。
7. **成功後**: `processed_files` を記録し、Drive Inbox → Processed へ移動（順序は [operations-and-edge-cases.md](./operations-and-edge-cases.md) §2）。

---

## 3. `ocr_staging` のカラム（最低限）

### 3.1 Cloud Run 由来（現行 Excel 相当）

| カラム | 型 | 備考 |
|--------|-----|------|
| `stg_id` | text/uuid | PK |
| `drive_file_id` | text | **NOT NULL UNIQUE**。Drive との紐づけ |
| `last_error` | text | NULL 可。最終失敗メッセージ（画面表示用） |
| `file_name` | text | |
| `image_url` | text | サムネ URL 等 |
| `raw_text` | text | Vision 用 |
| `ai_json` | jsonb | LLM 生 |
| `status` | text | 登録待ち / 確定 / NG 等 |
| `serial_number`, `set_code`, … | 仕様書 | 抽出フィールド |
| `qty` | int | デフォルト 1 |
| `confidence` | numeric | |

### 3.2 確認ワークフロー（仕様書）

| カラム | 型 |
|--------|-----|
| `review_status` | text |
| `reviewer_id` | text |
| `approved_at` | timestamptz |
| `initial_qty` | int |
| `initial_condition` | text |
| `storage_location_id` | text FK |
| `approved_inventory_type` | text | UNIT / LOT |
| `intended_channels` | text |

### 3.3 インデックス

- `WHERE status = '登録待ち'` 用: `(status, created_at)`。
- `drive_file_id` UNIQUE。

---

## 4. `processed_files`

| カラム | 型 | 備考 |
|--------|-----|------|
| `drive_file_id` | text | PK |
| `processed_at` | timestamptz | |
| `ocr_engine` | text | gemini / vision / hybrid |
| `status` | text | SUCCESS / FAILED |
| `error_message` | text | 任意 |

**失敗時**: `status=FAILED` で記録し、**再試行ポリシー**（retry_count）は Drive `appProperties` または DB の別テーブルで管理。

---

## 5. 設定（環境変数例）

| 変数名 | 意味 |
|--------|------|
| `OCR_ENGINE` | 既定 **`hybrid`**。`gemini` / `vision` / `hybrid` |
| `GEMINI_MODEL_PRIMARY` | 主モデル |
| `GEMINI_MODEL_SECONDARY` | 副（フォールバック） |
| `GOOGLE_CLOUD_PROJECT` | Vision |
| `GEMINI_API_KEY` | LLM（または Vertex 経由に統一） |
| `OCR_WRITE_TARGET` | **`sheets`**（既定）または **`postgres`**（`DATABASE_URL` 必須） |
| `DATABASE_URL` | Postgres 接続文字列（`postgres` モード時） |

---

## 6. フォールバック条件（推奨）

| 条件 | 挙動 |
|------|------|
| Gemini が 5xx / 429 / タイムアウト | 副モデルへ（現行 main.py の hedging） |
| JSON パース失敗 | 同一画像で Vision → ルールパース、または `status=要再スキャン` |
| `confidence` < 閾値 | 画面で強調表示。自動で `NEEDS_RESCAN` にしないかは運用で選択 |

---

## 7. ポケカ特化

- **プロンプト・JSON スキーマ**: `cloud_run_service/main.py` の抽出項目をベースに、**レギュマーク・3 桁ゼロ埋め**を明示。
- **後処理**: `Enums` 相当の `set_code` / `rarity` ホワイトリスト、`normalize_card_number_text()`。
- **Vision**: `DOCUMENT_TEXT_DETECTION` と領域分割（将来改善）。

---

## 8. Cloud Run の書き先（実装済み）

- **`OCR_WRITE_TARGET=postgres`** 時: `postgres_ocr.py` 経由で **`ocr_staging`** に INSERT（Sheets は未使用）。冪等は **`stg_id` / `drive_file_id`**。
- **既定（`sheets`）**: 従来どおりスプレッドシート追記。

## 9. 既存コードとの関係

- `cloud_run_service/main.py` は **Sheets / Postgres の両モード**をサポート。

---

## 10. セキュリティ

- サービスアカウント: **Drive（対象フォルダ）** と **Cloud SQL**（または **管理 API** のみ）。
- 秘密情報は **Secret Manager**。DB 直書きの場合は **Cloud SQL Auth Proxy** または **IAM 付きコネクタ**。

---

## 11. 管理 API 経由の場合

- Cloud Run は **内部 API** に `POST /ocr-staging` のみ叩き、**認証**（OIDC / API キー）を必須とする。
