"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { OshiAvatar } from "@/components/oshi-avatar";
import { OshiEditor } from "@/components/oshi-editor";
import {
  Button, Clamp, EmptyState, inputClass, Notice,
} from "@/components/ui";
import { addSource, deleteSource, importAllSns } from "@/lib/actions/sources";
import { atLimit, limitText } from "@/lib/plans";
import { PLATFORM_LABEL } from "@/lib/platforms";
import type { Category, Oshi, Platform, Source, Viewer } from "@/lib/types";

type Props = {
  viewer: Viewer;
  oshi: Oshi[];
  categories: Category[];
  sources: Source[];
  // 新着の画面の長押し・メニューから開いたとき: その推しだけの画面を開く(閉じたら新着のその推しに戻る)
  initialSns?: string;
  initialNew?: boolean;
  initialEdit?: string;
};

// 推しの登録・編集と、推しごとのSNS・Blog(新着を取る先)の登録。
// 推しは今のアプリ(推し活手帳)と同じ記録を読み書きするので、どちらで登録・編集しても互いに反映される。
// - 推しを1人選んで開いたとき(?sns= / ?edit= / ?new=1): その推しだけの画面(上に「SNS」「プロフィール」の切り替え)
// - 何も選ばずに開いたとき: 推しの一覧
export function ManageView({ viewer, oshi, categories, sources, initialSns, initialNew, initialEdit }: Props) {
  const focusId = initialSns ?? initialEdit;
  const focus = focusId ? oshi.find((o) => o.id === focusId) : undefined;
  const sourceFull = atLimit(sources.length, viewer.maxSources);

  if (initialNew) return <NewOshiPage oshiFull={atLimit(oshi.length, viewer.maxOshi)} maxOshi={viewer.maxOshi} />;
  if (focus) {
    return (
      <OshiPage
        key={focus.id}
        oshi={focus}
        sources={sources.filter((s) => s.oshi_id === focus.id)}
        sourceFull={sourceFull}
        maxSources={viewer.maxSources}
        initialTab={initialEdit ? "profile" : "sns"}
      />
    );
  }
  return <OshiList viewer={viewer} oshi={oshi} categories={categories} sources={sources} />;
}

// 閉じたら新着のその推しに戻る(履歴を置き換える。SNSの投稿を開いて戻ったときに登録画面が見えないように)
function useBackToFeed() {
  const router = useRouter();
  return (id?: string | null) => router.replace(id ? `/app?tab=${encodeURIComponent(id)}` : "/app");
}

function PageHeader({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <header className="flex min-h-[60px] items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="新着に戻る"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-text"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <path d="M12.5 4l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
    </header>
  );
}

// 推し1人の画面: 「SNS」と「プロフィール」を切り替える
function OshiPage({ oshi, sources, sourceFull, maxSources, initialTab }: {
  oshi: Oshi; sources: Source[]; sourceFull: boolean; maxSources: number | null; initialTab: "sns" | "profile";
}) {
  const back = useBackToFeed();
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="mx-auto max-w-[640px] pb-10">
      <PageHeader onBack={() => back(oshi.id)}>
        <OshiAvatar oshi={oshi} size={40} />
        <h1 className="clamp-1 min-w-0 text-lg font-bold" title={oshi.name}>{oshi.name}</h1>
      </PageHeader>

      <div role="tablist" className="mt-2 grid grid-cols-2 rounded-xl bg-sunken p-1">
        {([["sns", `SNS(${sources.length})`], ["profile", "プロフィール"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`num h-10 rounded-lg text-sm font-semibold ${tab === key ? "bg-surface text-text shadow-sm" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "sns" ? (
          <>
            {sourceFull ? (
              <div className="mb-4">
                <Notice tone="warn">登録できるアカウントの上限({maxSources}件)に達しています。</Notice>
              </div>
            ) : null}
            <SnsEditor oshi={oshi} sources={sources} disabled={sourceFull} />
          </>
        ) : (
          <OshiEditor oshiId={oshi.id} onDone={(_text, id) => back(id ?? null)} />
        )}
      </div>
    </div>
  );
}

// 推しを新しく登録する画面
function NewOshiPage({ oshiFull, maxOshi }: { oshiFull: boolean; maxOshi: number | null }) {
  const back = useBackToFeed();
  return (
    <div className="mx-auto max-w-[640px] pb-10">
      <PageHeader onBack={() => back()}>
        <h1 className="text-lg font-bold">推しを追加</h1>
      </PageHeader>
      <div className="mt-3">
        {oshiFull ? (
          <Notice tone="warn">登録できる推しの上限({maxOshi}人)に達しています。</Notice>
        ) : (
          <OshiEditor oshiId={null} onDone={(_text, id) => back(id)} />
        )}
      </div>
    </div>
  );
}

// 推しの一覧(何も選ばずに開いたとき)。タップでその推しの画面へ
function OshiList({ viewer, oshi, categories, sources }: { viewer: Viewer; oshi: Oshi[]; categories: Category[]; sources: Source[] }) {
  const router = useRouter();
  const back = useBackToFeed();
  const oshiFull = atLimit(oshi.length, viewer.maxOshi);
  const sourceFull = atLimit(sources.length, viewer.maxSources);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "";

  return (
    <div className="mx-auto max-w-[760px] pb-10">
      <PageHeader onBack={() => back()}>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold">推し</h1>
          <p className="num text-[13px] text-muted">
            推し {limitText(oshi.length, viewer.maxOshi, "人")}、アカウント {limitText(sources.length, viewer.maxSources, "件")}
          </p>
        </div>
        <Button variant="primary" className="w-[104px]" disabled={oshiFull} onClick={() => router.push("/app/manage?new=1")}>
          推しを追加
        </Button>
      </PageHeader>

      <ImportAll oshi={oshi} sources={sources} disabled={sourceFull} />

      <div className="mt-4">
        {oshi.length === 0 ? (
          <EmptyState title="推しがまだ登録されていません" body="「推しを追加」から登録すると、ここにSNSを登録できるようになります。" />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {oshi.map((o) => {
              const labels = o.group_ids.map((id) => categoryName(id)).filter(Boolean).join(" / ");
              const count = sources.filter((s) => s.oshi_id === o.id).length;
              return (
                <li key={o.id}>
                  <Link
                    href={`/app/manage?sns=${encodeURIComponent(o.id)}`}
                    className="flex h-[72px] min-w-0 items-center gap-3 px-4 hover:bg-sunken"
                  >
                    <OshiAvatar oshi={o} size={44} />
                    <span className="min-w-0 flex-1">
                      <Clamp className="text-[15px] font-semibold">{o.name}</Clamp>
                      <Clamp className="text-[13px] text-muted">{labels || "グループなし"}</Clamp>
                    </span>
                    <span className="num shrink-0 text-[13px] text-muted">SNS {count}件</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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

// 推しのSNSの登録。
// 「本人」「グループ(兼任なら複数)」ごとに分けて、登録済み(解除できる)と、今のアプリの登録にあるがまだ登録していないもの(＋追加)を並べる。
// いちばん下に、URLを貼って追加する欄(サービスはURLから自動で見分ける)
function SnsEditor({ oshi, sources, disabled }: { oshi: Oshi; sources: Source[]; disabled: boolean }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const add = (target: string, platform?: Platform) => {
    setMessage(null);
    setBusy(target);
    startTransition(async () => {
      const result = await addSource({ oshiId: oshi.id, url: target, expected: platform });
      setBusy(null);
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      if (target === url) setUrl("");
      setMessage(result.data?.note ? { tone: "warn", text: result.data.note } : { tone: "ok", text: "追加しました" });
    });
  };

  const remove = (source: Source) => {
    setMessage(null);
    setBusy(source.id);
    startTransition(async () => {
      const result = await deleteSource(source.id);
      setBusy(null);
      if (!result.ok) setMessage({ tone: "danger", text: result.error });
    });
  };

  const groups = groupSns(oshi, sources);

  return (
    <div className="space-y-6">
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {groups.map((group) => (
        <section key={group.title}>
          <h2 className="mb-1 flex items-baseline gap-2">
            <span className="text-[15px] font-semibold">{group.title}</span>
            {group.title !== "本人" && group.title !== "その他" ? <span className="text-xs text-muted">グループ</span> : null}
          </h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {group.rows.map((row) =>
              row.source ? (
                <li key={row.key} className="flex h-14 items-center gap-3 pr-2 pl-3">
                  <PlatformMark platform={row.platform} />
                  <span className="clamp-1 min-w-0 flex-1 text-sm" title={row.url}>{row.name}</span>
                  <Button size="sm" variant="ghost" className="w-[64px]" disabled={pending} onClick={() => remove(row.source!)}>
                    {busy === row.source.id ? "解除中" : "解除"}
                  </Button>
                </li>
              ) : (
                <li key={row.key} className="flex h-14 items-center gap-3 pr-2 pl-3">
                  <PlatformMark platform={row.platform} dim />
                  <span className="min-w-0 flex-1">
                    <span className="clamp-1 block text-sm text-muted" title={row.url}>{row.name}</span>
                    <span className="block text-[11px] text-muted">未登録(今のアプリに登録あり)</span>
                  </span>
                  <Button size="sm" className="w-[64px]" disabled={pending || disabled} onClick={() => add(row.url, row.platform)}>
                    {busy === row.url ? "確認中" : "追加"}
                  </Button>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}

      {groups.length === 0 ? <p className="text-sm text-muted">まだ登録されていません。下の欄にURLを貼って追加してください。</p> : null}

      <form
        className="space-y-2 rounded-xl border border-line bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending && url.trim()) add(url.trim());
        }}
      >
        <p className="text-[15px] font-semibold">URLで追加</p>
        <div className="flex gap-2">
          <input
            className={inputClass}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://..."
            inputMode="url"
            aria-label="追加するURL"
          />
          <Button type="submit" variant="primary" className="w-[80px] shrink-0" disabled={pending || disabled || !url.trim()}>
            {busy === url && url ? "確認中" : "追加"}
          </Button>
        </div>
        <p className="text-xs text-muted">YouTube・X・Instagram・TikTok・Blog。サービスはURLから自動で見分けます。</p>
      </form>
    </div>
  );
}

type SnsRow = { key: string; platform: Platform; url: string; name: string; source?: Source };

const PLATFORM_ORDER: Platform[] = ["x", "instagram", "tiktok", "youtube", "threads", "blog", "link"];

// 表示名: @ハンドルがあればそれ、YouTube のチャンネルID(UC...)のような読めないものはサービス名にする
function displayName(platform: Platform, url: string, source?: Source): string {
  const handle = source?.label || source?.handle || "";
  if (handle && !/^UC[\w-]{20,}$/.test(handle)) return handle;
  const path = url.replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");
  const at = path.match(/\/(@[^/?#]+)/);
  if (at) return decodeURIComponent(at[1]);
  if (platform === "youtube") return "YouTubeチャンネル";
  return path;
}

// 本人 → グループ(今のアプリの並び順) → その他 の順に、登録済みと未登録の候補を分けて並べる
function groupSns(oshi: Oshi, sources: Source[]): { title: string; rows: SnsRow[] }[] {
  const ownerOf = new Map<string, string>();
  for (const sns of oshi.sns) if (!ownerOf.has(normalizeUrl(sns.url))) ownerOf.set(normalizeUrl(sns.url), sns.from || "本人");
  const titles: string[] = ["本人", ...oshi.sns.map((s) => s.from || "本人").filter((t) => t !== "本人")];
  const buckets = new Map<string, SnsRow[]>();
  const push = (title: string, row: SnsRow) => {
    if (!buckets.has(title)) buckets.set(title, []);
    buckets.get(title)!.push(row);
  };
  const registered = new Set<string>();
  for (const source of sources) {
    registered.add(normalizeUrl(source.url));
    push(ownerOf.get(normalizeUrl(source.url)) ?? "その他", {
      key: source.id, platform: source.platform, url: source.url, name: displayName(source.platform, source.url, source), source,
    });
  }
  for (const sns of oshi.sns) {
    const key = normalizeUrl(sns.url);
    if (registered.has(key)) continue;
    registered.add(key);
    push(sns.from || "本人", { key: `c-${key}`, platform: sns.platform, url: sns.url, name: displayName(sns.platform, sns.url) });
  }
  const order = [...new Set([...titles, "その他"])];
  return order
    .filter((title) => buckets.has(title))
    .map((title) => ({
      title,
      rows: buckets.get(title)!.sort((a, b) =>
        Number(!a.source) - Number(!b.source) || PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform)),
    }));
}

function PlatformMark({ platform, dim = false }: { platform: Platform; dim?: boolean }) {
  return (
    <span
      className={`flex h-7 w-[76px] shrink-0 items-center justify-center rounded-md border border-line text-[11px] font-bold ${dim ? "text-muted" : ""}`}
    >
      {PLATFORM_LABEL[platform]}
    </span>
  );
}
