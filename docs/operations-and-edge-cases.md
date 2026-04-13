# 運用・境界・エッジケース

更新日: 2026-04-06

DB 移行後の **トランザクション、競合、OCR パイプラインの整合**を定義する。技術選択の正本は [recommended-architecture.md](./recommended-architecture.md)。

---

## 1. 正式登録（F4）のトランザクション境界

- **単一の DB トランザクション**内で順に実行する:
  1. `cards` UPSERT
  2. `inventory_units` または `inventory_lots` INSERT
  3. `stock_movements` に `IN` を INSERT
  4. `ocr_staging` の `status` / `review_status` を更新
- **失敗時**: ロールバックし、`ocr_staging` は `登録待ち` のまま。

スプレッドシート時代の「手動整合」は **廃止**し、DB 前提で完結させる。

---

## 2. OCR パイプラインと Drive の順序

推奨順（**成功時**）:

1. 画像をダウンロード
2. OCR 実行
3. **`ocr_staging` に INSERT**（同一トランザクション内で `processed_files` はまだ書かない）
4. トランザクションコミット成功後
5. **`processed_files` に INSERT**（冪等完了）
6. Drive で Inbox → Processed へ移動（`files.update`）

**失敗時**（OCR 失敗・DB 失敗）:

- `processed_files` は書かない。
- 画像は Error フォルダへ、または Inbox に残し **`retry_count`** を Drive `appProperties` で管理。DB 側は **`ocr_staging.last_error`** にメッセージを残す。

**採用**: **DB の `ocr_staging` + `processed_files` を正**とし、Drive のフォルダ移動は **ベストエフォート**（失敗時は次回スキップで二重挿入を防ぐ）。

---

## 3. 同一 `serial_number` の複数画像

- OCR は **画像ごとに 1 行** `ocr_staging`。
- 同一 `serial_number` の重複は **登録待ち一覧で警告表示**（仕様書の集約は「同一 staging で qty 加算」だったが、DB では **行単位**で持ち、F4 で `lot` にまとめるか、Unit を複数にするかは **ユーザー選択**）。

---

## 4. 並行処理（Cloud Run）

- **同一 `drive_file_id` の二重処理**を防ぐ:
  - DB: `processed_files` の **INSERT ... ON CONFLICT DO NOTHING** で取得
  - または **advisory lock**（ファイル ID ハッシュ）
- 複数ワーカーで Inbox を走査する場合、**「先に processed_files を取りに行く」**楽観ロックが扱いやすい。

---

## 5. Google API レート制限（移行期）

- OCR が **Cloud Run のみ**で Drive を触る場合でも、**一覧・ダウンロード・移動** が並列すると 429 になり得る。
- **対策**: 同時実行数の上限、指数バックオフ、`HttpError` 別のリトライ（既存 `main.py` の改善）。

---

## 6. 在庫と掲載の二重販売

- **掲載登録（F13）**時に:
  - `listings.list_qty` ≤ **その在庫の利用可能数**（アプリで検証）。
- Shopify 側の在庫と DB のズレは **定期同期ジョブ**で検知し、`sync_status=ERROR` と `last_error` に記録。

---

## 7. 時刻・タイムゾーン

- DB は **timestamptz**（UTC 保存）。
- 画面表示は **Asia/Tokyo**（要件定義書どおり）。

---

## 8. バックアップ・リストア

- Cloud SQL の **自動バックアップ・PITR** を有効化。
- 移行直後は **スナップショットを手動取得** してから本番切替。
