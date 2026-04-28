# 棚卸し(実地在庫)機能 設計

## 背景
現物の在庫と DB の在庫は必ずズレる(誤出荷、紛失、破損、入力漏れ、盗難)。月次・四半期で棚卸しを行い、差分を `stock_movements` の ADJUST 移動として記録することは、販売業の会計・税務・監査で必須。

## スコープ

### MVP
- 管理画面から棚卸しセッションを開始
- 範囲を「全体」「特定棚」「特定セット」で指定
- バーコード/serial_number をスキャンして実数入力
- 差分を自動算出、確定で ADJUST 移動を発行

### Phase 2
- モバイル対応(スマホで棚の前でスキャン)
- 2人体制のダブルチェック(カウント A/B の突合)

## データモデル

#### `stocktakes`
| カラム | 型 | 説明 |
|---|---|---|
| stocktake_id | uuid PK | |
| code | text UNIQUE | `ST-YYYYMMDD-NNN` |
| scope_type | text | `ALL` / `LOCATION` / `SET` / `CARD` |
| scope_value | jsonb | 範囲の具体値(`{"location_prefix":"1-1"}` 等) |
| started_by | uuid FK app_users | |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| status | text | `OPEN` / `COUNTING` / `RESOLVING` / `COMPLETED` / `CANCELLED` |
| snapshot_at | timestamptz | 開始時点のDB在庫を凍結するタイムスタンプ |
| total_expected | int | 理論在庫数(開始時スナップショット) |
| total_counted | int | 実数合計 |
| total_diff | int | |
| notes | text | |

#### `stocktake_lines`
| カラム | 型 | 説明 |
|---|---|---|
| line_id | uuid PK | |
| stocktake_id | FK | |
| target_type | text | `UNIT` / `LOT` |
| target_id | uuid | inventory_units.id / inventory_lots.id |
| card_id | FK cards | |
| location_code | text | |
| expected_qty | int | 開始時スナップショット |
| counted_qty | int NULL | 未カウントは NULL、0 は「数えたが 0 枚」 |
| diff | int GENERATED | counted - expected |
| resolution | text | `PENDING` / `CONFIRMED` / `INVESTIGATING` / `IGNORED` |
| resolution_notes | text | |
| adjust_movement_id | uuid FK stock_movements | ADJUST 発行後の移動 ID |

#### 既存 `stock_movements`
- `movement_type='ADJUST'`, `ref_kind='STOCKTAKE'`, `ref_id=stocktake_id`
- 冪等性: 部分 UNIQUE `(ref_kind, ref_id, metadata->>'line_id')` 追加

## 業務フロー

```
[開始] 棚卸しセッション作成(scope 指定)
  └ 対象の inventory_* を一覧取得、stocktake_lines を一括 INSERT
      (expected_qty = その時点の在庫数 / qty_on_hand)
  └ status=COUNTING
  ↓
[カウント] スキャンまたは検索 → counted_qty 入力
  └ 同 serial_number を複数スキャン = qty インクリメント
  └ カタログに無いカードが出現 → staging に回す(別issue)
  ↓
[差分レビュー] diff != 0 の行を一覧表示
  ├ 原因調査(破損、誤出荷、紛失)
  └ resolution を選択
      ├ CONFIRMED: ADJUST 発行で DB を実数に合わせる
      ├ INVESTIGATING: 一旦保留
      └ IGNORED: 差分は記録のみ、DB 更新しない
  ↓
[確定] resolution=CONFIRMED な行に対して ADJUST stock_movements を一括発行
  └ inventory_* の数量は stock_movements 起因で自動整合
  └ status=COMPLETED, finished_at
```

## UI/画面

1. `/stocktake` — セッション一覧
2. `/stocktake/new` — 範囲設定ウィザード
3. `/stocktake/[id]` — カウント画面(スキャン入力、進捗バー、差分リアルタイム表示)
4. `/stocktake/[id]/resolve` — 差分レビューと確定

## レース条件対応
- 棚卸し中に Shopify 注文が入ると、expected_qty はスナップショット、現在在庫はさらに減る
- 対策: stocktake_lines.expected_qty は **開始時点の値を固定保存**、差分計算は「counted - (expected + 期間中の movements)」で行う
- または: 棚卸し期間中は対象範囲の出品を自動停止(option)

## MVP 受け入れ基準
- [ ] 棚卸し開始 → カウント → 差分確認 → 確定 のフローが通る
- [ ] 確定後、inventory 数量が実数に一致
- [ ] `stock_movements` に ADJUST が適切に記録される(監査ログ)
- [ ] 棚卸し中に入った注文の OUT 移動が差分計算に反映される

## 依存
- [#16 バーコードスキャン](https://github.com/itsmishb/poketre/issues/16) と UI レイヤを共有できる
- [#14 一括操作](https://github.com/itsmishb/poketre/issues/14) のチェックボックス UI も流用可
