# 自動値付け(値付け提案)機能 設計

## 背景
TCG の値付けは「原価・市場相場・コンディション・在庫日数・在庫数」の関数。現状は人間の勘頼みで、出品毎に時間を食う。
自動値付けロジックを入れれば、(a) 大量出品の初期値自動化、(b) 滞留在庫の自動値下げ提案、(c) 新人担当者でも一定品質、が得られる。

## 方針
**自動「提案」。自動反映はしない** 初期は。値付けは経営判断と密接で、勝手に価格変更すると事故る。MVP は提案値を UI に表示、人間が採用 or 修正。Phase 2 で閾値内の自動反映をオプション化。

## スコープ

### MVP
- ルールベースの値付け提案 API + 在庫一覧/出品画面での表示
- 入力: `acquisition_cost`, `market_price`([#18](https://github.com/itsmishb/poketre/issues/18))、`condition_grade`, `aging_days`([#13](https://github.com/itsmishb/poketre/issues/13))、`stock_qty`
- 出力: `suggested_price`, `min_acceptable_price`, `reasoning`(各要素の寄与)

### Phase 2
- バンディット的学習(売れた価格を記録して係数を調整)
- 「値下げタイミング」の自動通知(滞留 30日 で -5%、60日で -10% 等の提案)
- 競合監視(他店相場 vs 自店価格の乖離検知)

## ロジック(MVP)

### 基礎式
```
base = max(acquisition_cost * cost_multiplier, market_price * condition_factor)
aging_penalty = lookup(aging_days)
stock_discount = lookup(stock_qty)
suggested = floor(base * aging_penalty * stock_discount / 10) * 10
min_acceptable = max(acquisition_cost * 1.05, suggested * 0.85)
```

### 係数(設定テーブル、管理画面で調整可)

`pricing_rules` テーブル:
| key | value |
|---|---|
| cost_multiplier | 1.4 |
| condition_factor.S | 1.10 |
| condition_factor.A | 1.00 |
| condition_factor.B | 0.80 |
| condition_factor.C | 0.60 |
| aging_penalty(0-30) | 1.00 |
| aging_penalty(31-60) | 0.97 |
| aging_penalty(61-90) | 0.93 |
| aging_penalty(91+) | 0.85 |
| stock_discount(1-2) | 1.00 |
| stock_discount(3-5) | 0.98 |
| stock_discount(6+) | 0.95 |
| rounding_step | 10 |

カテゴリ(レアリティ/セット)別に上書き可能にするため、`pricing_rules (scope_type, scope_value, key, value)` 構造で管理。

### 市場価格が取れない場合
- `market_price IS NULL` のときは `base = acquisition_cost * cost_multiplier * 1.5`(安全マージン強め)
- または、UI に「市場価格未取得」警告表示、自動提案をグレーアウト

## 機能モジュール

### API
- `POST /api/pricing/suggest` (body: `{card_id, inventory_id?}`) → `{suggested_price, min_acceptable_price, reasoning[]}`
- `GET /api/pricing/rules` / `PUT /api/pricing/rules`(admin のみ)

### UI
- **在庫一覧**: 新規列「推奨価格」(既存 [#18 市場価格] [#19 粗利率] の隣)
  - 現在の出品価格との差分を色表示(推奨より +5% 以上高 orange、低 green)
- **出品作成/編集フォーム**: 「推奨価格を使用」ボタン、理由を tooltip で表示
  ```
  推奨: ¥1,200
  └ 原価 ¥500 × 1.4 = ¥700
  └ 市場 ¥1,500 × A(1.00) = ¥1,500
  └ 基準 max(¥700, ¥1,500) = ¥1,500
  └ 滞留45日: -3% → ¥1,455
  └ 在庫6枚: -5% → ¥1,382
  └ 10円単位に丸め → ¥1,380
  ```
- **設定画面** `/settings/pricing`: 係数テーブルの編集 UI(admin のみ)

### ジョブ
- 夜間バッチで全在庫の推奨価格を再計算、`inventory_*_suggested_price` カラム(nullable) or キャッシュテーブルに保存
- 在庫一覧の毎回計算は重いのでキャッシュ前提

## MVP 受け入れ基準
- [ ] `POST /api/pricing/suggest` が仕様通りのレスポンスを返す
- [ ] 在庫一覧に「推奨価格」列、ホバーで内訳 tooltip
- [ ] `/settings/pricing` で係数を編集、保存 → 次回計算に反映
- [ ] 出品画面で「推奨価格を使用」ボタンが動作
- [ ] 夜間バッチで suggested_price が更新される

## 依存
- [#18 参考市場価格](https://github.com/itsmishb/poketre/issues/18): market_price が取れないと提案の精度が大幅に落ちる。本機能の着手は #18 の後が望ましい
- [#13 在庫日数](https://github.com/itsmishb/poketre/issues/13): aging_days の計算が前提

## 非スコープ(意図的に外す)
- 実際の Shopify 出品価格への自動反映(人間が最終判断)
- 競合店の価格スクレイピング(#18 で検討)
- A/B テスト基盤
