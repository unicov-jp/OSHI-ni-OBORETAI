"use client";

// 設定のON/OFFの行: 左に見出し(すぐ右に今の状態)と説明、右端にスイッチ
export function SettingSwitch({
  title,
  status,
  on,
  description,
  disabled,
  onToggle,
}: {
  title: string;
  status: string;
  on: boolean;
  description: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold">{title}</span>
          <span className={`text-[13px] font-bold ${on ? "text-ok" : "text-muted"}`}>{status}</span>
        </p>
        <p className="mt-0.5 text-[13px] text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${title}(${status})`}
        disabled={disabled}
        onClick={onToggle}
        className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-brand" : "bg-line"}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
      </button>
    </div>
  );
}
