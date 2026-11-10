"use client";

import { useState } from "react";

// 料金の目安(1行): ▼ 人数 ▲ と、その人数の月額。無料の人数を超えた1人ごとに加算する
export function PriceSimulator({ perOshi, freeOshi, maxOshi }: { perOshi: number; freeOshi: number; maxOshi: number }) {
  const [count, setCount] = useState(freeOshi + 1);
  const price = Math.max(0, count - freeOshi) * perOshi;
  const step = "flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-sm disabled:opacity-30 active:scale-95";

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-sunken/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <button type="button" className={step} onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} aria-label="1人減らす">
          ▼
        </button>
        <span className="num w-14 text-center">
          <span className="text-xl font-bold">{count}</span>
          <span className="ml-0.5 text-xs">人</span>
        </span>
        <button type="button" className={step} onClick={() => setCount((c) => Math.min(maxOshi, c + 1))} disabled={count >= maxOshi} aria-label="1人増やす">
          ▲
        </button>
      </div>
      <span className="num text-right" aria-live="polite">
        {price === 0 ? (
          <span className="text-lg font-bold">無料</span>
        ) : (
          <>
            <span className="text-xs text-muted">月額</span>
            <span className="ml-1 text-lg font-bold">{price.toLocaleString("ja-JP")}円</span>
          </>
        )}
      </span>
    </div>
  );
}
