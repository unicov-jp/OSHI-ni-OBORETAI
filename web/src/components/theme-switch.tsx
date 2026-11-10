"use client";

import { useSyncExternalStore } from "react";

const EVENT = "themechange";

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
}

function current(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function useTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, current, () => "light");
}

// ダークモードのON/OFFスイッチ。選択は端末に保存され、次回も同じ表示になる。
export function ThemeSwitch({ showLabel = true }: { showLabel?: boolean }) {
  const dark = useTheme() === "dark";

  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // 保存できない環境では、このページを開いている間だけ切り替わる
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="ダークモード"
      onClick={toggle}
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-2 text-[13px] text-muted hover:bg-sunken hover:text-text"
    >
      {showLabel ? <span className="hidden sm:inline">ダークモード</span> : null}
      <span
        className={`relative h-6 w-11 rounded-full border transition-colors ${
          dark ? "border-brand bg-brand" : "border-line bg-sunken"
        }`}
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-full transition-[left] ${
            dark ? "left-[22px] bg-brand-ink" : "left-[3px] bg-muted"
          }`}
        />
      </span>
      <span className="w-7 text-left font-medium" suppressHydrationWarning>
        {dark ? "ON" : "OFF"}
      </span>
    </button>
  );
}
