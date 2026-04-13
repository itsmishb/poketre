import Link from "next/link";

function hueFromSerial(serial: string): number {
  let h = 0;
  for (let i = 0; i < serial.length; i++) h = ((h << 5) - h + serial.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

type Props = {
  id: string;
  serial_number: string;
  name_ja: string;
  qty: number;
  type: "UNIT" | "LOT";
  status: string;
  imageUrl: string | null;
  /** 箱内の狭い列用にフル幅・やや小さめにする */
  compact?: boolean;
};

export function InventoryTilePreview({
  id,
  serial_number,
  name_ja,
  qty,
  type,
  status,
  imageUrl,
  compact = false,
}: Props) {
  const hue = hueFromSerial(serial_number);
  const bg = `linear-gradient(145deg, hsl(${hue} 42% 88%) 0%, hsl(${(hue + 40) % 360} 38% 78%) 100%)`;

  return (
    <Link
      href={`/inventory/${id}`}
      className={
        compact
          ? "group block w-full max-w-none"
          : "group block min-w-[7.5rem] max-w-[10rem] flex-1"
      }
    >
      <article className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md">
        <div
          className={`relative w-full overflow-hidden ${compact ? "aspect-[4/5]" : "aspect-[3/4]"}`}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center font-bold text-slate-600/35 ${compact ? "text-lg" : "text-2xl"}`}
              style={{ background: bg }}
            >
              {name_ja.slice(0, 1)}
            </div>
          )}
          <span className="absolute right-1.5 top-1.5 rounded-full bg-slate-900/75 px-2 py-0.5 text-[10px] font-semibold text-white">
            ×{qty.toLocaleString()}
          </span>
        </div>
        <div className="space-y-0.5 p-2">
          <p className="line-clamp-2 text-xs font-medium leading-snug text-slate-900">{name_ja}</p>
          <p className="truncate font-mono text-[10px] text-slate-500">{serial_number}</p>
          <div className="flex flex-wrap gap-1 pt-0.5">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {type === "UNIT" ? "1枚" : "ロット"}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {status}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
