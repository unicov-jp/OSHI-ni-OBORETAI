"use client";

import { useState } from "react";

// 料金の目安(1行): 「プラン名 人数 月額」と、右端に縦に並べた ▲▼。無料の人数を超えた1人ごとに加算する
export function PriceSimulator({ name, perOshi, freeOshi, maxOshi }: { name: string; perOshi: number; freeOshi: number; maxOshi: number }) {
  const [count, setCount] = useState(freeOshi + 1);
  const price = Math.max(0, count - freeOshi) * perOshi;
  const step = "flex h-7 w-9 items-center justify-center rounded-md bg-sunken text-xs disabled:opacity-30 active:scale-95";

  return (
    <div className="flex items-center gap-3">
      <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{name}</h2>
      <span className="num w-14 text-right">
        <span className="text-xl font-bold">{count}</span>
        <span className="ml-0.5 text-xs">人</span>
      </span>
      <span className="num w-28 text-right" aria-live="polite">
        {price === 0 ? (
          <span className="text-lg font-bold">無料</span>
        ) : (
          <>
            <span className="text-xs text-muted">月額</span>
            <span className="ml-1 text-lg font-bold">{price.toLocaleString("ja-JP")}円</span>
          </>
        )}
      </span>
      <span className="flex flex-col gap-1">
        <button type="button" className={step} onClick={() => setCount((c) => Math.min(maxOshi, c + 1))} disabled={count >= maxOshi} aria-label="1人増やす">
          ▲
        </button>
        <button type="button" className={step} onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} aria-label="1人減らす">
          ▼
        </button>
      </span>
    </div>
  );
}
