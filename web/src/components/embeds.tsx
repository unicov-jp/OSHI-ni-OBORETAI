"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/theme-switch";
import { embedHandle, PLATFORM_LABEL } from "@/lib/platforms";
import type { Source } from "@/lib/types";

declare global {
  interface Window {
    twttr?: {
      widgets?: {
        load: (element?: HTMLElement) => void;
        createTweet?: (id: string, element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLElement | undefined>;
      };
    };
  }
}

const FRAME_HEIGHT = 560;
const SANDBOX = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox";

function loadXScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.twttr?.widgets) return resolve();
    const existing = document.getElementById("x-widgets") as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => resolve(), { once: true });
    if (!existing) {
      script.id = "x-widgets";
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function XTimeline({ handle }: { handle: string; url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  // X の埋め込みは、このブラウザで X にログインしている(ログインの情報が残っている)と表示される。
  // 時間がたっても表示されないときは、ログイン中の X で開く案内に切り替える。
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.replaceChildren();
    const anchor = document.createElement("a");
    anchor.className = "twitter-timeline";
    anchor.href = `https://twitter.com/${handle}`;
    anchor.dataset.height = String(FRAME_HEIGHT);
    anchor.dataset.theme = theme;
    anchor.dataset.chrome = "noheader nofooter noborders transparent";
    anchor.textContent = "";
    container.appendChild(anchor);

    let cancelled = false;
    loadXScript().then(() => {
      if (!cancelled) window.twttr?.widgets?.load(container);
    });
    const timer = setTimeout(() => {
      const frame = container.querySelector("iframe");
      if (!cancelled && (!frame || frame.getBoundingClientRect().height < 80)) setFailed(true);
    }, 15000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handle, theme, attempt]);

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted">
          X の投稿は、このブラウザで X にログインしていると表示されます。
          ログインしていない場合や、ブラウザがほかのサイトの情報を使わない設定のときは表示されません。
        </p>
        <p className="text-sm font-semibold">右の「開く」から、ログイン中の X で見られます。</p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
          className="flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-sunken"
        >
          もう一度読み込む
        </button>
      </div>
    );
  }
  return <div ref={ref} className="h-full overflow-y-auto" />;
}

// TikTok 公式の「クリエイター埋め込み」(embed.js)。アカウントの最新の動画が並ぶ。
function loadTikTokScript(): void {
  const existing = document.getElementById("tiktok-embed");
  if (existing) existing.remove();
  const script = document.createElement("script");
  script.id = "tiktok-embed";
  script.src = "https://www.tiktok.com/embed.js";
  script.async = true;
  document.body.appendChild(script);
}

function TikTokCreator({ handle, url }: { handle: string; url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.replaceChildren();
    const quote = document.createElement("blockquote");
    quote.className = "tiktok-embed";
    quote.setAttribute("cite", `https://www.tiktok.com/@${handle}`);
    quote.dataset.uniqueId = handle;
    quote.dataset.embedType = "creator";
    quote.style.maxWidth = "780px";
    quote.style.minWidth = "288px";
    quote.style.margin = "0";
    const section = document.createElement("section");
    const link = document.createElement("a");
    link.href = `https://www.tiktok.com/@${handle}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `@${handle}`;
    section.appendChild(link);
    quote.appendChild(section);
    container.appendChild(quote);
    // embed.js は読み込まれたときにページ内の埋め込みを探すので、毎回読み直す
    loadTikTokScript();
    const timer = setTimeout(() => {
      if (!container.querySelector("iframe")) setFailed(true);
    }, 15000);
    return () => clearTimeout(timer);
  }, [handle]);

  if (failed) return <Fallback label="TikTok" url={url} reason="TikTok の埋め込み表示が読み込めませんでした。" />;
  return <div ref={ref} className="h-full overflow-y-auto" />;
}

// X の投稿1件(公式の投稿埋め込み。ログインしていなくても表示される)
export function XPostEmbed({ id, url, theme: forced }: { id: string; url: string; theme?: "light" | "dark" }) {
  const ref = useRef<HTMLDivElement>(null);
  const appTheme = useTheme();
  const theme = forced ?? appTheme;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.replaceChildren();
    let cancelled = false;
    loadXScript().then(async () => {
      const create = window.twttr?.widgets?.createTweet;
      if (cancelled) return;
      if (!create) return setFailed(true);
      const element = await create(id, container, { theme, dnt: true, lang: "ja", align: "center", conversation: "none" });
      if (!cancelled && !element) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, theme]);

  if (failed) return <Fallback label="X" url={url} reason="この投稿を表示できませんでした(削除されたか、公開範囲が限られています)。" />;
  return <div ref={ref} className="flex h-full items-start justify-center overflow-y-auto p-2" />;
}

// Instagram の投稿1件(公式の投稿埋め込み)
export function InstagramPost({ code, title }: { code: string; title: string }) {
  return (
    <iframe
      title={title}
      src={`https://www.instagram.com/p/${code}/embed/captioned/`}
      sandbox={SANDBOX}
      referrerPolicy="strict-origin-when-cross-origin"
      className="h-full w-full border-0 bg-white"
    />
  );
}

function Fallback({ reason }: { label: string; url: string; reason: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted">{reason}</p>
      <p className="text-sm font-semibold">右の「開く」から見られます。</p>
    </div>
  );
}

// X と TikTok は、まとめて読み込むと相手側で制限がかかる(TikTok の overload-protect など)ため、
// 押したものだけを読み込む。
function LoadOnDemand({ label, auto, children }: { label: string; auto?: boolean; children: React.ReactNode }) {
  const [shown, setShown] = useState(Boolean(auto));
  if (shown) return <>{children}</>;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm text-muted">{label}の最新の投稿を、ここに表示します。</p>
      <button
        type="button"
        onClick={() => setShown(true)}
        className="flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-sunken"
      >
        ここに表示する
      </button>
    </div>
  );
}

// SNSアカウント1件ぶんの公式埋め込み。枠の大きさは固定。
// 表示の中身は各SNSが配信しており、当アプリは投稿を取得も保存もしない。
// fill: 親の高さいっぱいに広げる(新着のスワイプ画面用)。autoLoad: 押さなくても読み込む(画面に出ている1枚だけに使う)
export function EmbedCard({
  source, oshiName, fill = false, autoLoad = false,
}: { source: Source; oshiName: string; fill?: boolean; autoLoad?: boolean }) {
  const handle = embedHandle(source.platform, source.handle);
  const label = PLATFORM_LABEL[source.platform];

  let frame: React.ReactNode = null;
  if (handle && source.platform === "x") {
    frame = (
      <LoadOnDemand label="X" auto={autoLoad}>
        <XTimeline handle={handle} url={source.url} />
      </LoadOnDemand>
    );
  } else if (handle && source.platform === "instagram") {
    frame = (
      <iframe
        title={`${oshiName}のInstagram`}
        src={`https://www.instagram.com/${handle}/embed/`}
        loading="lazy"
        sandbox={SANDBOX}
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full border-0 bg-white"
      />
    );
  } else if (handle && source.platform === "tiktok") {
    frame = (
      <LoadOnDemand label="TikTok" auto={autoLoad}>
        <TikTokCreator handle={handle} url={source.url} />
      </LoadOnDemand>
    );
  }

  return (
    <article className={`flex flex-col overflow-hidden bg-surface ${fill ? "h-full" : "rounded-xl border border-line"}`}>
      <header className={`flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 ${fill ? "hidden" : ""}`}>
        <div className="min-w-0 flex-1">
          <p className="clamp-1 text-sm font-semibold" title={oshiName}>
            {oshiName}
          </p>
          <p className="clamp-1 text-xs text-muted" title={source.handle}>
            {label} {source.handle}
          </p>
        </div>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 shrink-0 items-center rounded-lg border border-line px-3 text-[13px] font-medium whitespace-nowrap hover:bg-sunken"
        >
          {label}で開く
        </a>
      </header>
      <div style={fill ? undefined : { height: FRAME_HEIGHT }} className={`bg-sunken ${fill ? "min-h-0 flex-1" : ""}`}>
        {frame ?? (
          <p className="flex h-full items-center justify-center px-6 text-center text-sm text-muted">
            このアカウントは埋め込み表示に対応していません。
          </p>
        )}
      </div>
      <p className={`h-9 shrink-0 border-t border-line px-4 text-xs leading-9 whitespace-nowrap text-muted ${fill ? "hidden" : ""}`}>
        表示されないときは「{label}で開く」から確認できます
      </p>
    </article>
  );
}
