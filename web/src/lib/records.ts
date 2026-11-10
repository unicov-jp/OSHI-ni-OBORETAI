import type { Category, Oshi, Platform } from "@/lib/types";

// 今のアプリ(推し活手帳 / index.html)が oshikatsu_records に保存している推しの中身を、
// 新着の画面で使う形に読み替える。推しの登録・編集は今のアプリ側で行う(P3で移す)。

type RawGroup = { name?: unknown } & Record<string, unknown>;
type RawOshi = {
  name?: unknown;
  color?: unknown;
  agency?: unknown;
  group?: unknown;
  groups?: unknown;
  _order?: unknown;
  order?: unknown;
} & Record<string, unknown>;

export type OshiRecord = { id: string; data: RawOshi | null };

const DEFAULT_COLOR = "#C9457A";
const SNS_KEYS = ["youtube", "web", "x", "instagram", "tiktok", "threads", "fantia", "myfans", "xfans", "fanza"] as const;
type SnsKey = (typeof SNS_KEYS)[number];

const text = (value: unknown, max = 100): string => (typeof value === "string" ? value.trim().slice(0, max) : "");

function color(value: unknown): string {
  const v = text(value, 20);
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return DEFAULT_COLOR;
}

function groupsOf(data: RawOshi): RawGroup[] {
  if (Array.isArray(data.groups) && data.groups.length > 0) {
    return data.groups.filter((g): g is RawGroup => typeof g === "object" && g !== null);
  }
  const legacy = text(data.group);
  if (!legacy) return [];
  return [{
    name: legacy,
    sns_instagram: data.sns_group_instagram,
    sns_x: data.sns_group_x,
    sns_tiktok: data.sns_group_tiktok,
    sns_youtube: data.sns_group_youtube,
  }];
}

// 今のアプリは SNS を「ID」で持つ(公式HPだけURL)。表示と同じ規則でURLに直す。
function snsUrl(key: SnsKey, stored: string): string {
  const value = stored.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const id = value.replace(/^@+/, "");
  switch (key) {
    case "web":
    case "fantia":
    case "myfans":
    case "xfans":
    case "fanza":
      return /^[\w.-]+\.[a-z]{2,}/i.test(value) ? `https://${value}` : "";
    case "threads":
      return `https://www.threads.com/@${encodeURIComponent(id)}`;
    case "instagram":
      return `https://www.instagram.com/${encodeURIComponent(id)}/`;
    case "x":
      return `https://x.com/${encodeURIComponent(id)}`;
    case "tiktok":
      return `https://www.tiktok.com/@${encodeURIComponent(id)}`;
    case "youtube":
      return /^UC[0-9A-Za-z_-]{22}$/.test(id)
        ? `https://www.youtube.com/channel/${id}`
        : `https://www.youtube.com/@${encodeURIComponent(id)}`;
  }
}

// 公式HPは Blog の欄で取り込む(フィードが見つからなければリンクとして保存される)
const SNS_PLATFORM: Record<SnsKey, Platform> = {
  youtube: "youtube",
  web: "blog",
  x: "x",
  instagram: "instagram",
  tiktok: "tiktok",
  threads: "threads",
  fantia: "fantia",
  myfans: "myfans",
  xfans: "xfans",
  fanza: "fanza",
};

// 写真の参照(gdrive:… / data:…)から短い版の文字列を作る。参照が変われば版も変わり、表示が新しくなる。
function photoVersion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("gdrive:") && !value.startsWith("data:image/")) return null;
  let hash = 5381;
  const sample = value.length > 4096 ? value.slice(0, 2048) + value.slice(-2048) + value.length : value;
  for (let i = 0; i < sample.length; i++) hash = ((hash << 5) + hash + sample.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export const groupCategoryId = (name: string) => `group:${name}`;
export const agencyCategoryId = (name: string) => `agency:${name}`;

export function recordsToLibrary(
  rows: OshiRecord[],
  seen: Record<string, string>,
): { oshi: Oshi[]; categories: Category[] } {
  const fallbackSeen = new Date(Date.now() - 7 * 86400_000).toISOString();
  const categories = new Map<string, Category>();

  const ordered = rows
    .filter((row) => row.data && typeof row.data === "object")
    .map((row, index) => {
      const data = row.data as RawOshi;
      const order = typeof data._order === "number" ? data._order : typeof data.order === "number" ? data.order : 1e9 + index;
      return { row, data, order };
    })
    .sort((a, b) => a.order - b.order);

  const oshi = ordered.map(({ row, data }): Oshi => {
    const groups = groupsOf(data);
    const groupIds: string[] = [];
    const sns: Oshi["sns"] = [];

    for (const key of SNS_KEYS) {
      const url = snsUrl(key, text(data[`sns_person_${key}`], 300) || text(data[`sns_${key}`], 300));
      if (url) sns.push({ platform: SNS_PLATFORM[key], url, from: "本人" });
    }
    for (const group of groups) {
      const name = text(group.name, 40);
      if (name) {
        const id = groupCategoryId(name);
        if (!groupIds.includes(id)) groupIds.push(id);
        categories.set(id, { id, kind: "group", name });
      }
      for (const key of SNS_KEYS) {
        const url = snsUrl(key, text(group[`sns_${key}`], 300));
        if (url && !sns.some((s) => s.url === url)) sns.push({ platform: SNS_PLATFORM[key], url, from: name || "グループ" });
      }
    }

    const agency = text(data.agency, 40);
    let agencyId: string | null = null;
    if (agency) {
      agencyId = agencyCategoryId(agency);
      categories.set(agencyId, { id: agencyId, kind: "agency", name: agency });
    }

    return {
      id: row.id,
      name: text(data.name, 60) || "(名前なし)",
      color: color(data.color),
      note: groups.map((g) => text(g.name, 40)).filter(Boolean).join(" ・ "),
      group_id: groupIds[0] ?? null,
      group_ids: groupIds,
      agency_id: agencyId,
      genre_id: null,
      last_seen_at: seen[row.id] ?? fallbackSeen,
      photo: photoVersion(data.photo),
      sns,
      sensitive: data.sensitive === true,
    };
  });

  // 同じグループの推しどうしで、グループのSNSを分け合う(ある推しの記録にだけグループのSNSが入っている場合も、
  // 同じグループの推し全員の新着に出す)。本人のSNSが未登録でも、グループのSNSがあれば取り込みの候補になる
  const groupSns = new Map<string, Oshi["sns"]>();
  for (const o of oshi) {
    for (const s of o.sns) {
      if (s.from === "本人") continue;
      const list = groupSns.get(s.from) ?? [];
      if (!list.some((x) => x.url === s.url)) list.push(s);
      groupSns.set(s.from, list);
    }
  }
  for (const o of oshi) {
    for (const groupId of o.group_ids) {
      const name = categories.get(groupId)?.name ?? "";
      for (const s of groupSns.get(name) ?? []) {
        if (!o.sns.some((x) => x.url === s.url)) o.sns.push(s);
      }
    }
  }

  return {
    oshi,
    categories: [...categories.values()].sort((a, b) => a.name.localeCompare(b.name, "ja")),
  };
}
