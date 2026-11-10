import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { PLATFORM_LABEL } from "@/lib/platforms";
import type { Platform } from "@/lib/types";

// アプリ全体で使う部品。大きさはここで固定し、画面ごとに変えない。

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none";
const BUTTON_SIZE = { md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-[13px]" };
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:opacity-90",
  secondary: "border border-line bg-surface text-text hover:bg-sunken",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
  ghost: "text-muted hover:bg-sunken hover:text-text",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: "md" | "sm" = "md", extra?: string) {
  return cx(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], extra);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "md" | "sm" }) {
  return <button type="button" {...props} className={buttonClass(variant, size, className)} />;
}

// 指定行数で省略するテキスト。行数ぶんの高さを常に確保し、全文は title で確認できる。
export function Clamp({
  lines = 1,
  children,
  className,
  as: Tag = "span",
}: {
  lines?: 1 | 2 | 3;
  children: string;
  className?: string;
  as?: "span" | "p" | "h2" | "h3" | "div";
}) {
  return (
    <Tag title={children} className={cx(lines === 1 ? "block" : "", `clamp-${lines}`, className)}>
      {children}
    </Tag>
  );
}

// メンバーカラーの灯り
export function Light({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cx("light block shrink-0", className)} style={{ "--c": color } as CSSProperties} />;
}

const TONE = {
  neutral: "bg-sunken text-muted",
  brand: "bg-brand/15 text-brand",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PlatformTag({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex h-6 w-[76px] shrink-0 items-center justify-center rounded-md border border-line text-xs font-medium text-muted">
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "danger" | "ok" | "warn"; children: ReactNode }) {
  const style = {
    neutral: "border-line bg-sunken text-text",
    danger: "border-danger/40 bg-danger/10 text-danger",
    ok: "border-ok/40 bg-ok/10 text-ok",
    warn: "border-warn/40 bg-warn/10 text-warn",
  }[tone];
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg border px-3 py-2 text-sm", style)}>
      {children}
    </p>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line px-6 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-[40ch] text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-text placeholder:text-muted/70";

export function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const TOKYO_DATE = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string | null): string {
  if (!iso) return "なし";
  return TOKYO_DATE.format(new Date(iso));
}

export function formatRelative(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return formatDateTime(iso).split(" ")[0];
}
