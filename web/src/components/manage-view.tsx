"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/dialog";
import {
  Badge, Button, Clamp, EmptyState, Field, inputClass, Light, Notice,
} from "@/components/ui";
import { deleteOshi, saveOshi } from "@/lib/actions/oshi";
import { addSource, deleteSource } from "@/lib/actions/sources";
import {
  MEMBER_COLORS, PLATFORM_EXAMPLE, PLATFORM_HOW, PLATFORM_LABEL, PLATFORM_MARK, PLATFORM_ORDER,
} from "@/lib/platforms";
import type { Category, CategoryKind, Oshi, Platform, Source, Viewer } from "@/lib/types";

type Props = { viewer: Viewer; oshi: Oshi[]; categories: Category[]; sources: Source[] };
type Editing = { id: string | null } | null;

export function ManageView({ viewer, oshi, categories, sources }: Props) {
  const [editing, setEditing] = useState<Editing>(null);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const atLimit = oshi.length >= viewer.maxOshi;
  const target = editing?.id ? oshi.find((o) => o.id === editing.id) : undefined;

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-7 font-bold">推しの登録</h1>
          <p className="num text-[13px] text-muted">
            推し {oshi.length} / {viewer.maxOshi}人、アカウント {sources.length} / {viewer.maxSources}件
          </p>
        </div>
        <Button variant="primary" disabled={atLimit} onClick={() => setEditing({ id: null })}>
          推しを追加
        </Button>
      </header>

      {atLimit ? (
        <div className="mt-3">
          <Notice tone="warn">
            登録できる推しの上限({viewer.maxOshi}人)に達しています。
            {viewer.plan === "free" ? (
              <>
                {" "}
                <Link href="/app/settings" className="font-semibold underline">
                  Proプランにすると50人まで登録できます
                </Link>
              </>
            ) : null}
          </Notice>
        </div>
      ) : null}

      <div className="mt-5">
        {oshi.length === 0 ? (
          <EmptyState
            title="最初の推しを登録しましょう"
            body="名前とメンバーカラーを決めて、SNSやBlogのURLを貼るだけです。"
            action={
              <Button variant="primary" onClick={() => setEditing({ id: null })}>
                推しを追加
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {oshi.map((o) => {
              const labels = [categoryName(o.group_id), categoryName(o.agency_id), categoryName(o.genre_id)]
                .filter(Boolean)
                .join(" / ");
              const count = sources.filter((s) => s.oshi_id === o.id).length;
              return (
                <li key={o.id} className="flex h-[76px] min-w-0 items-center gap-4 rounded-xl border border-line bg-surface px-4">
                  <Light color={o.color} className="h-11 w-[6px]" />
                  <div className="min-w-0 flex-1">
                    <Clamp className="text-[15px] font-semibold">{o.name}</Clamp>
                    <Clamp className="text-[13px] text-muted">{labels || "分類なし"}</Clamp>
                  </div>
                  <Badge>
                    <span className="num">{count}件</span>
                  </Badge>
                  <Button size="sm" onClick={() => setEditing({ id: o.id })}>
                    編集
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={target ? `${target.name} を編集` : "推しを追加"}
        wide
      >
        {editing ? (
          <OshiEditor
            key={editing.id ?? "new"}
            oshi={target}
            categories={categories}
            sources={sources.filter((s) => s.oshi_id === editing.id)}
            categoryName={categoryName}
            onCreated={(id) => setEditing({ id })}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function OshiEditor({
  oshi, categories, sources, categoryName, onCreated, onClose,
}: {
  oshi?: Oshi;
  categories: Category[];
  sources: Source[];
  categoryName: (id: string | null) => string;
  onCreated: (id: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(oshi?.name ?? "");
  const [color, setColor] = useState(oshi?.color ?? MEMBER_COLORS[7].value);
  const [note, setNote] = useState(oshi?.note ?? "");
  const [group, setGroup] = useState(categoryName(oshi?.group_id ?? null));
  const [agency, setAgency] = useState(categoryName(oshi?.agency_id ?? null));
  const [genre, setGenre] = useState(categoryName(oshi?.genre_id ?? null));
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveOshi({ id: oshi?.id, name, color, note, group, agency, genre });
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      if (!oshi && result.data) {
        onCreated(result.data.id);
      } else {
        setMessage({ tone: "ok", text: "保存しました" });
      }
    });
  };

  const remove = () => {
    if (!oshi) return;
    startTransition(async () => {
      const result = await deleteOshi(oshi.id);
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      onClose();
    });
  };

  const categoryField = (kind: CategoryKind, label: string, value: string, set: (v: string) => void) => (
    <Field label={label}>
      <input
        className={inputClass}
        value={value}
        maxLength={40}
        list={`list-${kind}`}
        onChange={(event) => set(event.target.value)}
        placeholder="未設定"
      />
      <datalist id={`list-${kind}`}>
        {categories.filter((c) => c.kind === kind).map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </Field>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Field label="名前">
          <input
            className={inputClass}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
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
                aria-pressed={color.toLowerCase() === c.value.toLowerCase()}
                onClick={() => setColor(c.value)}
                className={`h-9 w-9 shrink-0 rounded-full border-2 ${
                  color.toLowerCase() === c.value.toLowerCase() ? "border-text" : "border-line"
                }`}
                style={{ background: c.value }}
              />
            ))}
            <label className="flex h-9 items-center gap-2 rounded-lg border border-line px-2 text-[13px] text-muted">
              ほかの色
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          {categoryField("group", "グループ", group, setGroup)}
          {categoryField("agency", "事務所", agency, setAgency)}
          {categoryField("genre", "ジャンル", genre, setGenre)}
        </div>

        <Field label="メモ" hint={`${note.length} / 200文字`}>
          <textarea
            className={`${inputClass} h-[76px] resize-none py-2`}
            value={note}
            maxLength={200}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={save} disabled={pending || !name.trim()}>
            {oshi ? "変更を保存" : "登録してアカウントを追加する"}
          </Button>
          {oshi ? (
            confirmDelete ? (
              <>
                <Button variant="danger" onClick={remove} disabled={pending}>
                  登録アカウントごと削除する
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

      {oshi ? <SourceEditor oshiId={oshi.id} sources={sources} /> : null}
    </div>
  );
}

// サービスごとに区画を分けたアカウント登録。
// 左にサービスの印、中央に登録済みアカウントの一覧、右に追加ボタンを置く。
function SourceEditor({ oshiId, sources }: { oshiId: string; sources: Source[] }) {
  const [adding, setAdding] = useState<Platform | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<{ platform: Platform; tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (platform: Platform) => {
    setAdding(platform);
    setUrl("");
    setMessage(null);
  };

  const add = (platform: Platform) => {
    setMessage(null);
    startTransition(async () => {
      const result = await addSource({ oshiId, url, expected: platform });
      if (!result.ok) return setMessage({ platform, tone: "danger", text: result.error });
      setUrl("");
      setAdding(null);
      setMessage(
        result.data?.note
          ? { platform, tone: "warn", text: result.data.note }
          : { platform, tone: "ok", text: "追加しました" },
      );
    });
  };

  const remove = (source: Source) => {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteSource(source.id);
      if (!result.ok) setMessage({ platform: source.platform, tone: "danger", text: result.error });
    });
  };

  return (
    <section className="border-t border-line pt-5">
      <h3 className="text-[15px] font-semibold">アカウントの登録</h3>
      <p className="mt-1 text-[13px] text-muted">
        推しのプロフィールやBlogのURLを、サービスごとに登録します。ログイン情報は不要です。
      </p>

      <ul className="mt-3 divide-y divide-line">
        {PLATFORM_ORDER.map((platform) => {
          const list = sources.filter((s) => s.platform === platform);
          const label = PLATFORM_LABEL[platform];
          return (
            <li key={platform} className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-4 py-4 sm:grid-cols-[48px_minmax(0,1fr)_auto]">
              <span
                aria-hidden
                className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-[13px] font-bold shadow-sm"
              >
                {PLATFORM_MARK[platform]}
              </span>

              <div className="min-w-0">
                <p className="text-[15px] leading-6 font-medium">{label}</p>
                <p className="clamp-1 text-xs text-muted">{PLATFORM_HOW[platform]}</p>

                {list.length > 0 ? (
                  <ul className="mt-2">
                    {list.map((source) => (
                      <li key={source.id} className="flex h-11 items-center gap-3">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                        <span className="clamp-1 block flex-1 text-sm" title={source.url}>
                          {source.label || source.handle || source.url}
                        </span>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(source)}>
                          解除
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {adding === platform ? (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!pending && url.trim()) add(platform);
                    }}
                  >
                    <input
                      className={inputClass}
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder={PLATFORM_EXAMPLE[platform]}
                      inputMode="url"
                      aria-label={`${label}のURL`}
                      autoFocus
                    />
                    <Button type="submit" variant="primary" disabled={pending || !url.trim()}>
                      {pending ? "確認中" : "登録"}
                    </Button>
                    <Button variant="ghost" onClick={() => setAdding(null)}>
                      やめる
                    </Button>
                  </form>
                ) : null}

                {message?.platform === platform ? (
                  <div className="mt-2">
                    <Notice tone={message.tone}>{message.text}</Notice>
                  </div>
                ) : null}
              </div>

              <div className="col-start-2 mt-3 sm:col-start-3 sm:mt-0 sm:self-center">
                <Button
                  variant="primary"
                  className="w-[168px]"
                  disabled={pending || adding === platform}
                  onClick={() => open(platform)}
                >
                  {label} を追加
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
