import type {
  AdminFeed, AdminStats, AdminUser, AuditLog, Category, FetchLog, Oshi, Source, TimelineItem, Viewer,
} from "@/lib/types";

// デモ表示用の架空データ。実在の人物・団体とは関係ありません。

const now = Date.now();
const ago = (hours: number) => new Date(now - hours * 3600_000).toISOString();

export const demoViewer: Viewer = {
  id: "demo-user",
  email: "demo@example.com",
  displayName: "デモ利用者",
  role: "admin",
 
  plan: "master",
  maxOshi: null,
  maxSources: null,
  oshiCount: 5,
  sourceCount: 18,
  hasMfa: true,
  aal2: true,
  isDemo: true,
};

export const demoCategories: Category[] = [
  { id: "g1", kind: "group", name: "ミナモ区立合唱部" },
  { id: "g2", kind: "group", name: "夜更かしラジオ体操第二" },
  { id: "a1", kind: "agency", name: "しおさいプロダクション" },
  { id: "a2", kind: "agency", name: "個人勢" },
  { id: "j1", kind: "genre", name: "アイドル" },
  { id: "j2", kind: "genre", name: "配信者" },
];

export const demoOshi: Oshi[] = [
  { id: "o1", name: "汐見 うた", color: "#3FC8E4", note: "ソプラノ担当。毎週金曜に歌配信。", group_id: "g1", group_ids: ["g1"], agency_id: "a1", genre_id: "j1", last_seen_at: ago(30), photo: null, sns: [{ platform: "youtube", url: "https://www.youtube.com/@shiomi_uta", from: "本人" }, { platform: "blog", url: "https://minamo-choir.example.com/", from: "ミナモ区立合唱部" }], sensitive: false },
  { id: "o2", name: "波多野 りん", color: "#EC6FA9", note: "", group_id: "g1", group_ids: ["g1"], agency_id: "a1", genre_id: "j1", last_seen_at: ago(6), photo: null, sns: [], sensitive: false },
  { id: "o3", name: "真砂 こはく", color: "#F08A24", note: "Blogの更新が多い。", group_id: "g1", group_ids: ["g1"], agency_id: "a1", genre_id: "j1", last_seen_at: ago(50), photo: null, sns: [], sensitive: false },
  { id: "o4", name: "夜凪 しずく(よなぎ しずく)とても長い名前の表示確認用", color: "#8E5AD6", note: "", group_id: "g2", group_ids: ["g2"], agency_id: "a2", genre_id: "j2", last_seen_at: ago(2), photo: null, sns: [], sensitive: false },
  { id: "o5", name: "灯台守のトーリ", color: "#8CC63F", note: "", group_id: null, group_ids: [], agency_id: "a2", genre_id: "j2", last_seen_at: ago(100), photo: null, sns: [], sensitive: false },
];

const source = (id: string, oshi: string, platform: Source["platform"], handle: string, url: string): Source => ({
  id,
  oshi_id: oshi,
  platform,
  mode: platform === "youtube" || platform === "blog" ? "feed" : platform === "link" || platform === "threads" ? "link" : "embed",
  url,
  handle,
  label: "",
  feed_id: platform === "youtube" || platform === "blog" ? `f-${id}` : null,
});

export const demoSources: Source[] = [
  source("s1", "o1", "youtube", "@shiomi_uta", "https://www.youtube.com/@shiomi_uta"),
  source("s2", "o1", "blog", "blog.example.com", "https://blog.example.com/uta"),
  source("s3", "o1", "x", "@shiomi_uta", "https://x.com/shiomi_uta"),
  source("s4", "o1", "instagram", "@shiomi.uta", "https://www.instagram.com/shiomi.uta/"),
  source("s5", "o1", "tiktok", "@shiomi_uta", "https://www.tiktok.com/@shiomi_uta"),
  source("s18", "o1", "threads", "@shiomi.uta", "https://www.threads.com/@shiomi.uta"),
  source("s6", "o2", "youtube", "@hatano_rin", "https://www.youtube.com/@hatano_rin"),
  source("s7", "o2", "x", "@hatano_rin", "https://x.com/hatano_rin"),
  source("s8", "o2", "instagram", "@rin.hatano", "https://www.instagram.com/rin.hatano/"),
  source("s9", "o3", "blog", "note.example.com", "https://note.example.com/kohaku"),
  source("s10", "o3", "x", "@masago_kohaku", "https://x.com/masago_kohaku"),
  source("s11", "o3", "link", "fanclub.example.com", "https://fanclub.example.com/kohaku"),
  source("s12", "o4", "youtube", "@yonagi_ch", "https://www.youtube.com/@yonagi_ch"),
  source("s13", "o4", "x", "@yonagi_szk", "https://x.com/yonagi_szk"),
  source("s14", "o4", "tiktok", "@yonagi.szk", "https://www.tiktok.com/@yonagi.szk"),
  source("s15", "o5", "youtube", "@toudai_tori", "https://www.youtube.com/@toudai_tori"),
  source("s16", "o5", "blog", "tori.example.com", "https://tori.example.com/"),
  source("s17", "o5", "x", "@toudai_tori", "https://x.com/toudai_tori"),
];

const item = (
  id: string, oshi: string, sourceId: string, platform: "youtube" | "blog", title: string, hours: number,
): TimelineItem => ({
  item_id: id,
  oshi_id: oshi,
  source_id: sourceId,
  platform,
  title,
  url: "https://example.com/",
  thumbnail_url: null,
  published_at: ago(hours),
});

export const demoTimeline: TimelineItem[] = [
  item("i1", "o4", "s12", "youtube", "【雑談】深夜2時、眠れない人だけ集まってください", 1),
  item("i2", "o2", "s6", "youtube", "【歌ってみた】水面に映る月 / 波多野りん", 3),
  item("i3", "o1", "s2", "blog", "定期公演まであと3日。セットリストの話を少しだけ", 5),
  item("i4", "o1", "s1", "youtube", "【歌枠】金曜よる9時の定期配信 #48 リクエスト多めでお届けします、初見さんも常連さんもぜひ最後までゆっくりしていってください", 9),
  item("i5", "o3", "s9", "blog", "衣装合わせの日", 14),
  item("i6", "o5", "s15", "youtube", "灯台の階段を全部数えてみた", 20),
  item("i7", "o3", "s9", "blog", "ツアーの移動中に読んだ本を紹介します(長いタイトルが折り返されず省略されることを確認するための文章です)", 27),
  item("i8", "o2", "s6", "youtube", "りんの朝ごはん vlog", 33),
  item("i9", "o1", "s1", "youtube", "【切り抜き】本番5分前に歌詞が飛んだ話", 41),
  item("i10", "o5", "s16", "blog", "今月の当番表", 52),
  item("i11", "o4", "s12", "youtube", "【ASMR】雨の音と一緒に作業する配信", 60),
  item("i12", "o3", "s9", "blog", "お手紙ありがとうございました", 75),
  item("i13", "o1", "s2", "blog", "新しいマイクが届きました", 90),
  item("i14", "o5", "s15", "youtube", "夜の海を60分ただ眺める", 110),
];

export const demoAdminStats: AdminStats = {
  users: 1284, users_7d: 96, suspended: 3, paid: 142, oshi: 4310, sources: 15872,
  feeds_active: 2640, feeds_error: 7, feeds_paused: 2, items_24h: 5318,
  fetch_ok_24h: 61240, fetch_ng_24h: 318, youtube_units_today: 6420,
};

export const demoAdminUsers: AdminUser[] = [
  { id: "u1", email: "demo@example.com", billing_status: null, suspended_at: null, created_at: ago(2400), plan: "master", oshi_count: 5, source_count: 17 },
  { id: "u2", email: "very.long.mail.address.for.layout.check@subdomain.example.co.jp", billing_status: null, suspended_at: null, created_at: ago(900), plan: "free", oshi_count: 3, source_count: 12 },
  { id: "u3", email: "minato@example.com", billing_status: "active", billing_period_end: ago(-500), suspended_at: null, created_at: ago(480), plan: "paid", oshi_count: 21, source_count: 96 },
  { id: "u4", email: "spam@example.com", billing_status: "canceled", billing_period_end: ago(10), suspended_at: ago(30), created_at: ago(72), plan: "free", oshi_count: 3, source_count: 15 },
  { id: "u5", email: "nagisa@example.com", billing_status: "past_due", billing_period_end: ago(-30), suspended_at: null, created_at: ago(20), plan: "free", oshi_count: 1, source_count: 4 },
];

export const demoAdminFeeds: AdminFeed[] = [
  { id: "f1", platform: "blog", title: "真砂こはくのノート", feed_url: "https://note.example.com/kohaku/rss", status: "error", error_count: 8, last_error: "取得に失敗しました(HTTP 404)", last_fetched_at: ago(40), next_fetch_at: ago(-20), subscribers: 38, items: 24 },
  { id: "f2", platform: "youtube", title: "汐見うた Official", feed_url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxxxxx", status: "active", error_count: 0, last_error: null, last_fetched_at: ago(0.3), next_fetch_at: ago(-0.7), subscribers: 412, items: 20 },
  { id: "f3", platform: "youtube", title: "夜凪しずくチャンネル / とても長いチャンネル名が省略表示されることの確認", feed_url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCyyyyyyyyyyyyyyyyyyyyyy", status: "active", error_count: 2, last_error: "接続できませんでした", last_fetched_at: ago(1.2), next_fetch_at: ago(-2.8), subscribers: 96, items: 20 },
  { id: "f4", platform: "blog", title: "灯台日誌", feed_url: "https://tori.example.com/feed", status: "paused", error_count: 0, last_error: null, last_fetched_at: ago(200), next_fetch_at: ago(190), subscribers: 4, items: 9 },
];

export const demoFetchLogs: FetchLog[] = [
  { id: 5, feed_id: "f2", feed_title: "汐見うた Official", ok: true, items_found: 20, items_added: 1, duration_ms: 412, error: null, created_at: ago(0.3) },
  { id: 4, feed_id: "f3", feed_title: "夜凪しずくチャンネル / とても長いチャンネル名が省略表示されることの確認", ok: false, items_found: 0, items_added: 0, duration_ms: 10004, error: "接続できませんでした", created_at: ago(1.2) },
  { id: 3, feed_id: "f1", feed_title: "真砂こはくのノート", ok: false, items_found: 0, items_added: 0, duration_ms: 230, error: "取得に失敗しました(HTTP 404)", created_at: ago(40) },
  { id: 2, feed_id: "f2", feed_title: "汐見うた Official", ok: true, items_found: 20, items_added: 0, duration_ms: 380, error: null, created_at: ago(1.3) },
];

export const demoAuditLogs: AuditLog[] = [
  { id: 3, admin_email: "demo@example.com", action: "feed.status", target: "f4", detail: "paused", created_at: ago(190) },
  { id: 2, admin_email: "demo@example.com", action: "user.suspend", target: "u4", detail: "", created_at: ago(30) },
  { id: 1, admin_email: "demo@example.com", action: "feed.refetch", target: "f1", detail: "", created_at: ago(41) },
];
