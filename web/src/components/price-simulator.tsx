"use client";

import { useState } from "react";

// 料金の目安: ▲▼で推しの人数を変えると、その人数の月額を出す(段階は管理画面の「料金」で決める)
export function PriceSimulator({ tiers, freeOshi }: { tiers: { max_oshi: number; monthly_yen: number }[]; freeOshi: number }) {
  const max = tiers[tiers.length - 1]?.max_oshi ?? freeOshi;
  const [count, setCount] = useState(Math.min(max, freeOshi + 1));
  const tier = tiers.find((t) => count <= t.max_oshi);
  const price = count <= freeOshi ? 0 : (tier?.monthly_yen ?? 0);
  const step = "flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-lg font-bold disabled:opacity-30 active:scale-95";

  return (
    <div className="mt-4 rounded-xl bg-sunken/60 p-4">
      <p className="text-xs text-muted">登録する推しの人数</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button type="button" className={step} onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} aria-label="1人減らす">
          ▼
        </button>
        <p className="num text-center">
          <span className="text-3xl font-bold">{count}</span>
          <span className="ml-1 text-sm">人</span>
        </p>
        <button type="button" className={step} onClick={() => setCount((c) => Math.min(max, c + 1))} disabled={count >= max} aria-label="1人増やす">
          ▲
        </button>
      </div>
      <p className="num mt-3 text-center" aria-live="polite">
        {count <= freeOshi ? (
          <span className="text-xl font-bold">無料</span>
        ) : (
          <>
            <span className="text-sm text-muted">月額</span>
            <span className="ml-1 text-2xl font-bold">{price.toLocaleString("ja-JP")}円</span>
          </>
        )}
      </p>
      {count >= max ? <p className="mt-1 text-center text-[11px] text-muted">登録できるのは{max}人までです</p> : null}
    </div>
  );
}
