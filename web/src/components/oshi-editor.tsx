"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { deleteOshiRecord, getOshiForEdit, removeOshiPhoto, saveOshiRecord } from "@/lib/actions/oshi";
import { importAllSns } from "@/lib/actions/sources";
import {
  ADVANCED_SNS_KEYS, emptySns, SNS_KEYS, SNS_LABEL, SNS_PLACEHOLDER, type GroupInput, type OshiEditable, type SnsInput, type SnsKey,
} from "@/lib/oshi-record";
import { MEMBER_COLORS } from "@/lib/platforms";

// 推しの登録・編集。今のアプリ(推し活手帳)と同じ項目を、同じ記録に保存する。
// アイコンの写真は、選ぶとすぐに保存する(名前などの「変更を保存」とは別)。ギャラリーはギャラリーの画面で追加する。
// 事務所は入力しない(今のアプリで入っている値は、そのまま残す)。

const blank = (): OshiEditable => ({
  name: "",
  color: MEMBER_COLORS[1]?.value ?? "#EC6FA9",
  agency: "",
  birthMonth: "",
  birthDay: "",
  birthYear: "",
  person: emptySns(),
  groups: [],
});

// section: 推しの画面のタブごとに出す部分(all=新しく登録するときの全部、profile=写真・名前・色・誕生日、
// person=本人のSNS、groups=グループとそのSNS)。タブの中で保存したときは、その画面のまま「保存しました」と出す
export type EditorSection = "all" | "profile" | "person" | "groups";

export function OshiEditor({ oshiId, onDone, section = "all" }: {
  oshiId: string | null; onDone: (message: string, id?: string) => void; section?: EditorSection;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState<OshiEditable | null>(oshiId ? null : blank());
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!oshiId) return;
    let cancelled = false;
    void getOshiForEdit(oshiId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) setValue(result.data);
      else setError(result.ok ? "読み込めませんでした" : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [oshiId]);

  if (!value) {
    return error ? <Notice tone="danger">{error}</Notice> : <p className="text-sm text-muted">読み込み中</p>;
  }

  const set = (patch: Partial<OshiEditable>) => setValue({ ...value, ...patch });
  const setGroup = (index: number, patch: Partial<GroupInput>) =>
    set({ groups: value.groups.map((g, i) => (i === index ? { ...g, ...patch } : g)) });

  const save = () => {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await saveOshiRecord(value);
      if (!result.ok) return setError(result.error);
      // 入力したSNSを、新着を取る先としても登録する(登録済みのものは重ねない)
      const imported = await importAllSns();
      const count = imported.ok && imported.data ? imported.data.added + imported.data.linked : 0;
      const text = `保存しました${count > 0 ? `(SNSを${count}件登録しました)` : ""}`;
      if (section === "all") return onDone(text, result.data?.id);
      setSaved(text);
      router.refresh();
    });
  };

  const remove = () => {
    if (!value.id) return;
    startTransition(async () => {
      const result = await deleteOshiRecord(value.id!);
      if (!result.ok) return setError(result.error);
      onDone("削除しました。今のアプリの「削除された記録を探す」から戻せます");
    });
  };

  return (
    <div className="space-y-6">
      {value.id && (section === "all" || section === "profile") ? <PhotoField oshiId={value.id} name={value.name} color={value.color} /> : null}
      {section === "all" || section === "profile" ? (
      <div className="space-y-4">
        <Field label="名前">
          <input
            className={inputClass}
            value={value.name}
            maxLength={40}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="推しの名前"
          />
        </Field>

        <fieldset>
          <legend className="mb-1 text-[13px] font-medium">メンバーカラー</legend>
          <div className="flex flex-wrap items-center gap-2">
            {MEMBER_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={value.color.toLowerCase() === c.value.toLowerCase()}
                onClick={() => set({ color: c.value })}
                className={`h-9 w-9 shrink-0 rounded-full border-2 ${
                  value.color.toLowerCase() === c.value.toLowerCase() ? "border-text" : "border-line"
                }`}
                style={{ background: c.value }}
              />
            ))}
            <label className="flex h-9 items-center gap-2 rounded-lg border border-line px-2 text-[13px] text-muted">
              ほかの色
              <input
                type="color"
                value={value.color}
                onChange={(e) => set({ color: e.target.value })}
                className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-[13px] font-medium">誕生日</legend>
          <div className="flex gap-2">
            <select className={inputClass} value={value.birthMonth} onChange={(e) => set({ birthMonth: e.target.value })} aria-label="月">
              <option value="">月</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
            <select className={inputClass} value={value.birthDay} onChange={(e) => set({ birthDay: e.target.value })} aria-label="日">
              <option value="">日</option>
              {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                <option key={d} value={d}>{d}日</option>
              ))}
            </select>
          </div>
        </fieldset>
      </div>
      ) : null}

      {section === "all" || section === "person" ? (
        <SnsFields title="本人のSNS" value={value.person} onChange={(person) => set({ person })} />
      ) : null}

      {section === "all" || section === "groups" ? (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">グループ</h3>
          <Button
            size="sm"
            disabled={value.groups.length >= 10}
            onClick={() => set({ groups: [...value.groups, { name: "", sns: emptySns() }] })}
          >
            グループを追加
          </Button>
        </div>
        {value.groups.length === 0 ? <p className="text-[13px] text-muted">グループはありません。</p> : null}
        {value.groups.map((group, index) => (
          <div key={group.id ?? `new-${index}`} className="space-y-3 rounded-xl border border-line p-4">
            <div className="flex items-end gap-2">
              <Field label="グループ名">
                <input
                  className={inputClass}
                  value={group.name}
                  maxLength={40}
                  onChange={(e) => setGroup(index, { name: e.target.value })}
                />
              </Field>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => set({ groups: value.groups.filter((_, i) => i !== index) })}
              >
                外す
              </Button>
            </div>
            <SnsFields title="グループのSNS" value={group.sns} onChange={(sns) => setGroup(index, { sns })} compact />
          </div>
        ))}
      </section>
      ) : null}

      {value.id ? null : <p className="text-xs text-muted">アイコンの写真は、登録したあとにこの画面で設定できます。</p>}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved ? <Notice tone="ok">{saved}</Notice> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={save} disabled={pending || !value.name.trim()}>
          {pending ? "保存中" : value.id ? "変更を保存" : "登録する"}
        </Button>
        {value.id && (section === "all" || section === "profile") ? (
          confirmDelete ? (
            <>
              <Button variant="danger" onClick={remove} disabled={pending}>
                削除する
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                やめる
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              この推しを削除
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

// 貼り付けたURLから、どのSNSの欄に入れるかを見分ける(当てはまらないものは公式HP・Blog)
function snsKeyOf(url: string): SnsKey {
  const host = (() => {
    try {
      return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^(www|m|mobile)\./, "");
    } catch {
      return "";
    }
  })();
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "instagram.com") return "instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "youtube.com" || host === "youtu.be") return "youtube";
  if (host === "threads.com" || host === "threads.net") return "threads";
  if (host === "fantia.jp") return "fantia";
  if (host === "myfans.jp") return "myfans";
  if (host === "xfans.tokyo") return "xfans";
  return "web";
}

// SNSの入力: いちばん上にURLを貼り付ける欄があり、どのSNSかを見分けて自動で振り分ける。下の欄で直接直すこともできる
function SnsFields({ title, value, onChange, compact = false }: {
  title: string; value: SnsInput; onChange: (next: SnsInput) => void; compact?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [placed, setPlaced] = useState<string | null>(null);
  const place = () => {
    const text = url.trim();
    if (!text) return;
    const key = snsKeyOf(text);
    onChange({ ...value, [key]: text });
    setPlaced(`${SNS_LABEL[key]}に入れました`);
    setUrl("");
  };
  return (
    <section className="space-y-3">
      {compact ? <p className="text-[13px] font-medium text-muted">{title}</p> : <h3 className="text-[15px] font-semibold">{title}</h3>}
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={url}
          inputMode="url"
          maxLength={300}
          placeholder="SNSのURLを貼り付け(自動で振り分け)"
          aria-label={`${title}のURL`}
          onChange={(e) => {
            setUrl(e.target.value);
            setPlaced(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              place();
            }
          }}
        />
        <Button className="w-[72px] shrink-0" onClick={place} disabled={!url.trim()}>
          入れる
        </Button>
      </div>
      {placed ? <p className="text-xs text-ok">{placed}。保存すると新着を取る先にも登録されます。</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {SNS_KEYS.map((key) => (
          <Field key={key} label={ADVANCED_SNS_KEYS.includes(key) ? `${SNS_LABEL[key]}(Advanced)` : SNS_LABEL[key]}>
            <input
              className={inputClass}
              value={value[key]}
              maxLength={300}
              inputMode={key === "web" ? "url" : "text"}
              placeholder={SNS_PLACEHOLDER[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
    </section>
  );
}

// ---------------- アイコンの写真 ----------------

const CROP = 240; // 切り抜きの枠の大きさ(画面上)
const OUT = 512; // 保存する切り抜いた写真の大きさ

async function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.88),
  );
}

// 推しのアイコンの写真: 選んだ写真を丸く切り抜く(ドラッグで位置、つまみで大きさ)。保存すると今のアプリにも反映される
function PhotoField({ oshiId, name, color }: { oshiId: string; name: string; color: string }) {
  const router = useRouter();
  const [version, setVersion] = useState(() => Date.now());
  const [hasPhoto, setHasPhoto] = useState(true);
  const [picked, setPicked] = useState<{ url: string; w: number; h: number; bitmap: ImageBitmap } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // 枠いっぱいに収まる最小の倍率(短い辺を枠に合わせる)
  const base = picked ? CROP / Math.min(picked.w, picked.h) : 1;
  const scale = base * zoom;
  // はみ出さないように位置を抑える
  const clamp = (x: number, y: number) => {
    if (!picked) return { x: 0, y: 0 };
    const maxX = Math.max(0, (picked.w * scale - CROP) / 2);
    const maxY = Math.max(0, (picked.h * scale - CROP) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };
  // 大きさを変えたときも枠からはみ出さない位置で表示・保存する
  const at = clamp(pos.x, pos.y);

  const pick = async (file: File) => {
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      setPicked({ url: URL.createObjectURL(file), w: bitmap.width, h: bitmap.height, bitmap });
      setZoom(1);
      setPos({ x: 0, y: 0 });
    } catch {
      setError("この画像は読み込めませんでした");
    }
  };

  const cancel = () => {
    if (picked) URL.revokeObjectURL(picked.url);
    setPicked(null);
  };

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      // 切り抜いた写真(正方形)
      const crop = document.createElement("canvas");
      crop.width = OUT;
      crop.height = OUT;
      const ctx = crop.getContext("2d")!;
      const side = CROP / scale; // 元の写真での切り抜く幅
      const sx = picked.w / 2 - at.x / scale - side / 2;
      const sy = picked.h / 2 - at.y / scale - side / 2;
      ctx.drawImage(picked.bitmap, sx, sy, side, side, 0, 0, OUT, OUT);
      // 元の写真(長い辺1080px。今のアプリで切り抜き直すときに使う)
      const ratio = Math.min(1, 1080 / Math.max(picked.w, picked.h));
      const original = document.createElement("canvas");
      original.width = Math.round(picked.w * ratio);
      original.height = Math.round(picked.h * ratio);
      original.getContext("2d")!.drawImage(picked.bitmap, 0, 0, original.width, original.height);

      const body = new FormData();
      body.set("target", "oshi-photo");
      body.set("oshiId", oshiId);
      body.append("photos", await toJpeg(crop), "photo.jpg");
      body.append("photos", await toJpeg(original), "original.jpg");
      const response = await fetch("/api/photo", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "保存できませんでした");
      cancel();
      setHasPhoto(true);
      setVersion(Date.now());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    const result = await removeOshiPhoto(oshiId);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setHasPhoto(false);
    setVersion(Date.now());
    router.refresh();
  };

  return (
    <section className="space-y-3">
      <p className="text-[13px] font-medium">アイコンの写真</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void pick(file);
        }}
      />
      {picked ? (
        <div className="space-y-3">
          <div
            className="relative mx-auto touch-none overflow-hidden rounded-full bg-black"
            style={{ width: CROP, height: CROP, boxShadow: `0 0 0 3px ${color}` }}
            onPointerDown={(event) => {
              (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, px: at.x, py: at.y };
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (d) setPos(clamp(d.px + event.clientX - d.x, d.py + event.clientY - d.y));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={picked.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none select-none"
              style={{
                width: picked.w * scale,
                height: picked.h * scale,
                transform: `translate(calc(-50% + ${at.x}px), calc(-50% + ${at.y}px))`,
              }}
            />
          </div>
          <label className="mx-auto flex max-w-[280px] items-center gap-3 text-xs text-muted">
            小
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="flex-1"
              aria-label="写真の大きさ"
            />
            大
          </label>
          <p className="text-center text-xs text-muted">写真を動かして位置を、つまみで大きさを合わせます。</p>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-center gap-2">
            <Button variant="primary" onClick={() => void save()} disabled={busy}>
              {busy ? "保存中" : "この写真にする"}
            </Button>
            <Button variant="ghost" onClick={cancel} disabled={busy}>
              やめる
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <span
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl font-bold text-white"
            style={{ background: color, boxShadow: `0 0 0 3px ${color}` }}
          >
            {(name.trim() || "?").slice(0, 1)}
            {hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/oshi-photo/${encodeURIComponent(oshiId)}?v=${version}`}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setHasPhoto(false)}
              />
            ) : null}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => input.current?.click()} disabled={busy}>
              {hasPhoto ? "写真を変える" : "写真を選ぶ"}
            </Button>
            {hasPhoto ? (
              <Button size="sm" variant="ghost" onClick={() => void remove()} disabled={busy}>
                写真を外す
              </Button>
            ) : null}
          </div>
        </div>
      )}
      {!picked && error ? <Notice tone="danger">{error}</Notice> : null}
    </section>
  );
}
