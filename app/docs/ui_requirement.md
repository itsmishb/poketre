# カード管理システム UI 要件定義書（Next.js + Supabase）

## ドキュメント情報

| 項目 | 内容 |
|------|------|
| ドキュメント名 | UI 要件定義書 |
| 版 | 1.0 |
| 作成日 | 2025年2月 |
| 技術スタック | Next.js (App Router), Supabase |
| 前提ドキュメント | 要件定義書.md、システム仕様書.md |
| 表示言語 | 日本語（日本人利用者向け） |

---

## 1. 表示言語・ロケール（日本語担保）

本システムは**日本人利用者向け**であり、UI はすべて**日本語**で提供する。要件定義書「3. 表示言語・ロケール」に準拠する。

- **画面テキスト**: ラベル、ボタン、リンク、プレースホルダ、ヘッダー、パンくず、サイドバーの項目名、確認ダイアログの文言はすべて**日本語**とする。英語のみの表示は出さない。
- **メッセージ**: 成功・エラー・バリデーションの Toast / Snackbar / インラインエラーは**日本語**で、原因と対処が分かる表現にする。例: 「保存しました」「数量を入力してください」「通信エラーです。しばらくしてからやり直してください。」
- **日付・時刻**: 表示は **YYYY年MM月DD日** または **YYYY/MM/DD**、時刻は **HH:mm**（24時間制）。和暦（令和X年）は任意。
- **数値**: 桁区切りは**カンマ**（1,234）。価格は**円**または **¥** を付ける（例: 1,200円）。
- **ブラウザ**: `<title>` と `<meta name="description">` は日本語。例: タイトル「カード管理システム」、各ページで「登録待ち一覧 | カード管理システム」など。
- **フォント**: 日本語の可読性を確保する。Noto Sans JP、游ゴシック、Hiragino Sans 等の日本語対応フォントを必ず指定し、フォールバックで OS の日本語フォントを用いる。
- **コード・URL**: 変数名・API パス・ルートパス（`/staging`, `/cards` 等）は英語のままでよい。**ユーザーが目にするラベル・メッセージのみ**日本語とする。

---

## 2. 技術前提

- **フレームワーク**: Next.js 14+（App Router）
- **バックエンド**: Supabase（PostgreSQL, Auth, Realtime は任意）
- **スタイル**: 要検討（Tailwind CSS 推奨）。日本語フォントを明示的に指定すること。
- **データ取得**: Server Components を基本とし、必要に応じて Client Components で Supabase クライアント利用
- **認証**: Supabase Auth（Email/Password または Magic Link）。RLS でテナント分離する場合は要設計

---

## 3. ページ構造（Tree）

以下は `app/` ディレクトリを基準としたルート構造とする。

```
app/
├── layout.tsx                    # ルートレイアウト（HTML, フォント, プロバイダ）
├── page.tsx                      # トップ: 未認証時はログイン誘導、認証済みは /dashboard へリダイレクト
├── (auth)/
│   ├── layout.tsx                # 認証用レイアウト（センタリング、ロゴのみ）
│   ├── login/
│   │   └── page.tsx              # ログイン
│   └── error/
│       └── page.tsx              # 認証エラー表示（任意）
│
└── (dashboard)/
    ├── layout.tsx                # ダッシュボードレイアウト（サイドバー + メイン）
    ├── page.tsx                  # ダッシュボード TOP（SCR-015）
    │
    ├── staging/                  # 登録待ち（OCR_Staging）
    │   ├── page.tsx              # 登録待ち一覧（SCR-001）
    │   └── [id]/
    │       └── page.tsx          # 登録待ち詳細・確認（SCR-002）
    │
    ├── cards/                    # カード種別（CardCatalog）
    │   ├── page.tsx              # カード種別一覧（SCR-003）
    │   └── [id]/
    │       └── page.tsx          # カード種別詳細（SCR-004）
    │
    ├── sets/                     # セット（Sets）
    │   └── page.tsx              # セット一覧・登録・更新（SCR-005）
    │
    ├── inventory/                # 在庫（InventoryUnits / InventoryLots）
    │   ├── page.tsx              # 在庫一覧（SCR-006）
    │   └── [id]/
    │       └── page.tsx          # 在庫詳細・入出庫記録（SCR-007）
    │
    ├── locations/                # 棚番（StorageLocations）
    │   └── page.tsx              # 棚番マスタ（SCR-008）
    │
    ├── listings/                 # 掲載（ChannelListings）
    │   ├── page.tsx              # 掲載一覧（SCR-009）
    │   ├── new/
    │   │   └── page.tsx         # 新規掲載（SCR-010 新規）
    │   └── [id]/
    │       └── page.tsx          # 掲載編集・成約登録（SCR-010 編集）
    │
    ├── orders/                   # 注文（ChannelOrders）
    │   └── page.tsx              # 注文一覧（SCR-012）
    │
    ├── prices/                   # 価格（PriceSnapshots）
    │   ├── page.tsx              # 価格スナップショット一覧（SCR-013）
    │   └── import/
    │       └── page.tsx          # 価格登録・CSV取込（SCR-014）
    │
    └── settings/                 # 設定・連携
        ├── page.tsx              # 設定 TOP（各設定へのリンク）
        └── shopify/
            └── page.tsx          # Shopify 連携設定・同期・ログ（SCR-011）
```

**ルート一覧（URL と画面ID対応）**

| URL | 画面ID | 画面名 |
|-----|--------|--------|
| `/` | — | トップ（リダイレクト） |
| `/(auth)/login` | — | ログイン |
| `/(dashboard)` | SCR-015 | ダッシュボード |
| `/(dashboard)/staging` | SCR-001 | 登録待ち一覧 |
| `/(dashboard)/staging/[id]` | SCR-002 | 登録待ち詳細・確認 |
| `/(dashboard)/cards` | SCR-003 | カード種別一覧 |
| `/(dashboard)/cards/[id]` | SCR-004 | カード種別詳細 |
| `/(dashboard)/sets` | SCR-005 | セット一覧 |
| `/(dashboard)/inventory` | SCR-006 | 在庫一覧 |
| `/(dashboard)/inventory/[id]` | SCR-007 | 在庫詳細・入出庫記録 |
| `/(dashboard)/locations` | SCR-008 | 棚番マスタ |
| `/(dashboard)/listings` | SCR-009 | 掲載一覧 |
| `/(dashboard)/listings/new` | SCR-010 | 新規掲載 |
| `/(dashboard)/listings/[id]` | SCR-010 | 掲載編集・成約登録 |
| `/(dashboard)/orders` | SCR-012 | 注文一覧 |
| `/(dashboard)/prices` | SCR-013 | 価格スナップショット一覧 |
| `/(dashboard)/prices/import` | SCR-014 | 価格登録・取込 |
| `/(dashboard)/settings` | — | 設定 TOP |
| `/(dashboard)/settings/shopify` | SCR-011 | Shopify 連携 |

---

## 4. グローバル UI 要件

### 4.1 ルートレイアウト（`app/layout.tsx`）

- HTML の `lang="ja"`、メタ情報、共通フォント（日本語可読フォントを必ず指定）を設定する。
- Supabase プロバイダやテーマプロバイダを配置する。
- 子レイアウト・ページの `children` をそのまま表示する。

### 4.2 認証レイアウト（`app/(auth)/layout.tsx`）

- 未認証ユーザー向けのレイアウト。中央配置のカード型またはシンプルなフォーム領域。
- ロゴ・システム名を表示する。
- 背景は単色または控えめなパターン。

### 4.3 ダッシュボードレイアウト（`app/(dashboard)/layout.tsx`）

- **サイドバー（常時表示 or モバイルではハンバーガーで開閉）**
  - システム名またはロゴ。
  - ナビゲーションリンク（アイコン + ラベル）:
    - ダッシュボード（`/`）
    - 登録待ち（`/staging`）
    - カード種別（`/cards`）
    - セット（`/sets`）
    - 在庫（`/inventory`）
    - 棚番（`/locations`）
    - 掲載（`/listings`）
    - 注文（`/orders`）
    - 価格（`/prices`）
    - 設定（`/settings`）
  - 現在のパスに応じてアクティブ状態をハイライトする。
  - ユーザーメニュー（ログアウト、プロフィール等）を下部に配置可能。
- **メイン領域**
  - パンくずリスト（任意）: 日本語で表示。例 `ダッシュボード > 登録待ち > 詳細`。
  - ページタイトル（h1）を各ページで表示する。
  - `children` を表示。スクロールはメイン領域内で行う。
- **レスポンシブ**: 768px 以下ではサイドバーをオーバーレイまたはドロワーで表示する。

### 4.4 認証・アクセス制御

- 認証済みでない場合は `/(auth)/login` へリダイレクトする（ミドルウェアまたは layout 内で判定）。
- ロール（作業者/管理者）を分ける場合は、Supabase の `profiles` 等で role を保持し、管理者専用ページ（例: 設定、Shopify、棚番マスタ）では role をチェックする。MVP では全ページを同一ロールでも可。

### 4.5 共通コンポーネント

- **DataTable**: 一覧画面で利用。ソート、フィルタ、ページネーション（または仮想スクロール）をサポート。**列ヘッダーは日本語**（例: カード名、セット、番号、レアリティ、在庫数）。Supabase の `range` を使ったページングを想定。一覧画面では「CSV をダウンロード」ボタンを配置し、現在のフィルタ条件で日本語ヘッダの CSV を出力する。
- **FilterBar**: 検索テキスト、セレクト（チャネル・状態・棚番等）、日付範囲を並べたフィルタ領域。**ラベルは日本語**（「検索」「絞り込み」「適用」「クリア」等）。
- **Button**: プライマリ / セカンダリ / 危険のバリエーション。**表示文言は日本語**（保存、キャンセル、削除、正式登録、戻る 等）。loading 状態では「処理中…」等を表示。
- **Modal / Drawer**: 確認ダイアログ、簡易フォームに利用。タイトル・本文・「実行」「キャンセル」等は日本語。
- **Toast / Snackbar**: 保存成功・エラー・バリデーションを**日本語**で表示。例: 「保存しました」「入力内容を確認してください」「通信に失敗しました」。
- **EmptyState**: 一覧が 0 件のときの**日本語**メッセージとアクション。例: 「登録待ちの候補はありません」「在庫がありません」「新規掲載する」。

---

## 5. ページ別 UI 要件

### 5.1 トップ `app/page.tsx`

- 未認証: ログインページへのリンクまたはリダイレクト。
- 認証済み: `/(dashboard)` へ 302 リダイレクト。

---

### 5.2 ログイン `app/(auth)/login/page.tsx`

- **表示**: メールアドレス入力、パスワード入力（または Magic Link の場合はメールのみ）、「ログイン」ボタン。**ラベル・プレースホルダ・ボタンはすべて日本語**（例: メールアドレス、パスワード、ログイン）。
- **操作**: 送信で Supabase Auth の signIn。成功時は `/(dashboard)` へリダイレクト。失敗時は**日本語**でエラーメッセージを表示（例: 「メールアドレスまたはパスワードが正しくありません」）。
- **リンク**: パスワード忘れ（任意）、新規登録（運用方針に応じて）。文言は日本語。

---

### 5.3 ダッシュボード `app/(dashboard)/page.tsx`（SCR-015）

- **レイアウト**: 4 セクション（在庫・販売・業務・価格）をカードまたはグリッドで並べる。**見出し・ラベルは日本語**。集計期間は「日」「週」「月」等の日本語で選択。数値は桁区切り・円表記。
- **在庫**
  - 総在庫数、在庫金額（評価額）、出品可能数、チャネル別出品数、棚別在庫数、登録待ち件数。数値は KPI カードで表示。
- **販売**
  - 日次/週次/月次売上、粗利、チャネル別売上、回転率、滞留在庫ランキング（表またはリスト）。
- **業務**
  - OCR 確認待ち件数、連携エラー数（SyncJobs の直近失敗件数）、棚卸差異・二重販売リスクは任意。
- **価格**
  - 相場推移（PriceSnapshots の簡易グラフまたは表）、自社価格との差、値付け見直し対象。カード種別・セットでフィルタ可能にする。
- **データ**: Supabase から集計クエリまたは RPC で取得。Server Component で取得し、クライアントでインタラクティブにする部分は Client Component に分離。

---

### 5.4 登録待ち一覧 `app/(dashboard)/staging/page.tsx`（SCR-001）

- **表示**: `ocr_staging` のうち `status = '登録待ち'` を一覧。**列ヘッダーは日本語**（サムネイル、カード識別子、カード名、セット、番号、レアリティ、数量、信頼度、確認状態）。DataTable 使用。
- **フィルタ**: セット、レアリティ、確認状態のドロップダウン、検索テキスト（カード名・識別子）。ラベルは日本語。
- **ソート**: 作成日時、信頼度、カード識別子等でソート可能。ラベルは日本語。
- **ページネーション**: 20〜50 件/ページ。「〇件中 1〜20 件」等の**日本語**表示。Supabase の `range(from, to)` で取得。
- **操作**: 行クリックまたは「確認」ボタンで `/staging/[id]` へ遷移。バッジで「登録待ち 〇件」と表示。「CSV をダウンロード」で現在表示条件の一覧を日本語ヘッダ CSV で出力する。

---

### 5.5 登録待ち詳細・確認 `app/(dashboard)/staging/[id]/page.tsx`（SCR-002）

- **表示**
  - 左または上部: 画像を大きく表示（image_url）。読み込み失敗時はプレースホルダー。
  - 右または下部: OCR 抽出項目をフォームで表示（serial_number、name_ja、set_code、card_number_text、rarity、card_type、poke_type、trainer_subtype、generation、PSA 情報、confidence、holo）。編集可能なテキスト/セレクトとする。
- **本システム入力項目**: **ラベルは日本語**（初期数量、状態、保管場所、管理単位（1枚 / ロット）、確認結果）。状態は「S」「A」「B」「C」等、保管場所は棚番マスタから日本語表示で選択。
- **操作**
  - 「OK（正式登録）」: 正式登録処理を呼び出し。成功時は**日本語** Toast（例: 「登録しました」）のうえ `/staging` または `/inventory` へリダイレクト。
  - 「NG」: 確認結果を「却下」に更新し、一覧へ戻る。
  - 「要再スキャン」: 確認結果を「要再スキャン」に更新し、一覧へ戻る。
  - 「戻る」: `/staging` へ。
- **バリデーション**: OK 押下時に初期数量 > 0 等。エラーは**日本語**でインラインまたは Toast に表示（例: 「初期数量を入力してください」）。

---

### 5.6 カード種別一覧 `app/(dashboard)/cards/page.tsx`（SCR-003）

- **表示**: `card_catalog` を一覧。列: serial_number、name_ja、set_code、card_number/number_total、rarity、card_type、在庫数（算出）、掲載中数（算出）。DataTable。
- **検索・フィルタ**: テキスト検索（name_ja、serial_number）、set_code、rarity、card_type でフィルタ。
- **ソート**: 在庫数、name_ja、set_code 等。
- **操作**: 行クリックで `/cards/[id]` へ。

---

### 5.7 カード種別詳細 `app/(dashboard)/cards/[id]/page.tsx`（SCR-004）

- **表示**: 1 件のカード種別の全項目、在庫数・掲載中数（算出）、代表画像（image_ref_standard）。紐づく InventoryUnits / InventoryLots の一覧（サマリまたはリンク）。
- **操作**: 編集はインラインまたはモーダルで可能に。保存で Supabase の `card_catalog` を update。「在庫を見る」で `/inventory?card_id=xxx` のようにフィルタ付きで在庫一覧へ。

---

### 5.8 セット一覧 `app/(dashboard)/sets/page.tsx`（SCR-005）

- **表示**: `sets` を一覧。列: set_code、set_name_ja、series、release_date、total_cards、regulation_set。
- **操作**: 新規登録はモーダルまたはインライン追加。行の編集はインラインまたは編集モーダル。削除は確認ダイアログ付き（任意）。

---

### 5.9 在庫一覧 `app/(dashboard)/inventory/page.tsx`（SCR-006）

- **表示**: `inventory_units` と `inventory_lots` を一覧（タブまたはフィルタで切替）。列: カード種別（serial_number/name_ja）、状態、棚番（保管場所名）、数量（Unit は 1、Lot は qty_on_hand）、status、取得原価等。
- **フィルタ**: card_catalog_id / serial_number、storage_location_id、status、condition_grade。
- **操作**: 行クリックで `/inventory/[id]` へ。「新規入庫」は登録待ちから登録する前提のため、必要なら「手動で在庫を追加」リンクを用意（任意）。

---

### 5.10 在庫詳細・入出庫記録 `app/(dashboard)/inventory/[id]/page.tsx`（SCR-007）

- **表示**: 対象 Unit または Lot の詳細（カード種別、状態、棚番、status、画像、取得原価）。StockMovements の履歴テーブル（日時、qty_delta、movement_type、ref_kind、notes）。
- **操作**
  - 「入庫を記録」: モーダルまたはインラインフォームで qty_delta（正）、movement_type=IN、ref_kind、notes を入力して StockMovements に追加。Lot の場合は qty_on_hand を増やす更新も必要。
  - 「出庫を記録」: 同様に qty_delta（負）、movement_type=OUT。
  - 「調整」: movement_type=ADJUST、qty_delta、notes。
  - 保管場所変更: storage_location_id のセレクト変更 + 保存。必要なら TRANSFER の StockMovements を記録。

---

### 5.11 棚番マスタ `app/(dashboard)/locations/page.tsx`（SCR-008）

- **表示**: `storage_locations` を一覧。階層表示（warehouse > zone > shelf > bin > slot）するか、フラット表で warehouse、zone、shelf、rack、bin、slot、barcode、active_flag を表示。
- **操作**: 新規追加、行の編集、有効/無効のトグル。ツリー形式で折りたたみ表示するかは要検討。

---

### 5.12 掲載一覧 `app/(dashboard)/listings/page.tsx`（SCR-009）

- **表示**: `channel_listings` を一覧。列: channel、対象カード（serial_number 等）、list_qty、price、status、sync_status（Shopify 時）、published_at、ended_at。
- **フィルタ**: channel、status。検索はカード名・serial_number。
- **操作**: 「新規掲載」で `/listings/new` へ。行クリックで `/listings/[id]` へ（編集・成約登録）。

---

### 5.13 新規掲載 `app/(dashboard)/listings/new/page.tsx`（SCR-010 新規）

- **表示**: フォーム。channel（SHOPIFY / YAHOO_AUCTION / MERCARI / OTHER）、listing_mode（API_SYNC / MANUAL_MANAGED）、対象在庫の選択（card_catalog_id + 数量、または target_type + target_id）、list_qty、price、listing_title、listing_description、画像 URL（複数可）。
- **操作**: 保存で ChannelListings に挿入。API_SYNC の場合は「Shopify に同期」で API 呼び出し。MANUAL_MANAGED の場合は在庫を RESERVE に更新し StockMovements に RESERVE 記録。成功時は `/listings` へリダイレクト。

---

### 5.14 掲載編集・成約登録 `app/(dashboard)/listings/[id]/page.tsx`（SCR-010 編集）

- **表示**: 該当掲載の全項目をフォームで表示。読み取り専用と編集可能項目を区別。
- **操作**
  - 編集: price、listing_title、listing_description 等を変更して保存。Shopify の場合は再同期オプション。
  - 成約登録（手動チャネル）: status を SOLD に、sold_at、sold_price を入力して保存。在庫を OUT にし、StockMovements に OUT 記録する処理を実行。
  - 削除または終了: status を ENDED にし、在庫を RELEASE（任意）。

---

### 5.15 注文一覧 `app/(dashboard)/orders/page.tsx`（SCR-012）

- **表示**: `channel_orders` を一覧。列: channel、external_order_id、受注日時、カード/在庫、qty、sold_price、import_status。
- **フィルタ**: channel、日付範囲、import_status。
- **操作**: 行クリックで注文詳細（モーダルまたは別ページ）を表示。取り込みは設定 > Shopify で実行する前提でも可。

---

### 5.16 価格スナップショット一覧 `app/(dashboard)/prices/page.tsx`（SCR-013）

- **表示**: `price_snapshots` を一覧。列: カード（serial_number/name_ja）、source_name、source_type、price_type、price_value、currency、fetched_at。
- **フィルタ**: card_catalog_id / カード名、source_name、日付範囲、price_type。
- **操作**: 「価格を登録・取込」で `/prices/import` へ。

---

### 5.17 価格登録・取込 `app/(dashboard)/prices/import/page.tsx`（SCR-014）

- **表示**: 手動登録フォーム（card_catalog_id または serial_number、price_value、price_type、source_name、source_type、fetched_at）。CSV アップロード領域（フォーマット説明とサンプルリンク）。
- **操作**: 手動送信で `price_snapshots` に 1 件挿入。CSV アップロードでパースし、バリデーション後に一括挿入。成功件数・エラー行を表示。

---

### 5.18 設定 TOP `app/(dashboard)/settings/page.tsx`

- **表示**: 設定メニューカード。リンク: Shopify 連携（`/settings/shopify`）。将来: プロフィール、通知、権限等。

---

### 5.19 Shopify 連携 `app/(dashboard)/settings/shopify/page.tsx`（SCR-011）

- **表示**
  - 連携設定: Store URL、API トークン等の入力（マスク表示）。保存はサーバー側で環境変数または暗号化して DB に保存する設計を推奨。
  - 手動同期: 「商品・在庫を同期」「注文を取り込む」ボタン。
  - SyncJobs ログ: 直近 N 件を表で表示（job_type、started_at、status、processed_count、error_message）。
- **操作**: 同期ボタン押下で API Route または Server Action を呼び出し、バックエンドで Shopify API を実行。結果を SyncJobs に記録し、画面を更新または Realtime で反映。

---

## 6. 状態・エラー・読み込み

- **読み込み中**: 一覧はスケルトンまたはスピナー、詳細はページ全体またはブロック単位でスピナー。
- **エラー**: API/Supabase エラー時は**日本語**で Toast またはページ上部のアラートを表示。フォームバリデーションは**日本語**でインライン表示。
- **空状態**: 一覧 0 件時は EmptyState で**日本語**メッセージと次のアクションを表示。

---

## 7. レスポンシブ・アクセシビリティ

- **ブレークポイント**: 768px を境にサイドバーをドロワー化、テーブルは横スクロールまたはカード型に切替を検討。
- **アクセシビリティ**: フォームに label、ボタンに aria-label、エラーに aria-live。キーボード操作で全画面操作可能にすることを目標とする。

---

## 8. 改訂履歴

| 版 | 日付 | 変更内容 | 作成者 |
|----|------|----------|--------|
| 1.0 | 2025年2月 | 初版作成（Next.js App Router + Supabase、ページツリー、画面別要件） | — |
| 1.1 | 2025年2月 | 表示言語・ロケール（日本語担保）を追加。全UIテキスト・メッセージ・日付・数値・通貨を日本語前提に明記。共通コンポーネントの日本語ラベル・Toast例・CSVエクスポート（日本語ヘッダ）を追加。セクション番号を 2〜8 に繰り下げ。 | — |
