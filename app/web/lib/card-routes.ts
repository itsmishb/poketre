/**
 * 在庫・出品（listings）をカード識別子（serial_number）またはカタログ ID で横断するためのクエリ組み立て。
 */
export function inventoryHref(opts: { cardId?: string; serial?: string }): string {
  const q = new URLSearchParams();
  if (opts.cardId) q.set("card", opts.cardId);
  if (opts.serial) q.set("serial", opts.serial);
  const s = q.toString();
  return s ? `/inventory?${s}` : "/inventory";
}

export function listingsHref(serial: string): string {
  return `/listings?serial=${encodeURIComponent(serial)}`;
}

export function newListingHref(serial: string): string {
  return `/listings/new?serial=${encodeURIComponent(serial)}`;
}
