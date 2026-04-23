# 買取フロー設計

## 背景
TCG 販売業者の売上の約半分は「買取 → 仕入 → 再販」。現状の Poketre は販売側(Shopify 連携、在庫管理)のみで、買取導線が未設計。実店舗運用で必須。

## スコープ

### MVP(Phase 1)
- 店頭買取のみ(対面・現金/銀行振込)
- 1 件 = 1 人のお客から複数カードをまとめて買取
- カード種別は既存カタログ(cards)から選択、未登録カードは「あとで対応」扱い
- 査定者(operator)が手入力で査定、管理画面で処理

### Phase 2(スコープ外、後続)
- オンライン買取申込(顧客 Web フォーム → 郵送キット送付 → 査定)
- 買取価格マスタの自動取得(外部相場 API)
- 送金連携(銀行 API / PayPay 等)

## データモデル

### 新規テーブル

#### `buyback_orders`
| カラム | 型 | 説明 |
|---|---|---|
| buyback_id | uuid PK | |
| code | text UNIQUE | 人間可読な番号(`BB-YYYYMMDD-NNN`) |
| channel | text | `IN_STORE` / `MAIL`(Phase2) |
| customer_name | text | |
| customer_contact | text | メール or 電話(任意) |
| customer_id_verified | bool | 古物商 本人確認済みフラグ |
| status | text | `DRAFT` / `ASSESSED` / `OFFERED` / `ACCEPTED` / `REJECTED` / `PAID` / `STOCKED` / `CANCELLED` |
| total_offered | int | 提示合計額(JPY) |
| total_paid | int | 実支払額(JPY、後日値引き交渉等で変動) |
| payment_method | text | `CASH` / `BANK` / `STORE_CREDIT` |
| assessor_id | uuid FK app_users | 査定者 |
| paid_at | timestamptz | |
| stocked_at | timestamptz | 在庫化完了時刻 |
| notes | text | |
| created_at / updated_at | timestamptz | |

#### `buyback_items`
| カラム | 型 | 説明 |
|---|---|---|
| item_id | uuid PK | |
| buyback_id | FK buyback_orders | |
| card_id | FK cards (nullable) | 既存カタログ参照。未登録なら NULL |
| card_text | text | 未登録時の手書き(「ピカチュウ SV4a 001/165」等) |
| condition_grade | text | `S/A/B/C` |
| qty | int | |
| offered_unit_price | int | 1枚あたり提示額 |
| accepted | bool | 個別単位で拒否(この1枚だけ買い取らない)も可能 |
| inventory_ref_type | text | 在庫化後の `UNIT` / `LOT` |
| inventory_ref_id | uuid | 対応する inventory_units.id or inventory_lots.id |

### 既存 `stock_movements` に追加
- `ref_kind = 'BUYBACK'`, `ref_id = buyback_id` で IN 移動を記録
- 冪等性: 部分 UNIQUE `(ref_kind, ref_id, metadata->>'item_id')` を追加

## 業務フロー

```
[店頭] 顧客がカード持参
  ↓
[査定] operator が buyback_order 作成(status=DRAFT)
  └ 各カードを buyback_items として追加
  └ 買取価格マスタ or 手入力で offered_unit_price 設定
  ↓
[提示] 合計額を顧客に提示(status=OFFERED)
  ↓
[承諾/拒否]
  ├ 個別拒否: buyback_items.accepted=false
  ├ 全拒否: status=REJECTED で終了
  └ 承諾: status=ACCEPTED
  ↓
[支払] 支払い方法を選択、実支払い
  └ status=PAID, paid_at, payment_method, total_paid 記録
  ↓
[在庫化] トランザクション内で:
  ├ accepted 行ごとに inventory_units or inventory_lots を作成
  ├ stock_movements に IN を記録(ref_kind=BUYBACK, metadata.item_id)
  └ status=STOCKED
  ↓
[出品] 既存の Shopify 同期フローに乗る
```

## UI/画面

1. `/buyback` — 買取一覧(ステータスタブ、検索)
2. `/buyback/new` — 新規買取作成(顧客情報 + 明細ウィザード)
3. `/buyback/[id]` — 詳細(査定編集、提示、承諾、支払い、在庫化ボタン)

## 古物営業法対応(日本)
- 1万円以上の買取は本人確認書類の確認・記録が法律で義務
- `customer_id_verified` + 身分証のコピー(GCS に保存、`customer_id_image_url` カラム)
- 買取記録の 3 年保存(既存 DB 保持で問題なし)

## MVP 受け入れ基準
- [ ] 新規買取作成 → 明細追加 → 提示 → 承諾 → 支払い → 在庫化 のフローが通る
- [ ] 在庫化後、`/inventory` に新しい単枚/ロット行が現れる
- [ ] `stock_movements` に IN 移動が記録される(BUYBACK ref_kind)
- [ ] 古物営業法: 1万円超の買取で身分証情報が必須入力
- [ ] 既存の Shopify 同期ジョブが買取由来の在庫にも走る(card_id が同じなら自動)

## 参考
既存 UI トーン: [app/(dashboard)/staging](app/web/app/(dashboard)/staging) のウィザード構造と近い。`stocktake` とは別機能(#棚卸し参照)。
