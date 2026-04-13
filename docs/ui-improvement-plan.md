# UI/UX 改善計画

Pokemon カード管理システム Poketre の UI/UX を刷新し、業務システムとしての完成度を高める。
OCR 処理を Python Cloud Run から Next.js へ移行することで、インフラ構成も簡素化する。

---

## 現状の課題

| カテゴリ | 問題 |
|---------|------|
| ナビゲーション | アイコンなし・テキストのみ・ブランド感ゼロ |
| ダッシュボード | 数字 4 枚だけ・グラフなし・下半分が空白 |
| カラー設計 | 汎用 slate/blue のみ・カード業界らしさゼロ |
| 情報密度 | テーブル一辺倒・カードビューなし・画像活用なし |
| アクション | ボタン・CTA が弱く次の操作が直感的でない |
| タイポグラフィ | サイズ・ウェイトの体系がフラットで単調 |

---

## Phase 1 — デザインシステム基盤

**目標**: shadcn/ui 導入・ブランドカラー確立・共通コンポーネント整備

### 追加パッケージ

| パッケージ | 用途 |
|-----------|------|
| `shadcn` | UI コンポーネントライブラリ |
| `lucide-react` | アイコン |
| `recharts` | グラフ・チャート |
| `class-variance-authority` | バリアント管理 |
| `tailwind-merge` + `clsx` | Tailwind クラス合成 |

### カラーパレット

| トークン | 値 | 用途 |
|---------|-----|------|
| `--primary` | `hsl(232 84% 53%)` — #2445ec | プライマリアクション |
| `--background` | `hsl(40 27% 96%)` — #f8f7f4 | ページ背景 |
| `--sidebar-background` | `hsl(232 58% 20%)` — #161c52 | サイドバー背景（深紺） |
| `--sidebar-accent` | `hsl(232 45% 27%)` | サイドバーホバー |

### shadcn/ui 追加コンポーネント

`sidebar`, `button`, `card`, `badge`, `breadcrumb`, `dialog`, `dropdown-menu`,
`input`, `label`, `select`, `separator`, `sheet`, `skeleton`, `tabs`, `textarea`,
`tooltip`, `avatar`, `alert`

### 完了条件

- [ ] `components.json` 作成済み
- [ ] `globals.css` にブランドカラー CSS 変数が定義されている
- [ ] `tailwind.config.ts` にセマンティックカラーが登録されている
- [ ] `lib/utils.ts` に `cn()` 関数が存在する
- [ ] 上記パッケージがすべて `package.json` に記録されている

---

## Phase 2 — ナビゲーション & レイアウト

**目標**: サイドバーを shadcn Sidebar に置き換え、アイコン付きナビ + トップバーを実装

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `components/dashboard/app-sidebar.tsx` | 新規作成: Sidebar + NavMain + NavUser |
| `components/dashboard/nav-main.tsx` | 新規作成: アイコン付きナビグループ |
| `components/dashboard/nav-user.tsx` | 新規作成: ログアウトメニュー |
| `components/dashboard/topbar.tsx` | 新規作成: SidebarTrigger + Breadcrumb |
| `components/dashboard/sidebar.tsx` | 削除（app-sidebar.tsx に置き換え） |
| `app/(dashboard)/layout.tsx` | SidebarProvider でラップ |

### サイドバー構成

```
Sidebar (collapsible="icon", dark background)
  SidebarHeader
    Logo + "Poketre" / "カード管理"
  SidebarContent
    NavMain (グループ x 5)
      概要:       ダッシュボード (LayoutDashboard)
      受け入れ:   登録待ち (ScanLine) + 件数バッジ
      マスタ:     カード種別 (CreditCard)
                  セット (BookOpen)
                  棚番・保管 (Warehouse)
      在庫・販売: 在庫 (Package)
                  出品 (Tag)
                  注文 (ShoppingCart)
      システム:   設定 (Settings2)
  SidebarFooter
    NavUser: ログアウト (LogOut)
  SidebarRail  ← ホバーでリサイズ
```

### トップバー構成

```
header (h-12, border-b)
  SidebarTrigger
  Separator (vertical)
  Breadcrumb (pathname ベースで動的生成)
```

### ブレッドクラムマッピング

| パス | 表示 |
|-----|------|
| `/` | ダッシュボード |
| `/staging` | 登録待ち |
| `/staging/import` | 登録待ち / 一括取り込み |
| `/staging/[id]` | 登録待ち / 詳細 |
| `/cards` | カード種別 |
| `/cards/[id]` | カード種別 / 詳細 |
| `/sets` | セット |
| `/locations` | 棚番・保管 |
| `/inventory` | 在庫 |
| `/inventory/[id]` | 在庫 / 詳細 |
| `/listings` | 出品 |
| `/listings/new` | 出品 / 新規作成 |
| `/listings/[id]` | 出品 / 詳細 |
| `/orders` | 注文 |
| `/settings` | 設定 |
| `/settings/shopify` | 設定 / Shopify |

### 完了条件

- [ ] サイドバーにアイコンが表示される
- [ ] 登録待ちに件数バッジが表示される
- [ ] サイドバーがアイコンのみに折りたためる
- [ ] ブレッドクラムが現在のページを正しく表示する
- [ ] モバイルでシートメニューが開く

---

## Phase 3 — ダッシュボード強化

**目標**: KPI + グラフ + クイックアクション + 登録待ちプレビューで業務ハブ化

### レイアウト

```
[登録待ち] [総在庫] [今月売上] [連携エラー]   ← KPI 4 枚（トレンド表示追加）

[売上推移グラフ（過去 30 日）        ] [クイックアクション         ]
[  recharts BarChart                ] [  画像をスキャン            ]
[                                   ] [  在庫を確認               ]
[                                   ] [  出品を作成               ]

[最近の登録待ち（要確認アイテム）サムネイル付き一覧]
```

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `app/(dashboard)/page.tsx` | 全面リデザイン |
| `components/dashboard/sales-chart.tsx` | 新規作成: recharts BarChart |
| `components/dashboard/quick-actions.tsx` | 新規作成: CTAカード |
| `components/dashboard/staging-preview.tsx` | 新規作成: 要確認アイテム一覧 |

### 完了条件

- [ ] 売上グラフが表示される（デモデータ使用可）
- [ ] クイックアクションが機能する
- [ ] 登録待ちプレビューにサムネイルが表示される
- [ ] KPI にトレンド矢印が表示される

---

## Phase 4 — カード・在庫ページ改善

**目標**: カード画像を活かしたグリッドビュー + フィルター強化

### カード種別一覧

- テーブル / グリッド 切り替えトグル
- グリッド: カード画像 + 名前 + レアリティ + 在庫数
- フィルター: セット・レアリティ・種別

### 在庫ページ

- ステータス別タブ（全て / 在庫中 / 出品中 / 売済）
- フィルター強化（セット・保管場所・コンディション）

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `app/(dashboard)/cards/page.tsx` | グリッドビュー追加 |
| `components/cards/card-grid.tsx` | 新規作成 |
| `app/(dashboard)/inventory/page.tsx` | タブ + フィルター追加 |

### 完了条件

- [ ] カード種別でグリッド表示に切り替えられる
- [ ] 在庫ページにステータスタブがある

---

## Phase 5 — 登録待ち（OCRレビュー）UX 改善

**目標**: スプリットビューでサクサク承認できるワークフロー

### レイアウト

```
登録待ち 3件  [フィルター]

左ペイン (1/3): カードリスト
  [ ] [サムネ] BW-060 SR  OCR済  → クリックで右ペインに表示

右ペイン (2/3): レビューパネル
  [カード画像 大]
  ─────────────
  カード名:    ピカチュウ
  セット:      BW
  番号:        060
  レアリティ:  SR
  ─────────────
  [承認]  [却下]  [修正]
```

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `app/(dashboard)/staging/page.tsx` | スプリットビューに変更 |
| `components/staging/staging-review-panel.tsx` | 新規作成: レビューパネル |
| `components/staging/staging-card-list.tsx` | 新規作成: 左ペインリスト |

### 完了条件

- [ ] リスト選択でレビューパネルが更新される
- [ ] 承認・却下がワンクリックで完了する

---

## Phase 6 — OCR 処理の Next.js 移行

**目標**: Python Cloud Run を廃止し、Next.js API Route で OCR を完結させる

### 現行フロー

```
画像アップロード → GCS → Cloud Tasks → Python Cloud Run → Gemini API → PostgreSQL
                                         ↑ Google Drive/Sheets 経由もあり
```

### 移行後フロー

```
画像アップロード → Next.js /api/ocr/process → Gemini API (Vertex AI) → PostgreSQL
                    ↓
                  GCS (画像永続化のみ)
```

### 削除するもの

- Google Drive ポーリング
- Google Sheets 書き込み
- Python Cloud Run サービス (`cloud_run_service/`)
- Cloud Tasks キュー（同期処理化 or Next.js 内キュー）

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `app/api/ocr/process/route.ts` | OCR 実行本体（Gemini 呼び出し） |
| `app/api/ocr/status/[jobId]/route.ts` | ジョブ状態確認 |
| `lib/ocr/gemini.ts` | Vertex AI Gemini 呼び出しロジック |
| `lib/ocr/image-prep.ts` | 画像前処理（リサイズ・JPEG 変換） |
| `lib/ocr/prompt.ts` | プロンプト定義（Python 版から移植） |
| `lib/ocr/schema.ts` | OCR 結果型定義 |

### 技術的考慮事項

| 項目 | 現行 | 移行後 |
|------|------|--------|
| 実行環境 | Python 3.11 (Cloud Run) | Node.js 22 (Next.js API Route) |
| Gemini 呼び出し | Python `requests` | `@google-cloud/vertexai`（既存） |
| 画像変換 | Python Pillow | `sharp` パッケージ |
| デュアルモデル | あり（Primary/Secondary） | 維持 |
| 並列処理 | ThreadPoolExecutor (5 workers) | `Promise.all` |
| ロック機構 | Drive appProperties | `ocr_jobs.status`（DB） |
| リトライ | 指数バックオフ 3 回 | 同等ロジックを実装 |
| タイムアウト | 28 分 (Cloud Run) | Next.js maxDuration で制御 |

### 完了条件

- [ ] `/api/ocr/process` が画像を受け取り Gemini でカード情報を抽出できる
- [ ] 結果が `ocr_staging` テーブルに書き込まれる
- [ ] デュアルモデル（Primary/Fallback）が機能する
- [ ] エラー時に `ocr_jobs.status = FAILED` に更新される
- [ ] Python Cloud Run サービスなしでエンドツーエンドが動作する

---

## 実装スケジュール

| 日 | フェーズ | 主要成果物 |
|----|---------|-----------|
| Day 1 | Phase 1 + 2 | shadcn/ui 導入・ブランドカラー・サイドバー刷新 |
| Day 2 | Phase 3 | ダッシュボード強化（グラフ・クイックアクション） |
| Day 3 | Phase 6（BE） | OCR API Route 実装 |
| Day 4 | Phase 5 + 6（UI） | 登録待ちスプリットビュー・OCR UI 連携 |
| Day 5 | Phase 4 | カード・在庫ページ改善 |
| Day 6 | 統合テスト | E2E 動作確認・デモデータ更新 |
