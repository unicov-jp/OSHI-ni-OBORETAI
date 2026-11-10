export type Platform = "youtube" | "blog" | "x" | "instagram" | "threads" | "tiktok" | "link";
export type SourceMode = "feed" | "embed" | "link";
export type CategoryKind = "group" | "agency" | "genre";
export type ViewMode = "oshi" | CategoryKind;
export type Plan = "free" | "pro";

export type Category = {
  id: string;
  kind: CategoryKind;
  name: string;
};

export type Oshi = {
  id: string;
  name: string;
  color: string;
  note: string;
  group_id: string | null;
  agency_id: string | null;
  genre_id: string | null;
  last_seen_at: string;
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
  maxOshi: number;
  maxSources: number;
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
  pro: number;
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
  role: "user" | "admin";
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
