"use client";

import { useEffect, useRef, type ReactNode } from "react";

// 共通のダイアログ。省略された文字の全文確認や、登録・編集のフォームに使う。
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-24px)] rounded-2xl border border-line bg-surface p-0 text-text ${
        wide ? "max-w-[760px]" : "max-w-[520px]"
      }`}
    >
      {open ? (
        <div className="flex max-h-[calc(100dvh-34px)] flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
            <h2 className="clamp-1 text-base font-semibold" title={title}>
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-text"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
