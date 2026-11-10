"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/dialog";
import { OshiAvatar } from "@/components/oshi-avatar";
import { OshiEditor } from "@/components/oshi-editor";
import {
  Badge, Button, Clamp, EmptyState, inputClass, Notice,
} from "@/components/ui";
import { addSource, deleteSource, importAllSns } from "@/lib/actions/sources";
import { atLimit, limitText } from "@/lib/plans";
import {
  PLATFORM_EXAMPLE, PLATFORM_HOW, PLATFORM_LABEL, PLATFORM_MARK, PLATFORM_ORDER,
} from "@/lib/platforms";
import type { Category, Oshi, Platform, Source, Viewer } from "@/lib/types";

type Props = { viewer: Viewer; oshi: Oshi[]; categories: Category[]; sources: Source[] };

// 推しの登録・編集と、推しごとのSNS・Blog(新着を取る先)の登録。
// 推しは今のアプリ(推し活手帳)と同じ記録を読み書きするので、どちらで登録・編集しても互いに反映される。
export function ManageView({ viewer, oshi, categories, sources }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // 推しの編集画面: null = 閉じている、"new" = 新しく登録、それ以外 = 編集する推しの id
  const [oshiEditing, setOshiEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const oshiFull = atLimit(oshi.length, viewer.maxOshi);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";
  const target = editingId ? oshi.find((o) => o.id === editingId) : undefined;
  const sourceFull = atLimit(sources.length, viewer.maxSources);

  return (
    <div className="mx-auto max-w-[1000px]">
      <header className="flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <Link href="/app/settings" className="text-[13px] text-muted hover:text-text">
            ← 設定
          </Link>
          <h1 className="text-xl leading-7 font-bold">推しの登録</h1>
          <p className="num text-[13px] text-muted">
            推し {limitText(oshi.length, viewer.maxOshi, "人")}、アカウント {limitText(sources.length, viewer.maxSources, "件")}
          </p>
        </div>
        <Button variant="primary" className="w-[120px]" disabled={oshiFull} onClick={() => setOshiEditing("new")}>
          推しを追加
        </Button>
      </header>

      <div className="mt-3 space-y-2">
        <Notice>推しの登録・編集は、今のアプリ(推し活手帳)と共通です。どちらで変えても、もう一方に反映されます。</Notice>
        {oshiFull ? <Notice tone="warn">登録できる推しの上限({viewer.maxOshi}人)に達しています。</Notice> : null}
        {message ? <Notice tone="ok">{message}</Notice> : null}
      </div>

      <ImportAll oshi={oshi} sources={sources} disabled={sourceFull} />

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
                <li key={o.id} className="flex h-[76px] min-w-0 items-center gap-3 rounded-xl border border-line bg-surface pr-3">
                  <button
                    type="button"
                    onClick={() => setOshiEditing(o.id)}
                    className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-l-xl pl-4 text-left hover:bg-sunken"
                    aria-label={`${o.name}を編集`}
                  >
                    <OshiAvatar oshi={o} size={44} />
                    <span className="min-w-0 flex-1">
                      <Clamp className="text-[15px] font-semibold">{o.name}</Clamp>
                      <Clamp className="text-[13px] text-muted">{labels || "所属なし"}</Clamp>
                    </span>
                  </button>
                  <Badge>
                    <span className="num">{count}件</span>
                  </Badge>
                  <Button size="sm" className="w-[64px]" onClick={() => setEditingId(o.id)}>
                    SNS
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
        title={target ? `${target.name} のSNS(新着を取る先)` : ""}
        wide
      >
        {target ? (
          <div className="space-y-6">
            <SnsCandidates oshi={target} sources={sources.filter((s) => s.oshi_id === target.id)} disabled={sourceFull} />
            <SourceEditor key={target.id} oshiId={target.id} sources={sources.filter((s) => s.oshi_id === target.id)} />
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={oshiEditing !== null}
        onClose={() => setOshiEditing(null)}
        title={oshiEditing === "new" ? "推しを追加" : `${oshi.find((o) => o.id === oshiEditing)?.name ?? ""} を編集`}
        wide
      >
        {oshiEditing !== null ? (
          <OshiEditor
            key={oshiEditing}
            oshiId={oshiEditing === "new" ? null : oshiEditing}
            onDone={(text) => {
              setOshiEditing(null);
              setMessage(text);
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

const normalizeUrl = (url: string) => url.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");

// まだ取り込んでいない「今のアプリのSNS」の件数
function pendingCount(oshi: Oshi[], sources: Source[]): number {
  let count = 0;
  for (const o of oshi) {
    const registered = new Set(sources.filter((s) => s.oshi_id === o.id).map((s) => normalizeUrl(s.url)));
    for (const sns of o.sns) {
      if (!registered.has(normalizeUrl(sns.url))) {
        registered.add(normalizeUrl(sns.url));
        count++;
      }
    }
  }
  return count;
}

// 今のアプリで全員の推しに登録してあるSNSを、新着の取得先に取り込む。
// 画面を開いたときに、まだ取り込んでいないものがあれば自動で取り込む(1回の表示につき1度。
// 時間切れで残りがあれば、取り込めている間は続けて取り込む)。手動のボタンでもやり直せる。
function ImportAll({ oshi, sources, disabled }: { oshi: Oshi[]; sources: Source[]; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    tone: "ok" | "warn" | "danger";
    text: string;
    failed: { name: string; url: string; error: string }[];
  } | null>(null);
  const started = useRef(false);
  const count = pendingCount(oshi, sources);

  const run = () => {
    setResult(null);
    startTransition(async () => {
      let added = 0;
      let linked = 0;
      let failed: { name: string; url: string; error: string }[] = [];
      let remaining = 0;
      // 時間切れで残った分は、取り込めている間だけ続けて取り込む(最大5回)
      for (let round = 0; round < 5; round++) {
        const response = await importAllSns();
        if (!response.ok) return setResult({ tone: "danger", text: response.error, failed: [] });
        const data = response.data ?? { added: 0, linked: 0, failed: [], remaining: 0 };
        added += data.added;
        linked += data.linked;
        failed = data.failed;
        remaining = data.remaining;
        if (remaining === 0 || data.added + data.linked === 0) break;
      }
      if (added + linked === 0 && failed.length === 0 && remaining === 0) return;
      const parts = [`今のアプリのSNSを${added + linked}件取り込みました`];
      if (linked > 0) parts.push(`(うち${linked}件は新着を取れないためリンクとして保存)`);
      if (failed.length > 0) parts.push(`。${failed.length}件は取り込めませんでした`);
      if (remaining > 0) parts.push(`。残り${remaining}件は、時間をおいて「取り込む」を押してください`);
      setResult({ tone: failed.length > 0 || remaining > 0 ? "warn" : "ok", text: parts.join(""), failed });
    });
  };

  // 画面を開いたら自動で取り込む(描画が終わってから始める)
  useEffect(() => {
    if (disabled || count === 0) return;
    const timer = setTimeout(() => {
      if (started.current) return;
      started.current = true;
      // 取り込めなかったものを開くたびに試し直さないよう、自動の取り込みはこのタブで1回だけにする
      const key = "oshi-sns-auto-import";
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        // 保存できない環境でもそのまま取り込む
      }
      run();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (count === 0 && !result && !pending) return null;

  return (
    <section className="mt-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">今のアプリのSNS</p>
          <p className="text-[13px] text-muted">
            {pending
              ? "今のアプリで推しに登録してあるSNSを読み取っています。しばらくお待ちください。"
              : count > 0
                ? `まだ取り込まれていないSNSが${count}件あります。`
                : "今のアプリのSNSはすべて取り込み済みです。"}
          </p>
        </div>
        {count > 0 && !pending ? (
          <Button className="w-[120px]" disabled={disabled} onClick={run}>
            取り込む
          </Button>
        ) : null}
      </div>
      {result ? (
        <div className="mt-3 space-y-2">
          <Notice tone={result.tone}>{result.text}</Notice>
          {result.failed.length > 0 ? (
            <ul className="space-y-1 text-[13px]">
              {result.failed.map((f) => (
                <li key={`${f.name}-${f.url}`} className="min-w-0">
                  <span className="font-medium">{f.name}</span>
                  <span className="clamp-1 block text-muted" title={f.url}>{f.url}</span>
                  <span className="block text-danger">{f.error}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// 今のアプリで推しに登録してあるSNS(本人・グループ)を、ボタン1つで新着の取得先に取り込む
function SnsCandidates({ oshi, sources, disabled }: { oshi: Oshi; sources: Source[]; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);

  const registered = new Set(sources.map((s) => normalizeUrl(s.url)));
  const candidates = oshi.sns.filter((c) => !registered.has(normalizeUrl(c.url)));
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
