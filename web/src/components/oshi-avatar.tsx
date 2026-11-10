"use client";

import { useState } from "react";
import type { Oshi } from "@/lib/types";

// 推しのアイコン。今のアプリで設定した写真があれば写真、無ければ名前の1文字をメンバーカラーで出す。
// 枠はメンバーカラー。大きさは固定(文字数で変わらない)。
export function OshiAvatar({ oshi, size = 32, className = "" }: { oshi?: Oshi; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const color = oshi?.color ?? "var(--line)";
  const initial = (oshi?.name ?? "").trim().slice(0, 1);
  const ring = Math.max(2, Math.round(size / 16));
  return (
    <span
      aria-hidden
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: color,
        boxShadow: `0 0 0 ${ring}px ${color}`,
      }}
    >
      {oshi?.photo && !broken ? (
        // 本人だけが見る写真を、当アプリのサーバー経由で表示する
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/oshi-photo/${encodeURIComponent(oshi.id)}?v=${oshi.photo}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span style={{ textShadow: "0 1px 2px rgba(0,0,0,.25)" }}>{initial}</span>
      )}
    </span>
  );
}
