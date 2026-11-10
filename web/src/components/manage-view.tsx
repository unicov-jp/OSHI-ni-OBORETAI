"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/dialog";
import {
  Badge, Button, Clamp, EmptyState, inputClass, Light, Notice,
} from "@/components/ui";
import { addSource, deleteSource } from "@/lib/actions/sources";
import { atLimit, limitText } from "@/lib/plans";
import {
  PLATFORM_EXAMPLE, PLATFORM_HOW, PLATFORM_LABEL, PLATFORM_MARK, PLATFORM_ORDER,
} from "@/lib/platforms";
import type { Category, Oshi, Platform, Source, Viewer } from "@/lib/types";

type Props = { viewer: Viewer; oshi: Oshi[]; categories: Category[]; sources: Source[] };

// 推しは今のアプリ(推し活手帳)の記録をそのまま表示する。推しの登録・編集は今のアプリで行い、
// ここでは推しごとのSNS・Blog(新着を取る先)を登録する。
export function ManageView({ viewer, oshi, categories, sources }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const target = editingId ? oshi.find((o) => o.id === editingId) : undefined;
  const sourceFull = atLimit(sources.length, viewer.maxSources);

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl leading-7 font-bold">推しのSNS</h1>
          <p className="num text-[13px] text-muted">
            推し {limitText(oshi.length, viewer.maxOshi, "人")}、アカウント {limitText(sources.length, viewer.maxSources, "件")}
          </p>
        </div>
      </header>

      <div className="mt-3">
        <Notice>推しの追加・編集・削除は、今のアプリ(推し活手帳)で行ってください。ここには自動で反映されます。</Notice>
      </div>

      {sourceFull ? (
        <div className="mt-3">
          <Notice tone="warn">
            登録できるアカウントの上限({viewer.maxSources}件)に達しています。
            {viewer.plan === "free" ? " 有料プランにすると300件まで登録できます(有料プランは準備中です)。" : ""}
          </Notice>
        </div>
      ) : null}

      <div className="mt-5">
        {oshi.length === 0 ? (
          <EmptyState
            title="推しがまだ登録されていません"
            body="今のアプリ(推し活手帳)で推しを登録すると、ここにSNSを登録できるようになります。"
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {oshi.map((o) => {
              const labels = [
                ...o.group_ids.map((id) => categoryName(id)),
                categoryName(o.agency_id),
              ].filter(Boolean).join(" / ");
              const count = sources.filter((s) => s.oshi_id === o.id).length;
              return (
                <li key={o.id} className="flex h-[76px] min-w-0 items-center gap-4 rounded-xl border border-line bg-surface px-4">
                  <Light color={o.color} className="h-11 w-[6px]" />
                  <div className="min-w-0 flex-1">
                    <Clamp className="text-[15px] font-semibold">{o.name}</Clamp>
                    <Clamp className="text-[13px] text-muted">{labels || "所属なし"}</Clamp>
                  </div>
                  <Badge>
                    <span className="num">{count}件</span>
                  </Badge>
                  <Button size="sm" className="w-[88px]" onClick={() => setEditingId(o.id)}>
                    SNSを登録
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={target !== undefined}
        onClose={() => setEditingId(null)}
        title={target ? `${target.name} のSNS` : ""}
        wide
      >
        {target ? (
          <div className="space-y-6">
            <SnsCandidates oshi={target} sources={sources.filter((s) => s.oshi_id === target.id)} disabled={sourceFull} />
            <SourceEditor key={target.id} oshiId={target.id} sources={sources.filter((s) => s.oshi_id === target.id)} />
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

// 今のアプリで推しに登録してあるSNS(本人・グループ)を、ボタン1つで新着の取得先に取り込む
function SnsCandidates({ oshi, sources, disabled }: { oshi: Oshi; sources: Source[]; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);

  const normalize = (url: string) => url.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");
  const registered = new Set(sources.map((s) => normalize(s.url)));
  const candidates = oshi.sns.filter((c) => !registered.has(normalize(c.url)));
  if (candidates.length === 0) return null;

  const add = (platform: Platform, url: string) => {
    setMessage(null);
    setBusyUrl(url);
    startTransition(async () => {
      const result = await addSource({ oshiId: oshi.id, url, expected: platform });
      setBusyUrl(null);
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      setMessage(result.data?.note ? { tone: "warn", text: result.data.note } : { tone: "ok", text: "取り込みました" });
    });
  };

  return (
    <section>
      <h3 className="text-[15px] font-semibold">今のアプリに登録してあるSNS</h3>
      <p className="mt-1 text-[13px] text-muted">押すと、新着を取る先として登録します。</p>
      <ul className="mt-2 divide-y divide-line">
        {candidates.map((c) => (
          <li key={c.url} className="flex h-12 items-center gap-3">
            <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md border border-line text-[11px] font-bold">
              {PLATFORM_MARK[c.platform]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="clamp-1 block text-sm" title={c.url}>{c.url}</span>
              <span className="clamp-1 block text-xs text-muted">{c.from}</span>
            </span>
            <Button
              size="sm"
              variant="primary"
              className="w-[88px]"
              disabled={pending || disabled}
              onClick={() => add(c.platform, c.url)}
            >
              {busyUrl === c.url ? "確認中" : "取り込む"}
            </Button>
          </li>
        ))}
      </ul>
      {message ? (
        <div className="mt-2">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}
    </section>
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
