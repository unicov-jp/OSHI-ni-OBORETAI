"use client";

import { useState } from "react";

// 料金の目安: ▲▼で推しの人数を変えると、月額を出す(無料の人数を超えた1人ごとに加算)
export function PriceSimulator({ perOshi, freeOshi, maxOshi }: { perOshi: number; freeOshi: number; maxOshi: number }) {
  const [count, setCount] = useState(freeOshi + 1);
  const extra = Math.max(0, count - freeOshi);
  const price = extra * perOshi;
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
        <button type="button" className={step} onClick={() => setCount((c) => Math.min(maxOshi, c + 1))} disabled={count >= maxOshi} aria-label="1人増やす">
          ▲
        </button>
      </div>
      <p className="num mt-3 text-center" aria-live="polite">
        {extra === 0 ? (
          <span className="text-xl font-bold">無料</span>
        ) : (
          <>
            <span className="text-sm text-muted">月額</span>
            <span className="ml-1 text-2xl font-bold">{price.toLocaleString("ja-JP")}円</span>
          </>
        )}
      </p>
      <p className="num mt-1 text-center text-[11px] text-muted">
        {extra === 0
          ? `${freeOshi}人までは無料です`
          : `無料の${freeOshi}人 ＋ ${extra}人 × ${perOshi.toLocaleString("ja-JP")}円`}
        {count >= maxOshi ? `(${maxOshi}人まで)` : ""}
      </p>
    </div>
  );
}
