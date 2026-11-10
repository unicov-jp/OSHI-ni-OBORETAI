import type { Category, Oshi, Platform, ViewMode } from "@/lib/types";

export type Tab = {
  id: string;
  name: string;
  colors: string[];
  oshiIds: string[];
  unread: number;
};

export const VIEW_LABEL: Record<ViewMode, string> = {
  oshi: "推し",
  group: "グループ",
  agency: "事務所",
  genre: "ジャンル",
};

export const VIEW_MODES: ViewMode[] = ["oshi", "group", "agency", "genre"];

const KEY = { group: "group_id", agency: "agency_id", genre: "genre_id" } as const;

// 表示単位(推し/グループ/事務所/ジャンル)に応じてタブを組み立てる。先頭は常に「すべて」。
export function buildTabs(
  view: ViewMode,
  oshi: Oshi[],
  categories: Category[],
  unread: Record<string, number>,
): Tab[] {
  const sum = (ids: string[]) => ids.reduce((total, id) => total + (unread[id] ?? 0), 0);
  const colorsOf = (members: Oshi[]) => [...new Set(members.map((o) => o.color))].slice(0, 4);

  const all: Tab = {
    id: "all",
    name: "すべて",
    colors: colorsOf(oshi),
    oshiIds: oshi.map((o) => o.id),
    unread: sum(oshi.map((o) => o.id)),
  };

  if (view === "oshi") {
    return [
      all,
      ...oshi.map((o) => ({ id: o.id, name: o.name, colors: [o.color], oshiIds: [o.id], unread: unread[o.id] ?? 0 })),
    ];
  }

  const key = KEY[view];
  const tabs: Tab[] = [all];
  for (const category of categories.filter((c) => c.kind === view)) {
    const members = oshi.filter((o) => o[key] === category.id);
    if (members.length === 0) continue;
    const ids = members.map((o) => o.id);
    tabs.push({ id: category.id, name: category.name, colors: colorsOf(members), oshiIds: ids, unread: sum(ids) });
  }
  const rest = oshi.filter((o) => !o[key]);
  if (rest.length > 0) {
    const ids = rest.map((o) => o.id);
    tabs.push({ id: "none", name: "未分類", colors: colorsOf(rest), oshiIds: ids, unread: sum(ids) });
  }
  return tabs;
}

export function feedHref(params: { view: ViewMode; tab?: string; platform?: Platform | "all" }): string {
  const query = new URLSearchParams();
  if (params.view !== "oshi") query.set("view", params.view);
  if (params.tab && params.tab !== "all") query.set("tab", params.tab);
  if (params.platform && params.platform !== "all") query.set("p", params.platform);
  const text = query.toString();
  return text ? `/app?${text}` : "/app";
}
