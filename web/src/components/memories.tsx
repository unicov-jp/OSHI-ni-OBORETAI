"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OshiAvatar } from "@/components/oshi-avatar";
import { addLive, updateLive } from "@/lib/actions/records";
import { useLongPress } from "@/lib/long-press";
import type { CalendarEntry, GalleryPhoto, Oshi } from "@/lib/types";

// 新着(SNS)の左右にある画面。
// - ギャラリー(新着から左へスワイプ): 推しのギャラリーとチェキの写真を、上下のスワイプで1枚ずつ見る。
//   右下の推しのアイコンを長押し(またはタップ)で、ギャラリーの写真・チェキを追加する
// - カレンダー(新着から右へスワイプ): 推しの LIVE・チェキの記録を月ごとに見て、LIVE・チェキを登録する。
//   上から推しのアイコン・カレンダーの順で位置を固定し、日付をタップするとカレンダーの下にその日の記録を出す。
//   チェキの写真はギャラリーで見る
// どちらも今のアプリ(推し活手帳)と同じ記録を読み書きする

// ---------------- ギャラリー ----------------

export function GalleryBody({ oshi, photos }: { oshi: Oshi; photos: GalleryPhoto[] }) {
  const [adding, setAdding] = useState(false);
  const avatarPress = useLongPress(() => setAdding(true));

  return (
    <>
      {photos.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <OshiAvatar oshi={oshi} size={72} />
          <p className="text-lg font-bold">{oshi.name}</p>
          <p className="text-sm text-white/70">ギャラリーとチェキの写真はまだありません。</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-11 items-center rounded-full bg-white px-6 text-sm font-bold text-black"
          >
            写真を追加する
          </button>
        </div>
      ) : (
        <div className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {photos.map((photo, i) => (
            <section key={photo.key} className="relative h-full w-full snap-start snap-always overflow-hidden">
              <PhotoSlide photo={photo} eager={i < 2} />
            </section>
          ))}
        </div>
      )}

      {/* 右下: 推しのアイコン(長押し・タップで写真を追加) */}
      {photos.length > 0 ? (
        <div className="absolute right-3 bottom-[calc(2rem+env(safe-area-inset-bottom))] z-10 flex flex-col items-center gap-1 text-[10.5px] font-bold [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
          <button
            type="button"
            aria-label={`${oshi.name}(長押しで写真・チェキを追加)`}
            className="rounded-full"
            {...avatarPress}
            onClick={() => setAdding(true)}
          >
            <OshiAvatar oshi={oshi} size={48} />
          </button>
          <span>追加</span>
        </div>
      ) : null}

      {adding ? <AddSheet oshi={oshi} onClose={() => setAdding(false)} /> : null}
    </>
  );
}

function PhotoSlide({ photo, eager }: { photo: GalleryPhoto; eager: boolean }) {
  const [broken, setBroken] = useState(false);
  // 読み込みに失敗したら、少し待って1回だけ読み直す(ドライブの応答が一時的に遅いことがあるため)
  const [attempt, setAttempt] = useState(0);
  const src = attempt === 0 ? photo.src : `${photo.src}&r=${attempt}`;
  const onError = () => {
    if (attempt === 0) setTimeout(() => setAttempt(1), 1500);
    else setBroken(true);
  };
  return (
    <div className="absolute inset-0 pt-[var(--bar)]">
      {broken ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center text-sm text-white/60">
          <p>写真を読み込めませんでした。</p>
          <p className="text-xs">Googleドライブで削除された写真や、今のアプリでドライブとの接続が切れているときは表示できません。</p>
        </div>
      ) : (
        <>
          {/* 背景: 同じ写真をぼかして敷く(写真の縦横比が画面と違っても余白を目立たせない) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" loading={eager ? "eager" : "lazy"} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={photo.kind === "cheki" ? `${photo.title}のチェキ` : "ギャラリーの写真"}
            className="relative h-full w-full object-contain"
            loading={eager ? "eager" : "lazy"}
            onError={onError}
          />
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />
      <div className="absolute bottom-[calc(2rem+env(safe-area-inset-bottom))] left-4 max-w-[calc(100%-6rem)] [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
        <span className="mb-2 inline-block rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-bold">
          {photo.kind === "cheki" ? "チェキ" : "ギャラリー"}
        </span>
        {photo.kind === "cheki" ? (
          <>
            <p className="truncate text-[15px] font-bold">{photo.title}</p>
            <p className="num text-xs text-white/75">{formatDate(photo.date)}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

// 写真は端末で長い辺1080pxの JPEG に縮めてから送る(通信量とドライブの容量を抑える)
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1080 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.85),
  );
}

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

// 追加のシート: 「ギャラリーに追加」か「チェキを追加」を選び、写真を選んで保存する
// initialMode: カレンダーから開いたときは「チェキを追加」から始める(日付はタップした日)
function AddSheet({ oshi, onClose, initialMode = "menu", initialDate }: {
  oshi: Oshi; onClose: () => void; initialMode?: "menu" | "cheki"; initialDate?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"menu" | "gallery" | "cheki">(initialMode);
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => initialDate ?? todayJst());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const pick = (next: "gallery" | "cheki") => {
    setMode(next);
    setFiles([]);
    setError(null);
    // ギャラリーはすぐに写真を選ぶ画面を開く
    if (next === "gallery") setTimeout(() => input.current?.click(), 0);
  };

  const save = async () => {
    if (files.length === 0) return setError("写真を選んでください");
    if (mode === "cheki" && !title.trim()) return setError("イベント名を入力してください");
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("target", mode);
      body.set("oshiId", oshi.id);
      if (mode === "cheki") {
        body.set("title", title.trim());
        body.set("date", date);
      }
      for (const [i, file] of files.entries()) body.append("photos", await shrink(file), `photo_${i}.jpg`);
      const response = await fetch("/api/photo", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存できませんでした");
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60 text-white" onClick={busy ? undefined : onClose} role="presentation">
      <div
        role="dialog"
        aria-label="写真を追加"
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-[#111] px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
      >
        <span aria-hidden className="mx-auto mb-4 block h-1 w-10 rounded-full bg-white/25" />
        <div className="mb-3 flex items-center gap-3 px-1">
          <OshiAvatar oshi={oshi} size={40} />
          <p className="truncate text-[15px] font-bold">
            {mode === "menu" ? `${oshi.name}に写真を追加` : mode === "gallery" ? "ギャラリーに追加" : "チェキを追加"}
          </p>
        </div>

        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const list = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/")).slice(0, 10);
            event.target.value = "";
            if (list.length > 0) setFiles(list);
          }}
        />

        {mode === "menu" ? (
          <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/5">
            <li>
              <button type="button" onClick={() => pick("gallery")} className="flex min-h-[60px] w-full flex-col justify-center px-4 py-2 text-left active:bg-white/10">
                <span className="text-[15px] font-semibold">ギャラリーに追加</span>
                <span className="text-xs text-white/55">推しの写真を何枚でも</span>
              </button>
            </li>
            <li>
              <button type="button" onClick={() => pick("cheki")} className="flex min-h-[60px] w-full flex-col justify-center px-4 py-2 text-left active:bg-white/10">
                <span className="text-[15px] font-semibold">チェキを追加</span>
                <span className="text-xs text-white/55">イベント名・日付と一緒に記録(カレンダーにも出ます)</span>
              </button>
            </li>
          </ul>
        ) : (
          <div className="space-y-3">
            {mode === "cheki" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs text-white/60">イベント名</span>
                  <input
                    value={title}
                    maxLength={60}
                    onChange={(event) => setTitle(event.target.value)}
                    className="h-11 w-full rounded-xl bg-white/10 px-3 text-[15px] outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-white/60">日付</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="h-11 w-full rounded-xl bg-white/10 px-3 text-[15px] outline-none [color-scheme:dark] focus:ring-2 focus:ring-white/40"
                  />
                </label>
              </>
            ) : null}

            <div className="grid grid-cols-4 gap-2">
              {previews.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="aspect-square w-full rounded-lg object-cover" />
              ))}
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-white/30 text-xs text-white/70"
              >
                {files.length > 0 ? "選び直す" : "写真を選ぶ"}
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-white/50">
              写真は、Google アカウントに紐づく Google ドライブの「推しに溺れたいapp」フォルダに保存されます。
            </p>

            {error ? <p className="text-sm text-[#ff6b8f]">{error}</p> : null}

            <button
              type="button"
              disabled={busy || files.length === 0}
              onClick={() => void save()}
              className="h-12 w-full rounded-2xl bg-white text-[15px] font-bold text-black disabled:opacity-40"
            >
              {busy ? "保存中" : `${files.length > 0 ? `${files.length}枚を` : ""}保存する`}
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={mode === "menu" || initialMode !== "menu" ? onClose : () => setMode("menu")}
          className="mt-3 h-12 w-full rounded-2xl bg-white/10 text-[15px] font-semibold"
        >
          {mode === "menu" || initialMode !== "menu" ? "閉じる" : "戻る"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ---------------- カレンダー ----------------

const TYPE_LABEL: Record<CalendarEntry["type"], string> = { live: "LIVE", cheki: "チェキ" };
const TYPE_COLOR: Record<CalendarEntry["type"], string> = { live: "#ff2d6f", cheki: "#ffd23f" };
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function formatDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日(${WEEK[d.getDay()]})`;
}

const field = "h-11 w-full rounded-xl bg-white/10 px-3 text-[15px] outline-none [color-scheme:dark] focus:ring-2 focus:ring-white/40";

// onShowGallery: チェキをタップしたときにギャラリーへ切り替える
export function CalendarBody({ oshi, entries, onShowGallery }: { oshi: Oshi; entries: CalendarEntry[]; onShowGallery: () => void }) {
  const today = todayJst();
  const [month, setMonth] = useState(today.slice(0, 7));
  // タップした日(最初は今日)。その日の記録をカレンダーの下に出す
  const [selected, setSelected] = useState(today);
  const [adding, setAdding] = useState<"live" | "cheki" | null>(null);
  // LIVE: 長押しで出す詳細(ポスター・編集ボタン)と、編集中の記録
  const [detail, setDetail] = useState<CalendarEntry | null>(null);
  const [editing, setEditing] = useState<CalendarEntry | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [entries]);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (step: number) => {
    const d = new Date(y, m - 1 + step, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const list = byDate.get(selected) ?? [];
  const nav = "flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg active:bg-white/20";
  const addButton = "flex h-9 items-center rounded-full bg-white/15 px-3 text-[13px] font-bold active:bg-white/25";

  return (
    <div className="flex h-full flex-col pt-[calc(var(--bar)+0.5rem)] pb-[env(safe-area-inset-bottom)]">
      {/* カレンダー(位置は固定。下の記録だけが動く) */}
      <div className="mx-auto w-full max-w-[520px] shrink-0 px-3">
        <div className="mb-1 flex items-center justify-between">
          <button type="button" className={nav} onClick={() => shift(-1)} aria-label="前の月">‹</button>
          <button
            type="button"
            className="num text-base font-bold"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelected(today);
            }}
          >
            {y}年{m}月
          </button>
          <button type="button" className={nav} onClick={() => shift(1)} aria-label="次の月">›</button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-white/50">
          {WEEK.map((w, i) => (
            <span key={w} className={i === 0 ? "text-[#ff6b8f]" : i === 6 ? "text-[#6bb8ff]" : ""}>{w}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-0.5">
          {cells.map((date, i) => {
            if (!date) return <span key={`blank-${i}`} className="h-[min(44px,calc((100dvh-var(--bar))/13))]" />;
            const items = byDate.get(date) ?? [];
            const on = date === selected;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                className={`num flex h-[min(44px,calc((100dvh-var(--bar))/13))] flex-col items-center justify-center gap-0.5 rounded-lg text-sm ${
                  on ? "bg-white text-black" : ""
                } ${date === today && !on ? "ring-1 ring-white/60" : ""}`}
                aria-label={`${formatDate(date)}${items.length > 0 ? `、記録${items.length}件` : ""}`}
                aria-pressed={on}
              >
                {Number(date.slice(8))}
                <span className="flex h-1.5 gap-0.5">
                  {[...new Set(items.map((e) => e.type))].map((t) => (
                    <span key={t} className="h-1.5 w-1.5 rounded-full" style={{ background: TYPE_COLOR[t] }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* タップした日の記録 */}
      <div className="mx-auto mt-2 flex min-h-0 w-full max-w-[520px] flex-1 flex-col border-t border-white/10 px-4 pt-3">
        <div className="mb-2 flex shrink-0 items-center gap-2">
          <h2 className="num min-w-0 flex-1 truncate text-[15px] font-bold">{formatDate(selected)}</h2>
          <button type="button" className={addButton} onClick={() => setAdding("live")}>＋LIVE</button>
          <button type="button" className={addButton} onClick={() => setAdding("cheki")}>＋チェキ</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 [scrollbar-width:none]">
          {list.length === 0 ? (
            <p className="text-sm text-white/55">この日の記録はありません。</p>
          ) : (
            <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/5">
              {list.map((e) =>
                e.type === "live" ? (
                  <LiveRow key={`live-${e.id}`} entry={e} onDetail={() => setDetail(e)} />
                ) : (
                  <li key={`cheki-${e.id}`}>
                    {/* チェキの写真はギャラリーで見る */}
                    <button type="button" onClick={onShowGallery} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10">
                      <TypeMark type={e.type} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{e.title}</span>
                        {e.sub ? <span className="num block truncate text-xs text-white/55">{e.sub}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-white/55">ギャラリーで見る ›</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>

      {adding === "live" ? <LiveSheet oshi={oshi} date={selected} onClose={() => setAdding(null)} /> : null}
      {editing ? <LiveSheet oshi={oshi} date={editing.date} entry={editing} onClose={() => setEditing(null)} /> : null}
      {detail ? (
        <LiveDetail
          entry={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
        />
      ) : null}
      {adding === "cheki" ? <AddSheet oshi={oshi} initialMode="cheki" initialDate={selected} onClose={() => setAdding(null)} /> : null}
    </div>
  );
}

function TypeMark({ type }: { type: CalendarEntry["type"] }) {
  return (
    <span className="w-12 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-bold text-black" style={{ background: TYPE_COLOR[type] }}>
      {TYPE_LABEL[type]}
    </span>
  );
}

const VIEWING_LABEL = { venue: "現地", stream: "配信", tbd: "未定" } as const;

// LIVE の1行: 短押しで現地(マップ)・チケット・配信のボタンを出し、長押しでポスターと編集ボタンの画面を出す
function LiveRow({ entry, onDetail }: { entry: CalendarEntry; onDetail: () => void }) {
  const [open, setOpen] = useState(false);
  const press = useLongPress(onDetail);
  const live = entry.live;
  const action = "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold";
  return (
    <li>
      <button
        type="button"
        {...press}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${entry.title}(タップで現地・チケット・配信、長押しでポスターと編集)`}
        className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10"
      >
        <TypeMark type="live" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{entry.title}</span>
          {entry.sub ? <span className="num block truncate text-xs text-white/55">{entry.sub}</span> : null}
        </span>
        {live ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-white/55">
            {VIEWING_LABEL[live.viewing]}
            {/* チェキの「ギャラリーで見る ›」とそろえる。開いている間は下向きにする */}
            <span aria-hidden className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          </span>
        ) : null}
      </button>
      {open && live ? (
        <div className="flex gap-2 px-4 pb-3">
          {/* 現地(会場をマップで開く)・チケット・配信。登録が無いものは押せない表示にする */}
          {([
            ["現地", live.mapUrl, "bg-white text-black"],
            ["チケット", live.ticketUrl, "bg-[#ffd23f] text-black"],
            ["配信", live.streamUrl, "bg-[#ff2d6f] text-white"],
          ] as const).map(([label, url, tone]) =>
            url ? (
              <a key={label} href={url} target="_blank" rel="noopener noreferrer" className={`${action} ${tone}`}>
                {label}
              </a>
            ) : (
              <span key={label} className={`${action} bg-white/10 text-white/30`} aria-disabled="true">
                {label}
              </span>
            ),
          )}
        </div>
      ) : null}
    </li>
  );
}

// LIVE の詳細(長押し): 上にポスター、下に内容と編集ボタン
function LiveDetail({ entry, onClose, onEdit }: { entry: CalendarEntry; onClose: () => void; onEdit: () => void }) {
  const live = entry.live;
  const [broken, setBroken] = useState(false);
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end bg-black/70 text-white" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-label={entry.title}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[#111] px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
      >
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/25" />
        {live?.poster && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={live.poster}
            alt={`${entry.title}のポスター`}
            onError={() => setBroken(true)}
            className="mx-auto max-h-[55dvh] w-auto max-w-full rounded-xl object-contain"
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-xl bg-white/5 text-sm text-white/45">
            {live?.poster ? "ポスターを読み込めませんでした" : "ポスターはまだありません"}
          </div>
        )}
        <div className="mt-4 space-y-1 px-1">
          <p className="text-lg font-bold">{entry.title}</p>
          <p className="num text-sm text-white/70">
            {formatDate(entry.date)}
            {live?.startTime ? `  ${live.startTime}〜` : ""}
          </p>
          {live?.venue ? <p className="text-sm text-white/70">{live.venue}</p> : null}
          {live ? <p className="text-xs text-white/50">観戦: {VIEWING_LABEL[live.viewing]}</p> : null}
          {live?.memo ? <p className="pt-1 text-sm whitespace-pre-wrap text-white/80">{live.memo}</p> : null}
        </div>
        <button type="button" onClick={onEdit} className="mt-4 h-12 w-full rounded-2xl bg-white text-[15px] font-bold text-black">
          編集する
        </button>
        <button type="button" onClick={onClose} className="mt-2 h-12 w-full rounded-2xl bg-white/10 text-[15px] font-semibold">
          閉じる
        </button>
      </div>
    </div>,
    document.body,
  );
}

// LIVE の登録・編集(ポスター・イベント名・日付・開始時刻・会場・観戦方法・メモ)。entry があれば編集
function LiveSheet({ oshi, date: initialDate, entry, onClose }: { oshi: Oshi; date: string; entry?: CalendarEntry; onClose: () => void }) {
  const router = useRouter();
  const live = entry?.live;
  const [title, setTitle] = useState(entry?.title ?? "");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(live?.startTime ?? "");
  const [venue, setVenue] = useState(live?.venue ?? "");
  const [viewing, setViewing] = useState<"venue" | "stream" | "tbd">(live?.viewing ?? "venue");
  const [memo, setMemo] = useState(live?.memo ?? "");
  const [ticketUrl, setTicketUrl] = useState(live?.ticketUrl ?? "");
  const [streamUrl, setStreamUrl] = useState(live?.streamUrl ?? "");
  const [poster, setPoster] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (poster ? URL.createObjectURL(poster) : null), [poster]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const save = async () => {
    if (!title.trim()) return setError("イベント名を入力してください");
    setBusy(true);
    setError(null);
    try {
      const fields = { date, title, startTime, venue, viewing, memo, ticketUrl, streamUrl };
      let id = entry?.id;
      if (id) {
        const result = await updateLive(id, fields);
        if (!result.ok) throw new Error(result.error);
      } else {
        const result = await addLive({ oshiId: oshi.id, ...fields });
        if (!result.ok) throw new Error(result.error);
        id = result.data?.id;
      }
      // ポスターを選んだときは、記録を保存したあとに送る
      if (poster && id) {
        const body = new FormData();
        body.set("target", "live");
        body.set("oshiId", oshi.id);
        body.set("recordId", id);
        body.append("photos", await shrink(poster), "poster.jpg");
        const response = await fetch("/api/photo", { method: "POST", body });
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(`内容は保存しました。ポスターは保存できませんでした(${result.error ?? "通信エラー"})`);
      }
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const currentPoster = preview ?? live?.poster ?? "";

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60 text-white" onClick={busy ? undefined : onClose} role="presentation">
      <div
        role="dialog"
        aria-label={entry ? "LIVEを編集" : "LIVEを登録"}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-[#111] px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
      >
        <span aria-hidden className="mx-auto mb-4 block h-1 w-10 rounded-full bg-white/25" />
        <div className="mb-3 flex items-center gap-3 px-1">
          <OshiAvatar oshi={oshi} size={40} />
          <p className="truncate text-[15px] font-bold">{entry ? "LIVEを編集" : "LIVEを登録"}</p>
        </div>
        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-xs text-white/60">ポスター(任意)</span>
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file && file.type.startsWith("image/")) setPoster(file);
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/30 bg-white/5 text-sm text-white/70"
            >
              {currentPoster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentPoster} alt="" className="h-full w-auto object-contain" />
              ) : (
                "ポスターを選ぶ"
              )}
            </button>
            {currentPoster ? <p className="mt-1 text-[11px] text-white/45">タップで差し替え</p> : null}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">イベント名</span>
            <input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-white/60">日付</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-white/60">開始時刻(任意)</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">会場(任意)</span>
            <input value={venue} maxLength={60} onChange={(e) => setVenue(e.target.value)} className={field} />
          </label>
          <div>
            <span className="mb-1 block text-xs text-white/60">観戦</span>
            <div className="grid grid-cols-3 gap-2">
              {(["venue", "stream", "tbd"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={viewing === key}
                  onClick={() => setViewing(key)}
                  className={`h-10 rounded-xl text-sm font-bold ${viewing === key ? "bg-white text-black" : "bg-white/10"}`}
                >
                  {VIEWING_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">チケットのURL(任意)</span>
            <input value={ticketUrl} maxLength={500} inputMode="url" onChange={(e) => setTicketUrl(e.target.value)} className={field} placeholder="https://" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">配信のURL(任意)</span>
            <input value={streamUrl} maxLength={500} inputMode="url" onChange={(e) => setStreamUrl(e.target.value)} className={field} placeholder="https://" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">メモ(任意)</span>
            <textarea
              value={memo}
              maxLength={500}
              onChange={(e) => setMemo(e.target.value)}
              className="min-h-[72px] w-full rounded-xl bg-white/10 px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-white/40"
            />
          </label>
          {error ? <p className="text-sm text-[#ff6b8f]">{error}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="h-12 w-full rounded-2xl bg-white text-[15px] font-bold text-black disabled:opacity-40"
          >
            {busy ? "保存中" : entry ? "変更を保存" : "登録する"}
          </button>
        </div>
        <button type="button" disabled={busy} onClick={onClose} className="mt-3 h-12 w-full rounded-2xl bg-white/10 text-[15px] font-semibold">
          閉じる
        </button>
      </div>
    </div>,
    document.body,
  );
}
