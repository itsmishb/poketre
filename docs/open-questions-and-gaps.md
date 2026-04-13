# 未解決・他ドキュメントへの改訂依頼

更新日: 2026-04-06

`docs/` で **細部まで固定した項目**と、**製品仕様書側の更新が望ましい項目**を分ける。

---

## 1. 本リポジトリ `docs/` で固定済み（実装時に従う）

- 在庫モデル A-1（Unit/Lot + movements）
- `storage_locations` への Boxes 統合
- Shopify Phase A（1 card = 1 variant）と Phase B の拡張方針
- OCR は DB のみ、Vision/LLM 切替
- `stock_movements` の **RESERVE** — [recommended-architecture.md](./recommended-architecture.md) §4.1

---

## 2. `app/docs/システム仕様書.md` の改訂推奨（RDB 本番時）

| 箇所 | 現状 | 推奨 |
|------|------|------|
| §1.1 図 | データストアが Sheets | **PostgreSQL** を正とした図に差し替え |
| §5.1 | Google Sheets API がデータ層 | **PostgreSQL + 管理 API** に変更 |
| §5.3 データストアアクセス | MVP: Sheets | **本番: PostgreSQL**、競合回避はトランザクション |
| §6.2 Cloud Run | OCR_Staging 追記のみ | **DB への INSERT** に変更（Sheets 廃止） |

---

## 3. ビジネス判断（推奨設計で充足した項目）

以下は **[recommended-architecture.md](./recommended-architecture.md) §5, §7** で固定した。クライアントと食い違う場合のみ差し替える。

| 項目 | 採用 |
|------|------|
| Shopify 在庫同期のソース | **在庫可能数（F9）**を正。`list_qty` は clamp 用 |
| 未出荷の定義 | **`SOLD`**＝売約済み未発送、**発送完了操作**で **`SHIPPED`** |
| 返品・キャンセル（初期） | **手動 ADJUST** + `ref_kind=RETURN`。自動返金連携はスコープ外 |

---

## 4. Excel 移行のデータ品質

- `_Internal_Processed_Files` の列が **ヘッダではなくデータ**になっている場合、**手動でファイル ID 一覧を抽出**してから `processed_files` に投入する。
- `CardLocations` 1 行が **複数枚の物理在庫**を意味する場合、**Unit 生成数**のルール（1 行 = 1 Unit か、qty 列の有無か）を **データ確認**で確定する。

---

## 5. 次のアクション（推奨）

1. ステージング DB で **サンプルデータ**を入れ、F4 / 掲載 / 在庫集計の **SQL を試す**。
2. `docs/verification-checklist.md` の **⚠️** をすべて ✅ にする。
3. 上記 §2 のとおり **システム仕様書を 1.2 版などで改訂**する。
4. ~~認証プロバイダ~~ → **Google OAuth + Auth.js** に固定（[recommended-architecture.md](./recommended-architecture.md)）。
5. `db/migrations/` に **初回 DDL**（`000001_...`）を追加する。

---

## 6. レビュー結果との対応

設計の見落とし・リスクの一覧は **[review-findings.md](./review-findings.md)** を正とする。本ファイル §2〜§3 と重複する項目は、改訂時にどちらかへ集約してよい。
