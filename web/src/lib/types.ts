export type Platform = "youtube" | "blog" | "x" | "instagram" | "threads" | "tiktok" | "link";
export type SourceMode = "feed" | "embed" | "link";
export type CategoryKind = "group" | "agency" | "genre";
export type ViewMode = "oshi" | CategoryKind;
export type Plan = "free" | "paid" | "master";

export type Category = {
  id: string;
  kind: CategoryKind;
  name: string;
};

// 今のアプリの記録(oshikatsu_records の kind = 'oshi')から組み立てた推し。
// グループは兼任があるため複数持つ(先頭がメイン)。group_id は先頭のグループ。
export type Oshi = {
  id: string;
  name: string;
  color: string;
  note: string;
  group_id: string | null;
  group_ids: string[];
  agency_id: string | null;
  genre_id: string | null;
  last_seen_at: string;
  // 今のアプリで推しに設定してある写真の版(写真が無ければ null)。/api/oshi-photo/<id>?v=<版> で表示する
  photo: string | null;
  // 今のアプリで推しに登録してあるSNSのURL(取り込みの候補)
  sns: { platform: Platform; url: string; from: string }[];
};

export type Source = {
  id: string;
  oshi_id: string;
  platform: Platform;
  mode: SourceMode;
  url: string;
  handle: string;
  label: string;
  feed_id: string | null;
};

export type TimelineItem = {
  item_id: string;
  oshi_id: string;
  source_id: string;
  platform: Platform;
  title: string;
  url: string;
  thumbnail_url: string | null;
  published_at: string;
};

export type Viewer = {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
  plan: Plan;
  // 上限なし(マスター)は null
  maxOshi: number | null;
  maxSources: number | null;
  oshiCount: number;
  sourceCount: number;
  hasMfa: boolean;
  aal2: boolean;
  isDemo: boolean;
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type AdminStats = {
  users: number;
  users_7d: number;
  suspended: number;
  paid: number;
  oshi: number;
  sources: number;
  feeds_active: number;
  feeds_error: number;
  feeds_paused: number;
  items_24h: number;
  fetch_ok_24h: number;
  fetch_ng_24h: number;
  youtube_units_today: number;
};

export type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  suspended_at: string | null;
  created_at: string;
  plan: Plan;
  oshi_count: number;
  source_count: number;
};

export type AdminFeed = {
  id: string;
  platform: "youtube" | "blog";
  title: string;
  feed_url: string;
  status: "active" | "paused" | "error";
  error_count: number;
  last_error: string | null;
  last_fetched_at: string | null;
  next_fetch_at: string;
  subscribers: number;
  items: number;
};

export type FetchLog = {
  id: number;
  feed_id: string | null;
  feed_title: string;
  ok: boolean;
  items_found: number;
  items_added: number;
  duration_ms: number;
  error: string | null;
  created_at: string;
};

export type AuditLog = {
  id: number;
  admin_email: string;
  action: string;
  target: string;
  detail: string;
  created_at: string;
};

// ギャラリーの写真(推しのギャラリーと、その推しのチェキ)
export type GalleryPhoto = {
  key: string;
  src: string;
  kind: "gallery" | "cheki";
  // チェキはイベント名と日付
  title: string;
  date: string;
};

// カレンダーの記録(LIVE・チェキ)
export type CalendarEntry = {
  id: string;
  type: "live" | "cheki";
  date: string;
  title: string;
  sub: string;
  // LIVE のみ: 編集・マップ・配信・ポスターに使う
  live?: {
    startTime: string;
    venue: string;
    viewing: "venue" | "stream" | "tbd";
    memo: string;
    // Googleマップで会場を開くURL(会場が無ければ空)
    mapUrl: string;
    // 配信のURL(無ければ空)
    streamUrl: string;
    // ポスター(LIVEの写真の1枚目。無ければ空)
    poster: string;
  };
};
