/**
 * デモモード用のダミーデータ。
 * Supabase 未接続時に一覧・詳細の確認ができるようにする。
 */

export type DemoStagingRow = {
  id: string;
  serial_number: string;
  name_ja: string;
  set_code: string;
  rarity: string;
  qty: number;
  image_url: string | null;
  card_number_text?: string;
  card_type?: string;
};

export type DemoCardRow = {
  id: string;
  serial_number: string;
  name_ja: string;
  set_code: string;
  card_number: string;
  rarity: string;
  card_type: string;
  stock_count: number;
  listed_count: number;
  /** マスタ紹介文（cards.public_description_ja 相当） */
  public_description_ja?: string | null;
};

export type DemoSetRow = {
  id: string;
  set_code: string;
  set_name_ja: string;
  series: string;
  release_date: string;
  total_cards: number;
  regulation_set: string;
};

/** location_code: 棚段-箱番号-列（例 1-12-3）— lib/storage-layout.ts 参照 */
export type DemoInventoryRow = {
  id: string;
  type: "UNIT" | "LOT";
  serial_number: string;
  name_ja: string;
  condition_grade: string;
  /** 座標 "tier-box-col" */
  location_code: string;
  /** 一覧用の表示名 */
  location_name: string;
  qty: number;
  status: string;
  acquisition_cost: number | null;
};

export type DemoListingRow = {
  id: string;
  channel: string;
  serial_number: string;
  name_ja: string;
  list_qty: number;
  price: number;
  status: string;
  sync_status: string;
  published_at: string | null;
};

export type DemoOrderRow = {
  id: string;
  channel: string;
  external_order_id: string;
  ordered_at: string;
  card_summary: string;
  qty: number;
  sold_price: number;
  import_status: string;
};

// --- 登録待ち ---
const DEMO_STAGING: DemoStagingRow[] = [
  {
    id: "demo-1",
    serial_number: "SV8_100/106",
    name_ja: "リリバのみ",
    set_code: "SV8",
    rarity: "レア",
    qty: 1,
    image_url: null,
    card_number_text: "100/106",
    card_type: "ポケモン",
  },
  {
    id: "demo-2",
    serial_number: "SV4a_001/165",
    name_ja: "ピカチュウ",
    set_code: "SV4a",
    rarity: "コモン",
    qty: 3,
    image_url: null,
    card_number_text: "001/165",
    card_type: "ポケモン",
  },
  {
    id: "demo-3",
    serial_number: "SV2_050/078",
    name_ja: "カイリューex",
    set_code: "SV2",
    rarity: "二レア",
    qty: 1,
    image_url: null,
    card_number_text: "050/078",
    card_type: "ポケモン",
  },
];

export function getDemoStagingList(): DemoStagingRow[] {
  return [...DEMO_STAGING];
}

export function getDemoStagingDetail(id: string): DemoStagingRow | null {
  return DEMO_STAGING.find((r) => r.id === id) ?? null;
}

export function isDemoStagingId(id: string): boolean {
  return id.startsWith("demo-");
}

// --- ダッシュボード KPI ---
export function getDemoDashboardKpis() {
  return {
    stagingCount: 3,
    totalStock: 128,
    stockValue: 45600,
    monthlySales: 82300,
    prevMonthlySales: 73800,
    syncErrors: 0,
  };
}

// --- 売上チャートデータ（過去 30 日・決定的生成） ---
export type SalesChartPoint = { date: string; sales: number };

export function getDemoSalesChart(): SalesChartPoint[] {
  const dailySales = [
    2800, 5200, 3100,    0, 8400, 6200, 4500,
    3200, 7800, 5500, 2100, 9200, 4800, 6100,
    3500, 5900, 8200, 4300, 7100, 5600, 2900,
    8800, 6400, 3700, 5100, 9500, 7200, 4600,
    6800, 5300,
  ];
  // 固定基準日（2026-04-13）でデモデータを生成
  const base = new Date(2026, 3, 13);
  return dailySales.map((sales, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() - (29 - i));
    return { date: `${d.getMonth() + 1}/${d.getDate()}`, sales };
  });
}

// --- カード種別 ---
const DEMO_CARDS: DemoCardRow[] = [
  {
    id: "cat-1",
    serial_number: "SV8_100/106",
    name_ja: "リリバのみ",
    set_code: "SV8",
    card_number: "100/106",
    rarity: "レア",
    card_type: "ポケモン",
    stock_count: 2,
    listed_count: 1,
    public_description_ja:
      "夜空の流れ星収録のリリバのみです。状態は写真にてご確認ください。プレイ用・コレクション用としてどうぞ。",
  },
  {
    id: "cat-2",
    serial_number: "SV4a_001/165",
    name_ja: "ピカチュウ",
    set_code: "SV4a",
    card_number: "001/165",
    rarity: "コモン",
    card_type: "ポケモン",
    stock_count: 15,
    listed_count: 5,
    public_description_ja: "パラドックスリフトのピカチュウ（コモン）です。複数在庫あり、状態は個体により差があります。",
  },
  { id: "cat-3", serial_number: "SV2_050/078", name_ja: "カイリューex", set_code: "SV2", card_number: "050/078", rarity: "二レア", card_type: "ポケモン", stock_count: 1, listed_count: 0 },
  { id: "cat-4", serial_number: "OBF_151/165", name_ja: "カードを探すイーブイ", set_code: "OBF", card_number: "151/165", rarity: "コモン", card_type: "ポケモン", stock_count: 8, listed_count: 2 },
];

export function getDemoCards(): DemoCardRow[] {
  return [...DEMO_CARDS];
}

export function getDemoCardDetail(id: string): DemoCardRow | null {
  return DEMO_CARDS.find((r) => r.id === id) ?? null;
}

// --- セット ---
const DEMO_SETS: DemoSetRow[] = [
  { id: "set-1", set_code: "SV8", set_name_ja: "夜空の流れ星", series: "スカーレット&バイオレット", release_date: "2025-01-17", total_cards: 106, regulation_set: "G" },
  { id: "set-2", set_code: "SV4a", set_name_ja: "パラドックスリフト", series: "スカーレット&バイオレット", release_date: "2024-03-22", total_cards: 165, regulation_set: "G" },
  { id: "set-3", set_code: "SV2", set_name_ja: "パルデアの可能性", series: "スカーレット&バイオレット", release_date: "2023-04-14", total_cards: 78, regulation_set: "G" },
  { id: "set-4", set_code: "OBF", set_name_ja: "151", series: "スカーレット&バイオレット", release_date: "2023-06-16", total_cards: 165, regulation_set: "G" },
];

export function getDemoSets(): DemoSetRow[] {
  return [...DEMO_SETS];
}

// --- 在庫（座標は 棚段-箱(1..20)-列(1..5)）---
const DEMO_INVENTORY: DemoInventoryRow[] = [
  {
    id: "inv-u-3",
    type: "UNIT",
    serial_number: "SV2_050/078",
    name_ja: "カイリューex",
    condition_grade: "S",
    location_code: "1-1-1",
    location_name: "1-1-1（棚1・箱1・列1）",
    qty: 1,
    status: "在庫",
    acquisition_cost: 3500,
  },
  {
    id: "inv-u-1",
    type: "UNIT",
    serial_number: "SV8_100/106",
    name_ja: "リリバのみ",
    condition_grade: "A",
    location_code: "1-2-1",
    location_name: "1-2-1（棚1・箱2・列1）",
    qty: 1,
    status: "在庫",
    acquisition_cost: 1200,
  },
  {
    id: "inv-u-4",
    type: "UNIT",
    serial_number: "OBF_151/165",
    name_ja: "カードを探すイーブイ",
    condition_grade: "A",
    location_code: "1-2-1",
    location_name: "1-2-1（棚1・箱2・列1）",
    qty: 1,
    status: "在庫",
    acquisition_cost: 400,
  },
  {
    id: "inv-u-5",
    type: "UNIT",
    serial_number: "SV4a_001/165",
    name_ja: "ピカチュウ",
    condition_grade: "B",
    location_code: "1-2-1",
    location_name: "1-2-1（棚1・箱2・列1）",
    qty: 1,
    status: "在庫",
    acquisition_cost: 150,
  },
  {
    id: "inv-u-2",
    type: "UNIT",
    serial_number: "SV8_100/106",
    name_ja: "リリバのみ",
    condition_grade: "B",
    location_code: "1-2-3",
    location_name: "1-2-3（棚1・箱2・列3）",
    qty: 1,
    status: "出品中",
    acquisition_cost: 800,
  },
  {
    id: "inv-l-1",
    type: "LOT",
    serial_number: "SV4a_001/165",
    name_ja: "ピカチュウ",
    condition_grade: "C",
    location_code: "2-1-1",
    location_name: "2-1-1（棚2・箱1・列1）",
    qty: 15,
    status: "在庫",
    acquisition_cost: null,
  },
];

export function getDemoInventory(): DemoInventoryRow[] {
  return [...DEMO_INVENTORY];
}

export function getDemoInventoryDetail(id: string): DemoInventoryRow | null {
  return DEMO_INVENTORY.find((r) => r.id === id) ?? null;
}

/** 指定棚段・箱に入っている在庫（全列まとめて） */
export function getDemoInventoryInBox(tier: number, box: number): DemoInventoryRow[] {
  const prefix = `${tier}-${box}-`;
  return DEMO_INVENTORY.filter((inv) => inv.location_code.startsWith(prefix));
}

/** 箱内を列ごとに分けた配列（列 1..5） */
export function getDemoInventoryByColumnsInBox(
  tier: number,
  box: number
): DemoInventoryRow[][] {
  const byCol: DemoInventoryRow[][] = [[], [], [], [], []];
  for (const inv of getDemoInventoryInBox(tier, box)) {
    const parts = inv.location_code.split("-");
    const col = Number(parts[2]);
    if (col >= 1 && col <= 5) {
      byCol[col - 1].push(inv);
    }
  }
  for (const col of byCol) {
    col.sort((a, b) => a.serial_number.localeCompare(b.serial_number, "ja"));
  }
  return byCol;
}

/** 各箱の在庫ライン数（グリッドのバッジ用） */
export function getDemoBoxOccupancyCounts(): Map<string, number> {
  const m = new Map<string, number>();
  for (const inv of DEMO_INVENTORY) {
    const p = inv.location_code.split("-");
    if (p.length < 2) continue;
    const key = `${p[0]}-${p[1]}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

/** 登録待ちのサムネなど、同一識別子の画像 URL（なければ null） */
export function getDemoImageUrlBySerial(serial: string): string | null {
  const s = DEMO_STAGING.find((r) => r.serial_number === serial);
  return s?.image_url ?? null;
}

export function countDemoCardsInSet(setCode: string): number {
  return DEMO_CARDS.filter((c) => c.set_code === setCode).length;
}

// --- 出品（channel_listings デモ） ---
const DEMO_LISTINGS: DemoListingRow[] = [
  { id: "lst-1", channel: "Shopify", serial_number: "SV8_100/106", name_ja: "リリバのみ", list_qty: 1, price: 1500, status: "出品中", sync_status: "同期済", published_at: "2025-02-01" },
  { id: "lst-2", channel: "ヤフオク", serial_number: "SV4a_001/165", name_ja: "ピカチュウ", list_qty: 5, price: 100, status: "出品中", sync_status: "手動管理", published_at: "2025-02-10" },
  { id: "lst-3", channel: "メルカリ", serial_number: "OBF_151/165", name_ja: "カードを探すイーブイ", list_qty: 2, price: 80, status: "出品中", sync_status: "手動管理", published_at: null },
];

export function getDemoListings(): DemoListingRow[] {
  return [...DEMO_LISTINGS];
}

export function getDemoListingDetail(id: string): DemoListingRow | null {
  return DEMO_LISTINGS.find((r) => r.id === id) ?? null;
}

// --- 注文 ---
const DEMO_ORDERS: DemoOrderRow[] = [
  { id: "ord-1", channel: "Shopify", external_order_id: "#1001", ordered_at: "2025-02-28 10:30", card_summary: "リリバのみ × 1", qty: 1, sold_price: 1400, import_status: "取り込み済" },
  { id: "ord-2", channel: "ヤフオク", external_order_id: "n12345678", ordered_at: "2025-02-27 20:15", card_summary: "ピカチュウ × 3", qty: 3, sold_price: 280, import_status: "手動登録" },
];

export function getDemoOrders(): DemoOrderRow[] {
  return [...DEMO_ORDERS];
}
