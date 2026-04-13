/**
 * 倉庫棚の座標系（デモ・UI 共通の前提）
 * - 棚段 tier: 1, 2, …（上から / 手前からは現場で定義）
 * - 箱 box: その段に並ぶ 1 … BOXES_PER_TIER（例: 20）
 * - 列 col: 1 箱あたり COLUMNS_PER_BOX 列（例: 5）。同一列に在庫ラインを複数紐付け可（別束・別銘柄など）。
 *
 * コード表記: "tier-box-col" 例 "1-12-3" = 棚1段・12番箱・3列目
 */

/** 棚の「段」の数。増やすと画面では上から順にブロックが縦に積み上がる（横並びにはしない）。 */
export const STORAGE_TIERS = 2;
export const STORAGE_BOXES_PER_TIER = 20;
export const STORAGE_COLUMNS_PER_BOX = 5;

export function formatLocationCode(tier: number, box: number, col: number): string {
  return `${tier}-${box}-${col}`;
}

export function parseLocationCode(code: string): { tier: number; box: number; col: number } | null {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(code.trim());
  if (!m) return null;
  return {
    tier: Number(m[1]),
    box: Number(m[2]),
    col: Number(m[3]),
  };
}

export function clampTier(t: number): number {
  return Math.min(Math.max(Math.floor(t) || 1, 1), STORAGE_TIERS);
}

export function clampBox(b: number): number {
  return Math.min(Math.max(Math.floor(b) || 1, 1), STORAGE_BOXES_PER_TIER);
}

export function locationCodeLabel(code: string): string {
  const p = parseLocationCode(code);
  if (!p) return code;
  return `棚${p.tier}・箱${p.box}・列${p.col}（${code}）`;
}

export function locationsPageHrefForCode(code: string): string | null {
  const p = parseLocationCode(code);
  if (!p) return null;
  return `/locations?tier=${p.tier}&box=${p.box}#box-detail`;
}
