# UI/UX 全面改善計画

更新日: 2026-04-13  
対象: `app/web/` 全体（Next.js 15 / React 19 / Tailwind CSS 3.4）

---

## 0. コンポーネントライブラリ方針：shadcn/ui の採用

### 0.1 採用理由

本改善では **shadcn/ui** をコンポーネントの基盤として採用する。

| 観点 | shadcn/ui の利点 |
|------|----------------|
| 品質 | Radix UI プリミティブによるアクセシビリティ保証 |
| カスタマイズ性 | コードをプロジェクトに直接コピーするため自由に改変できる |
| 「AI らしさ」の排除 | 成熟した実装パターンによりデザインの素朴さが解消される |
| Tailwind との親和性 | CSS 変数 + Tailwind で既存スタイルと共存しやすい |
| サイドバー | `sidebar-07`（アイコン折りたたみ）が要件にそのまま合致する |

### 0.2 使用するブロック

- **Sidebar-07** — アイコンに折りたたみ可能なサイドバー  
  URL: https://ui.shadcn.com/blocks/sidebar#sidebar-07  
  特徴: アイコンのみモード / フル展開モードの切り替え、キーボードショートカット（Cmd+B）対応

- **Sidebar-08**（参考）— インセット型・セカンダリナビ付き  
  URL: https://ui.shadcn.com/blocks/sidebar#sidebar-08  
  → sidebar-07 を基本とし、必要に応じて sidebar-08 のセカンダリナビ構造を参考にする

### 0.3 セットアップコマンド

```bash
# 1. shadcn/ui を初期化（app/web/ で実行）
cd app/web
npx shadcn@latest init

# 2. 使用するコンポーネントを一括インストール
npx shadcn@latest add sidebar button card table tabs badge dialog
npx shadcn@latest add dropdown-menu tooltip avatar separator
npx shadcn@latest add input select textarea form label
npx shadcn@latest add alert progress skeleton

# 3. アイコンライブラリ（lucide-react は shadcn/ui と同梱されるが明示的に追加）
npm install lucide-react

# 4. グラフ
npm install recharts

# 5. 画像処理（OCR 移行で使用）
npm install sharp

# 6. shadcn/ui の skill を Claude Code にインストール（推奨）
#    これにより Claude が components.json を読んでコードを正確に生成できる
pnpm dlx skills add shadcn/ui
# または
npx skills add shadcn/ui
```

### 0.4 既存コンポーネントとの関係

| 既存ファイル | 移行方針 |
|------------|---------|
| `components/ui/button.tsx` | shadcn/ui の `Button` に置き換え |
| `components/ui/card.tsx` | shadcn/ui の `Card` に置き換え |
| `components/ui/table.tsx` | shadcn/ui の `Table` に置き換え |
| `components/ui/status-badge.tsx` | shadcn/ui の `Badge` をベースに色バリアント追加 |
| `components/dashboard/sidebar.tsx` | sidebar-07 ブロックに全面置き換え |

---

## 1. 現状課題の整理

現在の UI が「AI 生成らしい」と感じられる主な原因を 7 項目に分類する。

| # | 領域 | 問題 |
|---|------|------|
| 1 | ナビゲーション | アイコンがなくテキストのみ。グループ境界が薄い |
| 2 | ブランド・カラー | `slate/blue` の汎用 Tailwind 配色のみ。業種の個性がない |
| 3 | ダッシュボード | KPI 4 枚 + リンク集のみ。グラフなし。ページ下半分が空白 |
| 4 | 情報密度 | テーブル一辺倒。カード画像を活用するビューがない |
| 5 | 空白感 | コンテンツが少なく余白が目立ち、未完成感がある |
| 6 | アクション設計 | CTA が弱く「次に何をすべきか」が不明瞭 |
| 7 | タイポグラフィ | 見出し・本文・ラベルのウェイト差が小さく単調 |

---

## 2. デザイン方針

### 2.1 コンセプト

> **「プロのカード業者が毎日使いたい、道具感のある管理画面」**

- 派手さより実用性。情報へのアクセスが速い
- カード（物理的なポケモンカード）を中心に据えたビジュアル設計
- 白を基調にしつつ、ダークな差し色でカード業界らしい重厚感を出す

### 2.2 カラーパレット再定義

現在の `bg-blue-600` 系からブランド固有のカラーシステムへ移行する。

```css
/* tailwind.config.ts の extend.colors に追加 */
colors: {
  brand: {
    50:  '#f0f4ff',
    100: '#e0e9ff',
    200: '#c1d3fe',
    300: '#93b4fd',
    400: '#608bfa',
    500: '#3b63f7',
    600: '#2445ec',   /* primary action */
    700: '#1c34d1',
    800: '#1e2da8',
    900: '#1e2c84',
    950: '#161c52',   /* sidebar background */
  },
  surface: {
    DEFAULT: '#f8f7f4',  /* warm off-white: bg-surface */
    card:    '#ffffff',
    muted:   '#f1f0ed',
  },
  ink: {
    DEFAULT: '#18181b',  /* 本文 */
    secondary: '#52525b',
    tertiary:  '#a1a1aa',
  },
}
```

**採用理由**
- `brand-950`（深紺）のサイドバーは「道具感」を演出し、カードコレクション系ツールらしい重厚さを与える
- `surface` のウォームオフホワイトは `bg-slate-50` より紙に近く、カード管理という業務に合う
- `brand-600` を primary として、現在の `blue-600` の置き換えは最小限の差し替えで済む

### 2.3 タイポグラフィスケール

```
ページタイトル:   text-2xl font-bold tracking-tight   (現在と同じ)
セクション見出し: text-base font-semibold              (現在より太く)
カード見出し:     text-sm font-semibold                (現在 font-medium)
ラベル/キャプション: text-xs font-medium uppercase tracking-widest text-ink-tertiary
本文:            text-sm text-ink-secondary
データ値:        text-sm font-medium text-ink
数値強調:        text-2xl font-bold tabular-nums
```

### 2.4 アイコンシステム

パッケージ: `lucide-react`（MIT ライセンス、Next.js との相性が良い）

```bash
npm install lucide-react
```

ナビゲーション対応アイコン:

| メニュー項目 | lucide-react アイコン |
|------------|----------------------|
| ダッシュボード | `LayoutDashboard` |
| 登録待ち | `ScanLine` |
| カード種別 | `Library` |
| セット | `Package` |
| 棚・保管 | `Warehouse` |
| 在庫 | `Boxes` |
| 出品 | `Tag` |
| 注文 | `ShoppingCart` |
| 設定 | `Settings` |

ページ内アクションアイコン:

| アクション | アイコン |
|-----------|---------|
| 一括取り込み | `Upload` |
| 承認 | `CheckCircle` |
| 却下 | `XCircle` |
| 編集 | `Pencil` |
| 検索 | `Search` |
| フィルター | `Filter` |
| テーブル表示 | `List` |
| グリッド表示 | `LayoutGrid` |
| 詳細表示 | `ChevronRight` |
| 並び替え | `ArrowUpDown` |
| エラー | `AlertCircle` |
| 成功 | `CheckCircle2` |

---

## 3. フェーズ別実装計画

### Phase 1 — shadcn/ui 導入 & デザインシステム基盤

**対象ファイル**

```
app/web/
  components.json             ← shadcn/ui 設定（init で自動生成）
  tailwind.config.ts          ← brand / surface / ink カラー追加
  app/globals.css             ← shadcn/ui CSS 変数 + 独自変数の共存
  components/ui/              ← shadcn/ui が生成するコンポーネント群
  components/ui/status-badge.tsx ← 既存維持（Badge の上にラッパー）
```

**実行手順**

```bash
cd app/web

# Step 1: shadcn/ui 初期化
#   - Style: Default（Zinc ベース → 後で CSS 変数をブランドカラーに上書き）
#   - TypeScript: Yes
#   - Tailwind config: tailwind.config.ts
#   - Components alias: @/components
#   - Utils alias: @/lib/utils
npx shadcn@latest init

# Step 2: 必要コンポーネントを一括追加
npx shadcn@latest add sidebar button card table tabs badge dialog
npx shadcn@latest add dropdown-menu tooltip avatar separator
npx shadcn@latest add input select textarea form label
npx shadcn@latest add alert progress skeleton breadcrumb

# Step 3: アイコン・グラフ
npm install lucide-react recharts
```

**CSS 変数のブランドカラー上書き（`app/globals.css`）**

shadcn/ui が生成する `:root` 変数を、プロジェクトのカラーパレットに合わせて更新する。

```css
@layer base {
  :root {
    /* shadcn/ui の --primary をブランドカラーで上書き */
    --primary: 231 75% 60%;          /* brand-600 相当 */
    --primary-foreground: 0 0% 100%;

    /* サイドバー（shadcn/ui v2 の sidebar 変数） */
    --sidebar-background: 231 40% 10%;   /* brand-950 相当（深紺） */
    --sidebar-foreground: 220 20% 85%;
    --sidebar-primary: 231 75% 65%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 231 35% 18%;
    --sidebar-accent-foreground: 220 20% 90%;
    --sidebar-border: 231 30% 18%;
    --sidebar-ring: 231 75% 60%;

    /* 背景をウォームオフホワイトに */
    --background: 45 20% 97%;       /* surface (#f8f7f4 相当) */
    --card: 0 0% 100%;
  }

  .dark {
    /* ダークモード（将来対応）*/
    --sidebar-background: 231 40% 7%;
  }
}
```

**既存コンポーネントの移行**

| 既存 | 移行後 |
|------|--------|
| `components/ui/button.tsx` | shadcn/ui `Button`（上書き） |
| `components/ui/card.tsx` | shadcn/ui `Card`（上書き） |
| `components/ui/table.tsx` | shadcn/ui `Table`（上書き） |
| `components/ui/status-badge.tsx` | shadcn/ui `Badge` をラップして色バリアントを追加 |

**受け入れ基準**

- `components.json` が生成されている
- `npx shadcn@latest add` でコンポーネントが追加できる
- `npm run build` が通る
- 既存ページで視覚的な退行がない
- CSS 変数がブランドカラーで正しく上書きされている

---

### Phase 2 — サイドバー & レイアウト刷新（shadcn/ui sidebar-07 ベース）

**対象ファイル**

```
app/web/
  components/app-sidebar.tsx           ← sidebar-07 ブロックをベースに新規作成
  components/nav-main.tsx              ← sidebar-07 の nav-main をカスタマイズ
  components/nav-user.tsx              ← sidebar-07 の nav-user をカスタマイズ
  app/(dashboard)/layout.tsx           ← SidebarProvider でラップ + トップバー追加
  components/dashboard/topbar.tsx      ← 新規作成（SidebarTrigger + Breadcrumb）
  components/dashboard/sidebar.tsx     ← 削除（app-sidebar.tsx に置き換え）
```

**sidebar-07 ブロックの取得**

```bash
# shadcn/ui の sidebar-07 ブロック一式を取得
npx shadcn@latest add "https://ui.shadcn.com/r/sidebar-07"
# または手動で blocks のコードをコピーして各ファイルを作成
```

**サイドバー仕様（sidebar-07 カスタマイズ）**

```
┌─────────────────────────┐
│  [CreditCard] Poketre   │  ← SidebarHeader: CSS変数でダーク背景
├─────────────────────────┤
│  概要                   │  ← SidebarGroup + SidebarGroupLabel
│  [LayoutDashboard]      │
│    ダッシュボード        │  ← SidebarMenuButton（アクティブ判定あり）
├─────────────────────────┤
│  受け入れ               │
│  [ScanLine] 登録待ち [3]│  ← SidebarMenuBadge で件数表示
├─────────────────────────┤
│  マスタ                 │
│  [Library]  カード種別  │
│  [Package]  セット      │
│  [Warehouse] 棚・保管   │
├─────────────────────────┤
│  在庫・販売             │
│  [Boxes] 在庫           │
│  [Tag]   出品           │
│  [ShoppingCart] 注文    │
├─────────────────────────┤
│  システム               │
│  [Settings] 設定        │
├─────────────────────────┤
│ [avatar] ユーザー名 ▾  │  ← nav-user: DropdownMenu でログアウト
└─────────────────────────┘

折りたたみ時（icon モード）:
┌──┐
│[icon]│  ← Tooltip でホバー時にラベル表示
│[icon]│
│ ...  │
└──┘
```

**`app-sidebar.tsx` のナビゲーション定義**

```ts
const navItems = [
  {
    group: '概要',
    items: [
      { title: 'ダッシュボード', url: '/', icon: LayoutDashboard },
    ],
  },
  {
    group: '受け入れ',
    items: [
      { title: '登録待ち', url: '/staging', icon: ScanLine, badge: pendingCount },
    ],
  },
  {
    group: 'マスタ',
    items: [
      { title: 'カード種別', url: '/cards', icon: Library },
      { title: 'セット',     url: '/sets',  icon: Package },
      { title: '棚・保管',   url: '/locations', icon: Warehouse },
    ],
  },
  {
    group: '在庫・販売',
    items: [
      { title: '在庫', url: '/inventory', icon: Boxes },
      { title: '出品', url: '/listings',  icon: Tag },
      { title: '注文', url: '/orders',    icon: ShoppingCart },
    ],
  },
  {
    group: 'システム',
    items: [
      { title: '設定', url: '/settings', icon: Settings },
    ],
  },
];
```

**トップバー仕様（shadcn/ui SidebarTrigger + Breadcrumb コンポーネント使用）**

```tsx
// components/dashboard/topbar.tsx
<header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
  <SidebarTrigger className="-ml-1" />
  <Separator orientation="vertical" className="mr-2 h-4" />
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem>...</BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
  <div className="ml-auto text-xs text-muted-foreground">
    {/* 今日の日付 */}
  </div>
</header>
```

**`app/(dashboard)/layout.tsx` の構造**

```tsx
<SidebarProvider>
  <AppSidebar pendingCount={pendingCount} user={user} />
  <SidebarInset>
    <Topbar />           {/* SidebarTrigger + Breadcrumb */}
    <DemoBanner />
    <main className="flex-1 p-6">
      <div className="mx-auto max-w-7xl">
        {children}
      </div>
    </main>
  </SidebarInset>
</SidebarProvider>
```

**受け入れ基準**

- sidebar-07 ベースのサイドバーがダーク背景で表示される
- Cmd+B（Mac）/ Ctrl+B（Windows）でアイコン折りたたみが動作する
- アイコンのみ表示時に Tooltip でナビ名が表示される
- 登録待ち件数バッジが動的に表示される
- Breadcrumb が各ページのパスを表示する
- モバイルではドロワー形式で表示される（shadcn/ui sidebar の標準挙動）

---

### Phase 3 — ダッシュボード強化

**対象ファイル**

```
app/web/
  app/(dashboard)/page.tsx              ← 全面改善
  components/dashboard/kpi-card.tsx     ← 新規作成
  components/dashboard/sales-chart.tsx  ← 新規作成（recharts）
  components/dashboard/activity-feed.tsx ← 新規作成
  components/dashboard/quick-actions.tsx ← 新規作成
```

追加パッケージ: `recharts`

```bash
npm install recharts
```

**ページレイアウト**

```
[トップバー]
────────────────────────────────────────────────
  ダッシュボード                   2026-04-13 月

  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ 登録待ち  │ │ 総在庫    │ │ 今月売上  │ │ 連携エラー│
  │  3 件    │ │  128 点  │ │ ¥82,300  │ │   0      │
  │ [icon]  ↑│ │ ¥45,600  │ │ ↑12%先月比│ │ 正常稼働  │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘

  ┌──────────────────────────────┐ ┌────────────────┐
  │ 売上推移（過去 30 日）        │ │ クイックアクション│
  │                              │ │                │
  │  recharts AreaChart          │ │ [icon] 画像を   │
  │                              │ │       スキャン  │
  │                              │ │ [icon] 在庫を   │
  └──────────────────────────────┘ │       確認     │
                                   │ [icon] 出品を   │
  ┌──────────────────────────────┐ │       作成     │
  │ 最近の登録待ち（要確認）      │ └────────────────┘
  │                              │
  │ [画像] BW-060 SR ピカチュウ   │
  │          OCR完了  → 確認へ > │
  │ [画像] XY-087 RR ミュウ      │
  │          OCR完了  → 確認へ > │
  └──────────────────────────────┘
```

**KPI カード仕様**

- コンテナ: `rounded-xl border border-slate-200 bg-surface-card p-5 shadow-sm`
- ラベル: `text-xs font-semibold uppercase tracking-widest text-ink-tertiary`
- 値: `mt-2 text-3xl font-bold tabular-nums text-ink`
- トレンド（前月比）: `mt-1 flex items-center gap-1 text-xs`
  - 増加: `text-emerald-600` + `TrendingUp` アイコン
  - 減少: `text-red-500` + `TrendingDown` アイコン
- アイコン（右上）: `w-8 h-8 text-brand-300`

**売上チャート仕様**

- ライブラリ: `recharts` の `AreaChart`
- データ: `/api/dashboard/sales-trend`（新規 API、直近 30 日の日次売上）
- 色: `fill-brand-100 stroke-brand-600`
- `"use client"` コンポーネント（recharts は CSR）
- ローディング: Skeleton UI（`animate-pulse bg-slate-100 rounded-xl`）

**最近の登録待ちフィード仕様**

- `listPendingStaging(5)` の結果を表示（最新 5 件）
- 各行: 画像サムネイル（`h-10 w-8 object-cover rounded`）+ カード名 + OCR ステータスバッジ + 「確認へ」リンク
- 件数が 0 の場合: 「登録待ちの候補はありません」＋「取り込みを開始」ボタン

**受け入れ基準**

- KPI 4 枚が新デザインで表示される
- `recharts` チャートが demo データで表示される
- 最近の登録待ちが最大 5 件表示される
- クイックアクションから各ページへ遷移できる

---

### Phase 4 — カード種別ページ改善

**対象ファイル**

```
app/web/
  app/(dashboard)/cards/page.tsx        ← グリッド/テーブル切り替え追加
  components/cards/card-grid-view.tsx   ← 新規作成
  components/cards/card-grid-item.tsx   ← 新規作成
  components/cards/view-toggle.tsx      ← 新規作成（"use client"）
```

**グリッドビュー仕様**

```
フィルターバー
[セット: 全て ▼] [レアリティ: 全て ▼] [種別: 全て ▼]  [テーブル][グリッド]

グリッド（lg:grid-cols-5 md:grid-cols-4 sm:grid-cols-3 grid-cols-2）:

┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ [画像]   │ │ [画像]   │ │ [画像]   │ │ [画像]   │ │ [画像]   │
│         │ │         │ │         │ │         │ │         │
│ ピカチュウ│ │ リザードン│ │  ミュウ  │ │ カビゴン  │ │ ルカリオ │
│ SR      │ │ RR      │ │ UR      │ │ SR      │ │ CSR     │
│在庫 3点  │ │ 在庫 1点 │ │ 在庫なし │ │ 在庫 5点 │ │ 在庫 2点 │
└─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

**カードグリッドアイテム仕様**

- コンテナ: `group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface-card shadow-sm transition hover:border-brand-400 hover:shadow-md`
- 画像エリア: `relative aspect-[3/4] w-full overflow-hidden bg-slate-100`
- 画像: `h-full w-full object-cover transition group-hover:scale-[1.03]`
- 画像なし時のフォールバック: カード ID からハッシュ生成し、グラデーション背景 + カード番号テキスト（既存の `InventoryTilePreview` と同様の手法）
- レアリティバッジ: 画像右上に絶対配置 `absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white`
- 在庫数バッジ: 画像左上（在庫 0 の場合は `bg-red-500`、それ以外は `bg-slate-900/70`）
- 情報エリア: `p-3 space-y-1`
  - カード名: `text-sm font-semibold text-ink leading-snug line-clamp-2`
  - セット + 番号: `text-xs text-ink-tertiary`
- ホバー時: 「詳細を見る」オーバーレイ（`opacity-0 group-hover:opacity-100 transition`）

**ビュー切り替え仕様（`view-toggle.tsx`）**

- ユーザーの選択を `localStorage` に永続化（`viewMode: "table" | "grid"`）
- URL パラメータ（`?view=grid`）でも制御可能
- ボタン: `[List アイコン テーブル] [LayoutGrid アイコン グリッド]`
- アクティブ: `bg-brand-600 text-white`、非アクティブ: `bg-white text-ink-secondary border border-slate-300`

**フィルターバー改善**

- 現在: テキスト UI
- 改善: `<select>` を見やすいセレクトボックスに統一。絞り込み中は件数を「XXX 件」と表示
- フィルターリセットボタン（`X` アイコン + 「フィルターをクリア」テキスト）

**受け入れ基準**

- テーブル ↔ グリッドの切り替えが動作する
- グリッドで画像が表示される（画像なしの場合はフォールバックが表示される）
- フィルターが正しく機能する
- 選択したビューモードが次回訪問時に保持される

---

### Phase 5 — 登録待ち（OCR レビュー）UX 改善

**対象ファイル**

```
app/web/
  app/(dashboard)/staging/page.tsx               ← スプリットレイアウト導入
  components/staging/staging-list-panel.tsx      ← 新規作成（カードリスト）
  components/staging/staging-review-panel.tsx    ← 新規作成（レビューパネル）
  components/staging/staging-card-item.tsx       ← 新規作成（リスト内の各行）
  components/staging/staging-confirm-form.tsx    ← 既存（パネル内に組み込み）
  app/(dashboard)/staging/import/page.tsx        ← ドラッグ&ドロップ対応
  components/staging/dropzone.tsx                ← 新規作成（"use client"）
```

**スプリットパネルレイアウト**

```
[一括取り込み] [登録待ち 3 件]

┌──────────────────────┬────────────────────────────────┐
│  カードリスト          │  レビューパネル（右側）           │
│  (w-80 固定)          │  (flex-1)                       │
│                       │                                 │
│  ┌────────────────┐   │  ┌──────┐ ┌─────────────────┐   │
│  │[img] BW-060 SR │ ← │  │      │ │ カード名         │  │
│  │  ピカチュウ    │   │  │ 画像  │ │ ピカチュウ       │  │
│  │  [完了]        │   │  │  大  │ │ セット: BW       │  │
│  └────────────────┘   │  │      │ │ 番号: 060       │  │
│  ┌────────────────┐   │  └──────┘ │ レアリティ: SR   │  │
│  │[img] XY-087 RR │   │           │ 種別: ポケモン   │  │
│  │  未確認         │   │           └─────────────────┘  │
│  └────────────────┘   │                                 │
│  ┌────────────────┐   │  [承認して次へ] [却下]           │
│  │[img] SM-001 UR │   │                                 │
│  └────────────────┘   │                                 │
└──────────────────────┴────────────────────────────────┘
```

- 左パネル: `w-80 shrink-0 border-r border-slate-200 overflow-y-auto`
- 右パネル: `flex-1 overflow-y-auto p-6`
- 選択状態の同期は `useState` (client component) または URL パラメータ（`?id=stg_xxx`）
- モバイルではスタックレイアウト（左パネルが上、右パネルが下）

**カードリストアイテム仕様**

- コンテナ: `flex items-center gap-3 px-3 py-3 cursor-pointer border-l-2 transition`
  - 選択中: `border-l-brand-600 bg-brand-50`
  - 未選択: `border-l-transparent hover:bg-slate-50`
- サムネイル: `w-10 h-14 rounded object-cover bg-slate-100`
- カード名: `text-sm font-medium text-ink line-clamp-1`
- サブ情報: `text-xs text-ink-tertiary`（セット + レアリティ）
- OCR ステータスバッジ: 右端に小サイズバッジ

**一括取り込みページ改善（ドラッグ&ドロップ）**

現在の `<input type="file">` をドラッグ&ドロップゾーンに変更:

```
┌────────────────────────────────────────────────────┐
│                                                    │
│           [Upload アイコン（大）]                    │
│     ここにファイルをドロップ、またはクリックして選択   │
│          JPEG / PNG 対応（最大 50 枚）               │
│                                                    │
└────────────────────────────────────────────────────┘

選択済みファイル（3 件）:
  [img-thumbnail] IMG_001.jpg    1.2 MB  [X]
  [img-thumbnail] IMG_002.jpg    0.9 MB  [X]
  [img-thumbnail] IMG_003.jpg    1.5 MB  [X]

保管場所コード: [____-___-___]

[アップロードして OCR を開始]
```

- ドラッグ中: `border-brand-500 bg-brand-50`（ドロップゾーンの強調）
- ファイルリストはサムネイルプレビュー付き
- 個別削除ボタン（`X` アイコン）
- 進捗表示: ファイルごとの ProgressBar

**受け入れ基準**

- スプリットパネルでカードを選択するとレビューパネルが切り替わる
- ドラッグ&ドロップで複数ファイルを選択できる
- ファイルのサムネイルプレビューが表示される
- 承認 / 却下後に次のカードへ自動スクロール

---

### Phase 6 — 在庫・出品ページ改善

**対象ファイル**

```
app/web/
  app/(dashboard)/inventory/page.tsx   ← ステータスタブ + フィルター改善
  app/(dashboard)/listings/page.tsx    ← チャネルタブ追加
  components/ui/tabs.tsx               ← 新規作成
```

**在庫ページのタブ**

```
[全て (128)] [在庫中 (85)] [出品中 (32)] [引当中 (8)] [売済 (3)]
```

- タブ選択で URL パラメータ（`?status=IN_STOCK`）を更新
- 各タブの件数はサーバーで集計して表示
- タブコンポーネント: `border-b border-slate-200` + アクティブは `border-b-2 border-brand-600 text-brand-700`

**フィルターサイドバー（在庫）**

現在のテーブル上部テキストフィルターを、折りたたみ可能なフィルターパネルへ:

```
[Filter アイコン フィルター] ← クリックでパネル展開/折りたたみ

展開時:
  セット: [select]
  レアリティ: [select]
  保管場所: [select]
  取得原価: [min] ~ [max]
  [適用] [クリア]
```

**出品ページのチャネルタブ**

```
[全て] [Shopify] [ヤフオク] [メルカリ] [その他]
```

**受け入れ基準**

- タブクリックでテーブルの表示内容が切り替わる
- URL パラメータにタブ状態が反映される（ブラウザバックで戻れる）
- フィルターパネルが正しく機能する

---

## 4. 実装ファイル一覧

### shadcn/ui が自動生成するファイル（`npx shadcn@latest add` 後）

```
components/ui/
  sidebar.tsx           ← Sidebar, SidebarProvider, SidebarMenu 等
  button.tsx            ← Button（既存を上書き）
  card.tsx              ← Card（既存を上書き）
  table.tsx             ← Table（既存を上書き）
  tabs.tsx              ← Tabs（新規）
  badge.tsx             ← Badge（新規、status-badge のベース）
  breadcrumb.tsx        ← Breadcrumb（新規）
  dialog.tsx            ← Dialog（新規）
  dropdown-menu.tsx     ← DropdownMenu（新規）
  tooltip.tsx           ← Tooltip（新規）
  avatar.tsx            ← Avatar（新規）
  separator.tsx         ← Separator（新規）
  input.tsx             ← Input（新規）
  select.tsx            ← Select（新規）
  textarea.tsx          ← Textarea（新規）
  form.tsx              ← Form（新規）
  label.tsx             ← Label（新規）
  alert.tsx             ← Alert（新規）
  progress.tsx          ← Progress（新規）
  skeleton.tsx          ← Skeleton（新規）
```

### 新規作成ファイル（プロジェクト固有）

| ファイルパス | 役割 |
|------------|------|
| `components/app-sidebar.tsx` | sidebar-07 ベースのサイドバー本体 |
| `components/nav-main.tsx` | ナビゲーション項目グループ |
| `components/nav-user.tsx` | ユーザー情報 + ログアウト |
| `components/dashboard/topbar.tsx` | SidebarTrigger + Breadcrumb + 日付 |
| `components/dashboard/kpi-card.tsx` | KPI カード（トレンド付き） |
| `components/dashboard/sales-chart.tsx` | recharts 売上グラフ（client） |
| `components/dashboard/activity-feed.tsx` | 最近の登録待ちフィード |
| `components/dashboard/quick-actions.tsx` | クイックアクションパネル |
| `components/cards/card-grid-view.tsx` | カードグリッドコンテナ |
| `components/cards/card-grid-item.tsx` | グリッドの各カードアイテム |
| `components/cards/view-toggle.tsx` | テーブル/グリッド切り替え（client） |
| `components/staging/staging-list-panel.tsx` | OCR レビューの左パネル |
| `components/staging/staging-review-panel.tsx` | OCR レビューの右パネル |
| `components/staging/staging-card-item.tsx` | リスト内の各行 |
| `components/staging/dropzone.tsx` | ドラッグ&ドロップゾーン（client） |
| `app/api/dashboard/sales-trend/route.ts` | 売上推移 API（recharts 用データ） |

### 変更ファイル

| ファイルパス | 変更内容 |
|------------|---------|
| `components.json` | shadcn/ui 設定（init で生成） |
| `tailwind.config.ts` | brand / surface カラー + shadcn/ui パス追加 |
| `app/globals.css` | shadcn/ui CSS 変数をブランドカラーで上書き |
| `components/ui/status-badge.tsx` | shadcn/ui `Badge` をラップするよう改修 |
| `app/(dashboard)/layout.tsx` | `SidebarProvider` + `SidebarInset` + `Topbar` 追加 |
| `app/(dashboard)/page.tsx` | ダッシュボード全面改善 |
| `app/(dashboard)/cards/page.tsx` | グリッド/テーブル切り替え |
| `app/(dashboard)/staging/page.tsx` | スプリットパネルレイアウト |
| `app/(dashboard)/staging/import/page.tsx` | ドラッグ&ドロップ対応 |
| `app/(dashboard)/inventory/page.tsx` | shadcn/ui `Tabs` ステータスタブ |
| `app/(dashboard)/listings/page.tsx` | shadcn/ui `Tabs` チャネルタブ |

### 削除ファイル

| ファイルパス | 理由 |
|------------|------|
| `components/dashboard/sidebar.tsx` | `components/app-sidebar.tsx` に置き換え |

---

## 5. 実装順序と工数目安

```
Day 1（Phase 1 + 2）:
  AM: tailwind.config 更新 + lucide-react インストール
  AM: button / card / table コンポーネント更新
  PM: sidebar 全面書き直し（ダーク + アイコン + バッジ）
  PM: layout.tsx にトップバー追加

Day 2（Phase 3）:
  AM: kpi-card, activity-feed, quick-actions コンポーネント作成
  AM: sales-trend API 作成
  PM: recharts 売上チャート実装
  PM: ダッシュボードページ組み立て

Day 3（Phase 4）:
  AM: card-grid-item, card-grid-view 作成
  AM: view-toggle（localStorage + URL param）実装
  PM: cards/page.tsx へのグリッドビュー統合
  PM: フィルターバー改善

Day 4（Phase 5）:
  AM: dropzone コンポーネント作成
  AM: staging/import/page.tsx 更新
  PM: staging-list-panel / staging-review-panel 作成
  PM: staging/page.tsx のスプリットレイアウト組み立て

Day 5（Phase 6 + 調整）:
  AM: tabs コンポーネント作成
  AM: inventory / listings ページにタブ追加
  PM: 全体通しでの動作確認
  PM: デモデータの更新・レイアウト微調整
```

---

## 6. 非機能要件

- **アクセシビリティ**: 既存の `aria-label` / `aria-invalid` を維持。アイコンのみのボタンには必ず `aria-label` を付与
- **パフォーマンス**: `recharts` は動的インポート（`next/dynamic`）でコード分割。グリッド画像は `next/image` へ移行を検討
- **デモモード維持**: 全ページでデモデータが引き続き表示されること
- **日本語表示**: Noto Sans JP は引き続き使用。フォントウェイト `400` / `500` / `700` を明示的にロード
- **後方互換**: URL 構造（`/cards`、`/staging/[id]` 等）は変更しない

---

## 7. 関連ドキュメント

- [ocr-nextjs-migration-plan.md](./ocr-nextjs-migration-plan.md) — OCR 処理の Python Cloud Run → Next.js 移行
- [roadmap.md](./roadmap.md) — プロジェクト全体フェーズ（本計画は フェーズ 4 に相当）
- [ocr-production-redesign.md](./ocr-production-redesign.md) — OCR 本番化の再設計（バックエンド側）
