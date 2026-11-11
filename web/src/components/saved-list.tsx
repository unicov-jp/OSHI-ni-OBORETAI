"use client";

import { useState, useTransition } from "react";
import { Notice, formatDateTime } from "@/components/ui";
import { removeSavedPost } from "@/lib/actions/saved";
import type { SavedPost } from "@/lib/types";

// 保存した投稿の一覧。タップで元の投稿を開き、「外す」で一覧から消す
export function SavedList({ posts: initial }: { posts: (SavedPost & { oshiName: string })[] }) {
  const [posts, setPosts] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 読み込めなかった写真(表示を許していない配信元など)は、サービス名の箱に置き換える
  const [broken, setBroken] = useState<Set<string>>(() => new Set());

  const remove = (url: string) => {
    setError(null);
    startTransition(async () => {
      const result = await removeSavedPost(url);
      if (!result.ok) return setError(result.error);
      setPosts((prev) => prev.filter((p) => p.url !== url));
    });
  };

  if (posts.length === 0) return <p className="text-sm text-muted">保存した投稿はまだありません</p>;

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="num text-[13px] text-muted">{posts.length}件</p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {posts.map((post) => (
          <li key={post.url} className="flex items-center gap-3 p-3">
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
              {post.thumbnail_url && !broken.has(post.url) ? (
                // 外部の写真(YouTube のサムネイルなど)をそのまま出す
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.thumbnail_url}
                  alt=""
                  className="h-14 w-20 shrink-0 rounded-md bg-sunken object-cover"
                  loading="lazy"
                  onError={() => setBroken((prev) => new Set(prev).add(post.url))}
                />
              ) : (
                <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-md bg-sunken text-xs font-bold text-muted">
                  {post.platform}
                </span>
              )}
              <span className="min-w-0">
                <span className="clamp-2 block text-sm font-semibold">{post.title || post.url}</span>
                <span className="num mt-0.5 block truncate text-xs text-muted">
                  {[post.oshiName, post.platform, `保存 ${formatDateTime(post.created_at).slice(0, 10)}`].filter(Boolean).join("・")}
                </span>
              </span>
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(post.url)}
              className="h-9 shrink-0 rounded-lg border border-line px-3 text-[13px] hover:bg-sunken disabled:opacity-50"
            >
              外す
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
