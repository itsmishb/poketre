import Link from "next/link";
import {
  STORAGE_BOXES_PER_TIER,
  STORAGE_COLUMNS_PER_BOX,
  STORAGE_TIERS,
} from "@/lib/storage-layout";

type Props = {
  /** URL の ?tier=（ジャンプの現在位置ハイライト用） */
  activeTier: number;
  /** デモで棚グリッドがあるときだけ、#tier-n へのジャンプバーを出す */
  showTierNav?: boolean;
};

/**
 * 棚ビューの説明・段が増えたときの挙動・棚段ジャンプ
 */
export function ShelfGuide({ activeTier, showTierNav = true }: Props) {
  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">座標の意味（3つの数字）</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          在庫に付ける場所コードは{" "}
          <span className="font-mono text-sm font-medium text-slate-800">段-箱-列</span>{" "}
          です。例:{" "}
          <span className="font-mono text-sm font-medium text-indigo-700">1-12-3</span>
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">1つ目＝段</p>
            <p className="mt-1 text-sm text-slate-700">上から何段目か（1始まり）。現場の「上段／下段」に合わせます。</p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">2つ目＝箱</p>
            <p className="mt-1 text-sm text-slate-700">
              その段に並ぶ箱の番号（1〜{STORAGE_BOXES_PER_TIER}）。左から1,2,3…のイメージです。
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">3つ目＝列</p>
            <p className="mt-1 text-sm text-slate-700">
              1つの箱の中の区画（1〜{STORAGE_COLUMNS_PER_BOX}）。同じ列に在庫を複数行載せられます。
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
        <h2 className="text-base font-semibold text-slate-900">画面の使い方</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-slate-700">
          <li>下の「棚段」ブロックで、目的の段の箱マス（例: 2-15）をクリックします。</li>
          <li>ページ下部に、その箱の中の {STORAGE_COLUMNS_PER_BOX} 列が開きます。</li>
          <li>列の中のタイルを押すと、その在庫の詳細へ進みます。</li>
        </ol>
      </div>

      <details className="group rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-800 marker:text-slate-400">
          棚の段を増やしたときのレイアウト
        </summary>
        <div className="mt-3 space-y-3 text-slate-600 leading-relaxed">
          <p>
            <strong className="text-slate-800">段（tier）が 3、4…と増えても、画面のルールは同じです。</strong>
            「棚段 1」「棚段 2」…が<strong>上から順に縦に並ぶだけ</strong>です。段同士を横に並べて表示はしません（1段あたり
            {STORAGE_BOXES_PER_TIER} 個の箱を読みやすく並べるためです）。
          </p>
          <p>
            段数が多くなってスクロールが長くなったときは、下の{" "}
            <strong className="text-slate-800">棚段へジャンプ</strong>{" "}
            から目的の段へ飛べます。設定の段数はコード上の定数{" "}
            <span className="font-mono text-xs text-slate-800">STORAGE_TIERS</span>{" "}
            で変えられます（いまはデモで {STORAGE_TIERS} 段）。
          </p>
          <p className="text-xs text-slate-500">
            箱の個数（1段あたり何箱まで並べるか）を変える場合は{" "}
            <span className="font-mono">STORAGE_BOXES_PER_TIER</span> を変更します。グリッドは狭い画面では折り返し、
            広い画面では横に並ぶマスが増えます。
          </p>
        </div>
      </details>

      {showTierNav && (
        <nav
          aria-label="棚段へジャンプ"
          className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-1 py-3 backdrop-blur-sm"
        >
          <span className="text-xs font-medium text-slate-500">棚段へ:</span>
          {Array.from({ length: STORAGE_TIERS }, (_, i) => {
            const t = i + 1;
            const isActive = activeTier === t;
            return (
              <Link
                key={t}
                href={`#tier-${t}`}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
              >
                段 {t}
              </Link>
            );
          })}
          <span className="mx-1 hidden h-4 w-px bg-slate-200 sm:inline" aria-hidden />
          <Link
            href="#box-detail"
            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
          >
            いま選んでいる箱の中身
          </Link>
        </nav>
      )}
    </div>
  );
}
