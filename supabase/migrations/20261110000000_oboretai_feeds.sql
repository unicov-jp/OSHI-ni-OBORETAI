-- 推しに溺れたい: 推しのSNS・Blogの新着（添付「推しに溺れたい」0001_init.sql を、今のDBに合わせて作り直したもの）
--
-- 方針（添付と同じ）
--  * 本文と画像は保存しない。保存するのは見出し・リンク・日時・(YouTubeのみ)サムネイルURL。
--  * 同じ YouTube チャンネル / RSS を複数の利用者が登録しても、取得元(feeds)は1件にまとめる。
--  * 利用者が書けるのは、自分の登録(sources)の削除と label の変更だけ。登録はサーバー側が行う（URLの検証と取得元の解決が要るため）。
--  * 上限（登録SNS数）は DB トリガーで強制する。無料 15件 / 有料 300件 / マスター 上限なし。
--  * 二段階認証を登録した利用者は、aal2 のセッションでなければ新着のデータに触れない。
--  * 運営者（マスター）は aal2 必須。運営者でも各利用者が誰を推しているかは読めない（件数のみ）。
--
-- 今のDBに合わせた点
--  * 利用者・プランは oshikatsu_profiles（plan = master / paid / free）を使う。添付の profiles / subscriptions は作らない。
--    「運営者」= マスター。停止のための suspended_at と表示名 display_name の列を足す。
--  * 推しは oshikatsu_records（kind = 'oshi'）の行。oshi_id はその id（文字列）で持つ。
--  * 表・関数・ビューには oshikatsu_ を付けて、既存のものと名前がぶつからないようにする。
--  * 既存の表と関数の権限には触れない（添付の「public の全部の権限を外す」命令は使わない。今のアプリが止まるため）。
--  * 推しの人数の上限（無料3人・有料50人）は、今のアプリの同期を止めないよう、切り替えのときに別のSQLで入れる。
--
-- 何度実行しても同じ結果になるように書いてある。

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 利用者の情報（停止・表示名）
-- ---------------------------------------------------------------------------

alter table public.oshikatsu_profiles add column if not exists suspended_at timestamptz;
alter table public.oshikatsu_profiles add column if not exists display_name text not null default '';
do $$ begin
  alter table public.oshikatsu_profiles add constraint oshikatsu_profiles_display_name_len check (char_length(display_name) <= 40);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 既存の不具合の修正：アカウントを削除すると、記録の履歴を残すトリガーが「削除中のユーザー」の履歴を書こうとして
-- 失敗し、アカウントを削除できなかった。ユーザーが消えるときの削除は履歴に残さない（履歴も一緒に消えるため）。
-- 中身は 20260928010000_oshikatsu_strip_images.sql の版に、この確認だけを足したもの。
-- ---------------------------------------------------------------------------

create or replace function public.oshikatsu_records_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- 削除の印だけで中身が空のときは、直前の中身を残す（画像データは消す）
    if new.deleted and (new.data is null or new.data = '{}'::jsonb) then
      new.data := public.oshikatsu_strip_images(old.data);
    end if;
    if old.data is distinct from new.data or old.deleted is distinct from new.deleted then
      insert into public.oshikatsu_records_history (user_id, kind, id, data, deleted, updated_at, op)
      values (old.user_id, old.kind, old.id, public.oshikatsu_strip_images(old.data), old.deleted, old.updated_at, 'update');
    end if;
    delete from public.oshikatsu_records_history
      where user_id = old.user_id and archived_at < now() - interval '30 days';
    return new;
  else
    -- アカウントの削除に伴う削除（auth.users の行がもう無い）は履歴に残さない
    if exists (select 1 from auth.users u where u.id = old.user_id) then
      insert into public.oshikatsu_records_history (user_id, kind, id, data, deleted, updated_at, op)
      values (old.user_id, old.kind, old.id, public.oshikatsu_strip_images(old.data), old.deleted, old.updated_at, 'delete');
    end if;
    return old;
  end if;
end;
$$;
revoke all on function public.oshikatsu_records_archive() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table if not exists public.oshikatsu_feeds (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('youtube', 'blog')),
  external_key text not null,
  feed_url text not null,
  title text not null default '',
  site_url text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  error_count int not null default 0,
  last_error text,
  last_fetched_at timestamptz,
  next_fetch_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (platform, external_key)
);
create index if not exists oshikatsu_feeds_due_idx on public.oshikatsu_feeds (next_fetch_at) where status = 'active';

create table if not exists public.oshikatsu_feed_items (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.oshikatsu_feeds (id) on delete cascade,
  external_id text not null,
  title text not null,
  url text not null check (url ~ '^https?://'),
  thumbnail_url text,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique (feed_id, external_id)
);
create index if not exists oshikatsu_feed_items_feed_pub_idx on public.oshikatsu_feed_items (feed_id, published_at desc);
create index if not exists oshikatsu_feed_items_fetched_idx on public.oshikatsu_feed_items (fetched_at);

-- 推しに紐づくSNSアカウント。oshi_id は oshikatsu_records の推しの id。
create table if not exists public.oshikatsu_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  oshi_id text not null check (char_length(oshi_id) between 1 and 100),
  platform text not null check (platform in ('youtube', 'blog', 'x', 'instagram', 'threads', 'tiktok', 'link')),
  mode text not null check (mode in ('feed', 'embed', 'link')),
  url text not null check (url ~ '^https?://' and char_length(url) <= 500),
  handle text not null default '' check (char_length(handle) <= 100),
  label text not null default '' check (char_length(label) <= 60),
  feed_id uuid references public.oshikatsu_feeds (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, oshi_id, url)
);
create index if not exists oshikatsu_sources_user_feed_idx on public.oshikatsu_sources (user_id, feed_id);
create index if not exists oshikatsu_sources_feed_idx on public.oshikatsu_sources (feed_id);
create index if not exists oshikatsu_sources_oshi_idx on public.oshikatsu_sources (user_id, oshi_id);

-- 推しごとに「ここまで見た」時刻（未読の数を出すため）。
create table if not exists public.oshikatsu_feed_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  oshi_id text not null check (char_length(oshi_id) between 1 and 100),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, oshi_id)
);

create table if not exists public.oshikatsu_fetch_logs (
  id bigint generated always as identity primary key,
  feed_id uuid references public.oshikatsu_feeds (id) on delete cascade,
  ok boolean not null,
  items_found int not null default 0,
  items_added int not null default 0,
  duration_ms int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists oshikatsu_fetch_logs_created_idx on public.oshikatsu_fetch_logs (created_at desc);

create table if not exists public.oshikatsu_api_usage (
  day date not null,
  provider text not null,
  units int not null default 0,
  primary key (day, provider)
);

create table if not exists public.oshikatsu_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  target text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists oshikatsu_audit_logs_created_idx on public.oshikatsu_audit_logs (created_at desc);

-- 外部URLの取得を伴う操作（SNSの登録・手動更新）の回数制限用（service_role のみ）。
create table if not exists public.oshikatsu_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists oshikatsu_rate_events_idx on public.oshikatsu_rate_events (user_id, action, created_at desc);

-- ---------------------------------------------------------------------------
-- 判定用の関数
-- ---------------------------------------------------------------------------

-- 利用者のプラン（行が無ければ無料）
create or replace function public.oshikatsu_plan_of(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.plan from public.oshikatsu_profiles p where p.user_id = uid), 'free');
$$;

-- 上限の正本。無料: 推し3人 / SNS15件、有料: 推し50人 / SNS300件、マスター: 上限なし（null）。
create or replace function public.oshikatsu_max_oshi(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case public.oshikatsu_plan_of(uid) when 'master' then null when 'paid' then 50 when 'advanced' then 50 else 3 end;
$$;

create or replace function public.oshikatsu_max_sources(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case public.oshikatsu_plan_of(uid) when 'master' then null when 'paid' then 300 when 'advanced' then 300 else 15 end;
$$;

-- 停止されておらず、二段階認証を登録済みなら aal2 で入っていること。
create or replace function public.oshikatsu_session_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select
    (select auth.uid()) is not null
    and not exists (
      select 1 from public.oshikatsu_profiles p
      where p.user_id = (select auth.uid()) and p.suspended_at is not null
    )
    and (
      coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      )
    );
$$;

-- 運営者 = マスター。二段階認証（aal2）必須。
create or replace function public.oshikatsu_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.oshikatsu_profiles p
      where p.user_id = (select auth.uid()) and p.plan = 'master' and p.suspended_at is null
    );
$$;

-- ---------------------------------------------------------------------------
-- トリガー（SNSの登録数の上限と、推しが本人のものかの確認）
-- ---------------------------------------------------------------------------

create or replace function public.oshikatsu_sources_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  current_count int;
  max_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 2));
  if not exists (
    select 1 from public.oshikatsu_records r
    where r.user_id = new.user_id and r.kind = 'oshi' and r.id = new.oshi_id and not r.deleted
  ) then
    raise exception 'INVALID_OSHI' using errcode = 'P0001';
  end if;
  max_count := public.oshikatsu_max_sources(new.user_id);
  if max_count is not null then
    select count(*) into current_count from public.oshikatsu_sources s where s.user_id = new.user_id;
    if current_count >= max_count then
      raise exception 'SOURCE_LIMIT' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists oshikatsu_sources_guard_trg on public.oshikatsu_sources;
create trigger oshikatsu_sources_guard_trg
  before insert on public.oshikatsu_sources
  for each row execute function public.oshikatsu_sources_guard();

-- ---------------------------------------------------------------------------
-- 権限と行レベルセキュリティ（新しい表だけ）
-- ---------------------------------------------------------------------------

alter table public.oshikatsu_feeds enable row level security;
alter table public.oshikatsu_feed_items enable row level security;
alter table public.oshikatsu_sources enable row level security;
alter table public.oshikatsu_feed_seen enable row level security;
alter table public.oshikatsu_fetch_logs enable row level security;
alter table public.oshikatsu_api_usage enable row level security;
alter table public.oshikatsu_audit_logs enable row level security;
alter table public.oshikatsu_rate_events enable row level security;

revoke all on public.oshikatsu_feeds, public.oshikatsu_feed_items, public.oshikatsu_sources, public.oshikatsu_feed_seen,
  public.oshikatsu_fetch_logs, public.oshikatsu_api_usage, public.oshikatsu_audit_logs, public.oshikatsu_rate_events
  from anon, authenticated;

grant select on public.oshikatsu_feeds to authenticated;
grant select on public.oshikatsu_feed_items to authenticated;
grant select, delete on public.oshikatsu_sources to authenticated;
grant update (label) on public.oshikatsu_sources to authenticated;
grant select, insert, update on public.oshikatsu_feed_seen to authenticated;
grant select on public.oshikatsu_fetch_logs to authenticated;
grant select on public.oshikatsu_api_usage to authenticated;
grant select on public.oshikatsu_audit_logs to authenticated;

drop policy if exists oshikatsu_sources_select on public.oshikatsu_sources;
create policy oshikatsu_sources_select on public.oshikatsu_sources for select to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));
drop policy if exists oshikatsu_sources_update on public.oshikatsu_sources;
create policy oshikatsu_sources_update on public.oshikatsu_sources for update to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()))
  with check (user_id = (select auth.uid()));
drop policy if exists oshikatsu_sources_delete on public.oshikatsu_sources;
create policy oshikatsu_sources_delete on public.oshikatsu_sources for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));

drop policy if exists oshikatsu_feed_seen_all on public.oshikatsu_feed_seen;
create policy oshikatsu_feed_seen_all on public.oshikatsu_feed_seen for all to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()))
  with check (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));

drop policy if exists oshikatsu_feeds_select on public.oshikatsu_feeds;
create policy oshikatsu_feeds_select on public.oshikatsu_feeds for select to authenticated
  using (
    (select public.oshikatsu_is_admin())
    or (
      (select public.oshikatsu_session_ok())
      and exists (
        select 1 from public.oshikatsu_sources s
        where s.feed_id = oshikatsu_feeds.id and s.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists oshikatsu_feed_items_select on public.oshikatsu_feed_items;
create policy oshikatsu_feed_items_select on public.oshikatsu_feed_items for select to authenticated
  using (
    (select public.oshikatsu_session_ok())
    and exists (
      select 1 from public.oshikatsu_sources s
      where s.feed_id = oshikatsu_feed_items.feed_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists oshikatsu_fetch_logs_admin on public.oshikatsu_fetch_logs;
create policy oshikatsu_fetch_logs_admin on public.oshikatsu_fetch_logs for select to authenticated
  using ((select public.oshikatsu_is_admin()));
drop policy if exists oshikatsu_api_usage_admin on public.oshikatsu_api_usage;
create policy oshikatsu_api_usage_admin on public.oshikatsu_api_usage for select to authenticated
  using ((select public.oshikatsu_is_admin()));
drop policy if exists oshikatsu_audit_logs_admin on public.oshikatsu_audit_logs;
create policy oshikatsu_audit_logs_admin on public.oshikatsu_audit_logs for select to authenticated
  using ((select public.oshikatsu_is_admin()));

-- ---------------------------------------------------------------------------
-- 利用者向けのビューと関数
-- ---------------------------------------------------------------------------

create or replace view public.oshikatsu_timeline with (security_invoker = true) as
select
  s.user_id,
  s.oshi_id,
  s.id as source_id,
  s.platform,
  i.id as item_id,
  i.title,
  i.url,
  i.thumbnail_url,
  i.published_at
from public.oshikatsu_sources s
join public.oshikatsu_feed_items i on i.feed_id = s.feed_id;

revoke all on public.oshikatsu_timeline from anon, authenticated;
grant select on public.oshikatsu_timeline to authenticated;

-- 自分のプランと上限・使用数（上限なしは null）
create or replace function public.oshikatsu_my_plan()
returns table (plan text, max_oshi int, max_sources int, oshi_count int, source_count int)
language sql stable security definer set search_path = '' as $$
  select
    public.oshikatsu_plan_of((select auth.uid())),
    public.oshikatsu_max_oshi((select auth.uid())),
    public.oshikatsu_max_sources((select auth.uid())),
    (select count(*)::int from public.oshikatsu_records r
      where r.user_id = (select auth.uid()) and r.kind = 'oshi' and not r.deleted),
    (select count(*)::int from public.oshikatsu_sources s where s.user_id = (select auth.uid()));
$$;

-- 推しごとの未読の数（「ここまで見た」より新しい項目。見たことの無い推しは7日前から数える）
create or replace function public.oshikatsu_unread_counts()
returns table (oshi_id text, unread int)
language sql stable security invoker set search_path = '' as $$
  select s.oshi_id, count(i.id)::int
  from public.oshikatsu_sources s
  join public.oshikatsu_feed_items i on i.feed_id = s.feed_id
  left join public.oshikatsu_feed_seen v on v.user_id = s.user_id and v.oshi_id = s.oshi_id
  where s.user_id = (select auth.uid())
    and i.published_at > coalesce(v.last_seen_at, now() - interval '7 days')
  group by s.oshi_id;
$$;

-- ---------------------------------------------------------------------------
-- 運営者（マスター）向けの関数。すべて oshikatsu_is_admin() を確認し、変更は監査ログに残す
-- ---------------------------------------------------------------------------

create or replace function public.oshikatsu_admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.oshikatsu_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.oshikatsu_profiles),
    'users_7d', (select count(*) from public.oshikatsu_profiles where created_at > now() - interval '7 days'),
    'suspended', (select count(*) from public.oshikatsu_profiles where suspended_at is not null),
    'paid', (select count(*) from public.oshikatsu_profiles where plan = 'paid'),
    'oshi', (select count(*) from public.oshikatsu_records where kind = 'oshi' and not deleted),
    'sources', (select count(*) from public.oshikatsu_sources),
    'feeds_active', (select count(*) from public.oshikatsu_feeds where status = 'active'),
    'feeds_error', (select count(*) from public.oshikatsu_feeds where status = 'error'),
    'feeds_paused', (select count(*) from public.oshikatsu_feeds where status = 'paused'),
    'items_24h', (select count(*) from public.oshikatsu_feed_items where fetched_at > now() - interval '24 hours'),
    'fetch_ok_24h', (select count(*) from public.oshikatsu_fetch_logs where ok and created_at > now() - interval '24 hours'),
    'fetch_ng_24h', (select count(*) from public.oshikatsu_fetch_logs where not ok and created_at > now() - interval '24 hours'),
    'youtube_units_today', coalesce((
      select units from public.oshikatsu_api_usage
      where provider = 'youtube' and day = (now() at time zone 'America/Los_Angeles')::date
    ), 0)
  );
end;
$$;

create or replace function public.oshikatsu_admin_list_feeds(only_status text default '', page_size int default 100, page_offset int default 0)
returns table (
  id uuid, platform text, title text, feed_url text, status text, error_count int,
  last_error text, last_fetched_at timestamptz, next_fetch_at timestamptz, subscribers int, items int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.oshikatsu_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select
    f.id, f.platform, f.title, f.feed_url, f.status, f.error_count, f.last_error,
    f.last_fetched_at, f.next_fetch_at,
    (select count(distinct s.user_id)::int from public.oshikatsu_sources s where s.feed_id = f.id),
    (select count(*)::int from public.oshikatsu_feed_items i where i.feed_id = f.id)
  from public.oshikatsu_feeds f
  where only_status = '' or f.status = only_status
  order by (f.status = 'error') desc, f.last_fetched_at desc nulls last
  limit least(greatest(page_size, 1), 200) offset greatest(page_offset, 0);
end;
$$;

create or replace function public.oshikatsu_admin_set_suspended(target uuid, suspended boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.oshikatsu_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if target = (select auth.uid()) then
    raise exception 'SELF_CHANGE' using errcode = 'P0001';
  end if;
  update public.oshikatsu_profiles
    set suspended_at = case when suspended then now() else null end
    where user_id = target;
  insert into public.oshikatsu_audit_logs (admin_id, action, target)
  values ((select auth.uid()), case when suspended then 'user.suspend' else 'user.resume' end, target::text);
end;
$$;

create or replace function public.oshikatsu_admin_set_feed_status(target uuid, new_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.oshikatsu_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if new_status not in ('active', 'paused') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  update public.oshikatsu_feeds
    set status = new_status,
        error_count = case when new_status = 'active' then 0 else error_count end,
        next_fetch_at = case when new_status = 'active' then now() else next_fetch_at end
    where id = target;
  insert into public.oshikatsu_audit_logs (admin_id, action, target, detail)
  values ((select auth.uid()), 'feed.status', target::text, new_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 取得ジョブ用（service_role のみ）
-- ---------------------------------------------------------------------------

-- 取得期限が来たもの（only_user を渡すと、その利用者が登録したものだけ）を排他的に確保する。
-- 確保した分は15分先送りし、二重取得を防ぐ。
create or replace function public.oshikatsu_claim_due_feeds(batch int default 30, only_user uuid default null)
returns setof public.oshikatsu_feeds
language sql security definer set search_path = '' as $$
  update public.oshikatsu_feeds f
  set next_fetch_at = now() + interval '15 minutes'
  where f.id in (
    select d.id from public.oshikatsu_feeds d
    where d.status = 'active'
      and d.next_fetch_at <= now()
      and exists (
        select 1 from public.oshikatsu_sources s
        where s.feed_id = d.id and (only_user is null or s.user_id = only_user)
      )
    order by d.next_fetch_at
    limit least(greatest(batch, 1), 100)
    for update skip locked
  )
  returning f.*;
$$;

create or replace function public.oshikatsu_bump_api_usage(p_provider text, p_units int) returns void
language sql security definer set search_path = '' as $$
  insert into public.oshikatsu_api_usage (day, provider, units)
  values ((now() at time zone 'America/Los_Angeles')::date, p_provider, p_units)
  on conflict (day, provider) do update set units = public.oshikatsu_api_usage.units + excluded.units;
$$;

-- 保存期間を過ぎた項目・ログと、誰も登録していない取得元を消す。
-- 古いデータの片付け(毎日の自動取得のあとに呼ぶ)。
-- 新着(YouTube・Blog)は期間では消さず、取得元ごとに新しい順で keep_per_feed 件まで残す(容量を一定に保つ)。
-- retention_days を 1 以上にしたときだけ、それより古いもの(公開日)も消す。0 は期間の制限なし
drop function if exists public.oshikatsu_cleanup_old_data(int);
create or replace function public.oshikatsu_cleanup_old_data(retention_days int default 0, keep_per_feed int default 500) returns void
language sql security definer set search_path = '' as $$
  delete from public.oshikatsu_feed_items i
    using (
      select id from (
        select id, row_number() over (partition by feed_id order by published_at desc) as n
        from public.oshikatsu_feed_items
      ) ranked
      where ranked.n > greatest(keep_per_feed, 50)
    ) extra
    where i.id = extra.id;
  delete from public.oshikatsu_feed_items
    where retention_days > 0 and published_at < now() - make_interval(days => retention_days);
  delete from public.oshikatsu_fetch_logs where created_at < now() - interval '30 days';
  delete from public.oshikatsu_rate_events where created_at < now() - interval '1 day';
  delete from public.oshikatsu_feeds f
    where f.created_at < now() - interval '1 day'
      and not exists (select 1 from public.oshikatsu_sources s where s.feed_id = f.id);
$$;

-- 手動の「更新」用：その利用者が登録した取得元のうち、前回の取得から min_age_minutes 分以上たったものを確保する。
-- 確保した時点で last_fetched_at を進め、同時に押されても二重に取得しないようにする（service_role のみ）。
create or replace function public.oshikatsu_claim_user_feeds(uid uuid, min_age_minutes int default 10, batch int default 30)
returns setof public.oshikatsu_feeds
language sql security definer set search_path = '' as $$
  update public.oshikatsu_feeds f
  set last_fetched_at = now()
  where f.id in (
    select d.id from public.oshikatsu_feeds d
    where d.status = 'active'
      and (d.last_fetched_at is null or d.last_fetched_at < now() - make_interval(mins => greatest(min_age_minutes, 1)))
      and exists (select 1 from public.oshikatsu_sources s where s.feed_id = d.id and s.user_id = uid)
    order by d.last_fetched_at nulls first
    limit least(greatest(batch, 1), 100)
    for update skip locked
  )
  returning f.*;
$$;

-- 自分の表示名を変える（プランなど他の列は変えられない）
create or replace function public.oshikatsu_set_display_name(new_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.oshikatsu_session_ok() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(new_name, ''))) > 40 then
    raise exception 'TOO_LONG' using errcode = 'P0001';
  end if;
  update public.oshikatsu_profiles set display_name = btrim(coalesce(new_name, '')), updated_at = now()
    where user_id = (select auth.uid());
end;
$$;

-- 決済状況(Stripe)。値を書き込むのは Stripe の Webhook(サーバーの秘密鍵)だけで、利用者本人は書き換えられない(更新の権限は plan 列だけ)
alter table public.oshikatsu_profiles
  add column if not exists stripe_customer_id text,
  add column if not exists billing_status text,            -- Stripe の契約の状態(active / trialing / past_due / canceled / unpaid / incomplete など)
  add column if not exists billing_period_end timestamptz; -- 次の更新日(解約済みなら利用できる最終日)

-- 運営者向け：利用者の一覧(メール・プラン・決済状況。推し・SNSは件数だけで中身は見ない)。返す列を変えたため、いったん消して作り直す
drop function if exists public.oshikatsu_admin_list_users(text, int, int);
create function public.oshikatsu_admin_list_users(search text default '', page_size int default 50, page_offset int default 0)
returns table (
  id uuid, email text, plan text, billing_status text, billing_period_end timestamptz,
  suspended_at timestamptz, created_at timestamptz, oshi_count int, source_count int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.oshikatsu_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select
    p.user_id, coalesce(p.email, ''), p.plan, p.billing_status, p.billing_period_end, p.suspended_at, p.created_at,
    (select count(*)::int from public.oshikatsu_records r where r.user_id = p.user_id and r.kind = 'oshi' and not r.deleted),
    (select count(*)::int from public.oshikatsu_sources s where s.user_id = p.user_id)
  from public.oshikatsu_profiles p
  where coalesce(search, '') = ''
    or p.email ilike '%' || search || '%'
  order by case p.plan when 'master' then 1 when 'advanced' then 2 when 'paid' then 3 else 4 end, p.created_at desc
  limit least(greatest(page_size, 1), 200) offset greatest(page_offset, 0);
end;
$$;

-- 運営者向け：プランの変更（自分自身は変えられない）。操作ログに残す
create or replace function public.oshikatsu_admin_set_plan(target uuid, new_plan text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.oshikatsu_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if target = (select auth.uid()) then
    raise exception 'SELF_CHANGE' using errcode = 'P0001';
  end if;
  if new_plan not in ('master', 'advanced', 'paid', 'free') then
    raise exception 'INVALID_PLAN' using errcode = 'P0001';
  end if;
  update public.oshikatsu_profiles set plan = new_plan, updated_at = now() where user_id = target;
  insert into public.oshikatsu_audit_logs (admin_id, action, target, detail)
  values ((select auth.uid()), 'user.plan', target::text, new_plan);
end;
$$;

grant all on public.oshikatsu_feeds, public.oshikatsu_feed_items, public.oshikatsu_sources, public.oshikatsu_feed_seen,
  public.oshikatsu_fetch_logs, public.oshikatsu_api_usage, public.oshikatsu_audit_logs, public.oshikatsu_rate_events
  to service_role;
grant usage, select on sequence public.oshikatsu_fetch_logs_id_seq, public.oshikatsu_audit_logs_id_seq,
  public.oshikatsu_rate_events_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- 関数の実行権限（この SQL で作ったものだけを絞る）
-- ---------------------------------------------------------------------------

revoke all on function public.oshikatsu_plan_of(uuid) from public, anon, authenticated;
revoke all on function public.oshikatsu_max_oshi(uuid) from public, anon, authenticated;
revoke all on function public.oshikatsu_max_sources(uuid) from public, anon, authenticated;
revoke all on function public.oshikatsu_session_ok() from public, anon;
revoke all on function public.oshikatsu_is_admin() from public, anon;
revoke all on function public.oshikatsu_sources_guard() from public, anon, authenticated;
revoke all on function public.oshikatsu_my_plan() from public, anon;
revoke all on function public.oshikatsu_unread_counts() from public, anon;
revoke all on function public.oshikatsu_admin_stats() from public, anon;
revoke all on function public.oshikatsu_admin_list_feeds(text, int, int) from public, anon;
revoke all on function public.oshikatsu_admin_set_suspended(uuid, boolean) from public, anon;
revoke all on function public.oshikatsu_admin_set_feed_status(uuid, text) from public, anon;
revoke all on function public.oshikatsu_claim_due_feeds(int, uuid) from public, anon, authenticated;
revoke all on function public.oshikatsu_bump_api_usage(text, int) from public, anon, authenticated;
revoke all on function public.oshikatsu_cleanup_old_data(int, int) from public, anon, authenticated;
revoke all on function public.oshikatsu_claim_user_feeds(uuid, int, int) from public, anon, authenticated;
revoke all on function public.oshikatsu_set_display_name(text) from public, anon;
revoke all on function public.oshikatsu_admin_list_users(text, int, int) from public, anon;
revoke all on function public.oshikatsu_admin_set_plan(uuid, text) from public, anon;

grant execute on function public.oshikatsu_session_ok() to authenticated;
grant execute on function public.oshikatsu_is_admin() to authenticated;
grant execute on function public.oshikatsu_my_plan() to authenticated;
grant execute on function public.oshikatsu_unread_counts() to authenticated;
grant execute on function public.oshikatsu_admin_stats() to authenticated;
grant execute on function public.oshikatsu_admin_list_feeds(text, int, int) to authenticated;
grant execute on function public.oshikatsu_admin_set_suspended(uuid, boolean) to authenticated;
grant execute on function public.oshikatsu_admin_set_feed_status(uuid, text) to authenticated;
grant execute on function public.oshikatsu_set_display_name(text) to authenticated;
grant execute on function public.oshikatsu_admin_list_users(text, int, int) to authenticated;
grant execute on function public.oshikatsu_admin_set_plan(uuid, text) to authenticated;

grant execute on function public.oshikatsu_plan_of(uuid) to service_role;
grant execute on function public.oshikatsu_max_oshi(uuid) to service_role;
grant execute on function public.oshikatsu_max_sources(uuid) to service_role;
grant execute on function public.oshikatsu_claim_due_feeds(int, uuid) to service_role;
grant execute on function public.oshikatsu_bump_api_usage(text, int) to service_role;
grant execute on function public.oshikatsu_cleanup_old_data(int, int) to service_role;
grant execute on function public.oshikatsu_claim_user_feeds(uuid, int, int) to service_role;

-- ============ Subscription の料金(推し1人ごとの加算) ============
-- 無料の人数(3人)を超えた推し1人ごとに、月額◯円を加算する。管理画面の「料金」から変える。料金ページはログインしていなくても読める
-- (以前の段階制の表 oshikatsu_price_tiers は使わないので消す)
drop function if exists public.oshikatsu_admin_set_price_tiers(jsonb);
drop table if exists public.oshikatsu_price_tiers;

create table if not exists public.oshikatsu_price_settings (
  id           boolean     primary key default true check (id),  -- 1行だけ
  per_oshi_yen int         not null check (per_oshi_yen between 0 and 100000),
  updated_at   timestamptz not null default now()
);
alter table public.oshikatsu_price_settings enable row level security;
drop policy if exists "oshikatsu_price_settings_select" on public.oshikatsu_price_settings;
create policy "oshikatsu_price_settings_select" on public.oshikatsu_price_settings for select to anon, authenticated using (true);
revoke all on public.oshikatsu_price_settings from anon, authenticated;
grant select on public.oshikatsu_price_settings to anon, authenticated;

-- Advanced プランの推し1人あたりの月額(既定100円)
alter table public.oshikatsu_price_settings
  add column if not exists advanced_per_oshi_yen int not null default 100 check (advanced_per_oshi_yen between 0 and 100000);

-- 運営者向け：推し1人あたりの月額(有料・Advanced)を変える。操作ログに残す
drop function if exists public.oshikatsu_admin_set_price(int);
create or replace function public.oshikatsu_admin_set_price(per_oshi int, advanced_per_oshi int default 100) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.oshikatsu_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if per_oshi is null or per_oshi < 0 or per_oshi > 100000
     or advanced_per_oshi is null or advanced_per_oshi < 0 or advanced_per_oshi > 100000 then
    raise exception 'INVALID_PRICE' using errcode = 'P0001';
  end if;
  insert into public.oshikatsu_price_settings (id, per_oshi_yen, advanced_per_oshi_yen, updated_at)
  values (true, per_oshi, advanced_per_oshi, now())
  on conflict (id) do update
    set per_oshi_yen = excluded.per_oshi_yen, advanced_per_oshi_yen = excluded.advanced_per_oshi_yen, updated_at = now();
  insert into public.oshikatsu_audit_logs (admin_id, action, target, detail)
  values ((select auth.uid()), 'price.per_oshi', 'subscription', per_oshi::text || ' / advanced ' || advanced_per_oshi::text);
end;
$$;
revoke all on function public.oshikatsu_admin_set_price(int, int) from public, anon;
grant execute on function public.oshikatsu_admin_set_price(int, int) to authenticated;

-- ============ プラン名(表示名) ============
-- master / paid / free の表示名を管理画面の「料金」から変える。未設定なら画面側の既定(Developer・有料・無料)を使う
create table if not exists public.oshikatsu_plan_names (
  plan       text        primary key check (plan in ('master', 'advanced', 'paid', 'free')),
  label      text        not null check (char_length(label) between 1 and 20),
  updated_at timestamptz not null default now()
);
alter table public.oshikatsu_plan_names enable row level security;
drop policy if exists "oshikatsu_plan_names_select" on public.oshikatsu_plan_names;
create policy "oshikatsu_plan_names_select" on public.oshikatsu_plan_names for select to anon, authenticated using (true);
revoke all on public.oshikatsu_plan_names from anon, authenticated;
grant select on public.oshikatsu_plan_names to anon, authenticated;

-- 運営者向け：プラン名をまとめて変える({"master":"Developer","paid":"有料","free":"無料"})。操作ログに残す
create or replace function public.oshikatsu_admin_set_plan_names(names jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k text;
begin
  if not public.oshikatsu_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(names) <> 'object' then
    raise exception 'INVALID_NAMES' using errcode = 'P0001';
  end if;
  for k in select jsonb_object_keys(names) loop
    if k not in ('master', 'advanced', 'paid', 'free') then
      raise exception 'INVALID_NAMES' using errcode = 'P0001';
    end if;
    insert into public.oshikatsu_plan_names (plan, label, updated_at) values (k, trim(names->>k), now())
    on conflict (plan) do update set label = excluded.label, updated_at = now();
  end loop;
  insert into public.oshikatsu_audit_logs (admin_id, action, target, detail)
  values ((select auth.uid()), 'plan.names', 'plans', names::text);
end;
$$;
revoke all on function public.oshikatsu_admin_set_plan_names(jsonb) from public, anon;
grant execute on function public.oshikatsu_admin_set_plan_names(jsonb) to authenticated;

-- ============ Advanced プランと、新しく足したサービス ============
-- プランに advanced(Fantia・myfans・xfans も使える)を足す。登録済みの利用者・SNS はそのまま
do $$
declare c text;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.oshikatsu_profiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%plan%'
  loop
    execute format('alter table public.oshikatsu_profiles drop constraint %I', c);
  end loop;
  for c in select conname from pg_constraint
    where conrelid = 'public.oshikatsu_plan_names'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%plan%'
  loop
    execute format('alter table public.oshikatsu_plan_names drop constraint %I', c);
  end loop;
  -- SNSの種類に Fantia・myfans・xfans・FANZA を足す
  for c in select conname from pg_constraint
    where conrelid = 'public.oshikatsu_sources'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%platform%'
  loop
    execute format('alter table public.oshikatsu_sources drop constraint %I', c);
  end loop;
end $$;
alter table public.oshikatsu_profiles
  add constraint oshikatsu_profiles_plan_check check (plan in ('master', 'advanced', 'paid', 'free'));
alter table public.oshikatsu_plan_names
  add constraint oshikatsu_plan_names_plan_check check (plan in ('master', 'advanced', 'paid', 'free'));
alter table public.oshikatsu_sources
  add constraint oshikatsu_sources_platform_check
  check (platform in ('youtube', 'blog', 'x', 'instagram', 'threads', 'tiktok', 'link', 'fantia', 'myfans', 'xfans', 'fanza'));

-- プラン名の変更: Starter → Pro、Advanced → Sensitive(管理画面で別の名前にしていれば、その名前のまま)
update public.oshikatsu_plan_names set label = 'Pro', updated_at = now() where plan = 'paid' and label = 'Starter';
update public.oshikatsu_plan_names set label = 'Sensitive', updated_at = now() where plan = 'advanced' and label = 'Advanced';

-- 保存した投稿(Developer が反応ボタンの短押しで保存する)。新着の整理(古い新着の削除)とは別に持つので、期間無制限で残る
create table if not exists public.oshikatsu_saved_posts (
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null check (url ~ '^https?://' and char_length(url) <= 500),
  oshi_id text not null check (char_length(oshi_id) between 1 and 100),
  platform text not null check (char_length(platform) between 1 and 40),
  title text not null default '' check (char_length(title) <= 300),
  thumbnail_url text check (thumbnail_url is null or (thumbnail_url ~ '^https://' and char_length(thumbnail_url) <= 1000)),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, url)
);
create index if not exists oshikatsu_saved_posts_user_created_idx on public.oshikatsu_saved_posts (user_id, created_at desc);
alter table public.oshikatsu_saved_posts enable row level security;
revoke all on public.oshikatsu_saved_posts from anon, authenticated;
grant select, insert, delete on public.oshikatsu_saved_posts to authenticated;
drop policy if exists oshikatsu_saved_posts_select on public.oshikatsu_saved_posts;
create policy oshikatsu_saved_posts_select on public.oshikatsu_saved_posts for select to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));
drop policy if exists oshikatsu_saved_posts_insert on public.oshikatsu_saved_posts;
create policy oshikatsu_saved_posts_insert on public.oshikatsu_saved_posts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.oshikatsu_session_ok())
    and exists (
      select 1 from public.oshikatsu_profiles p
      where p.user_id = (select auth.uid()) and p.plan = 'master' and p.suspended_at is null
    )
  );
drop policy if exists oshikatsu_saved_posts_delete on public.oshikatsu_saved_posts;
create policy oshikatsu_saved_posts_delete on public.oshikatsu_saved_posts for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));

-- 個別に追加した投稿(推しのメニューの「個別投稿の更新」で、過去の YouTube 動画などをURLで足す)。
-- 推しのフィードの先頭に並ぶ。新着の整理とは別に持つので消えない
create table if not exists public.oshikatsu_manual_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  oshi_id text not null check (char_length(oshi_id) between 1 and 100),
  platform text not null check (platform in ('youtube')),
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  title text not null default '' check (char_length(title) <= 300),
  thumbnail_url text check (thumbnail_url is null or (thumbnail_url ~ '^https://' and char_length(thumbnail_url) <= 1000)),
  created_at timestamptz not null default now(),
  unique (user_id, oshi_id, url)
);
create index if not exists oshikatsu_manual_posts_oshi_idx on public.oshikatsu_manual_posts (user_id, oshi_id, created_at desc);
alter table public.oshikatsu_manual_posts enable row level security;
revoke all on public.oshikatsu_manual_posts from anon, authenticated;
grant select, insert, delete on public.oshikatsu_manual_posts to authenticated;
drop policy if exists oshikatsu_manual_posts_all on public.oshikatsu_manual_posts;
create policy oshikatsu_manual_posts_all on public.oshikatsu_manual_posts for all to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()))
  with check (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));

-- 既読にした新着(YouTube・Blog)。新着の画面でその投稿を表示したら1件ずつ記録する。新着が整理で消えると一緒に消える
create table if not exists public.oshikatsu_item_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.oshikatsu_feed_items (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index if not exists oshikatsu_item_reads_item_idx on public.oshikatsu_item_reads (item_id);
alter table public.oshikatsu_item_reads enable row level security;
revoke all on public.oshikatsu_item_reads from anon, authenticated;
grant select, insert on public.oshikatsu_item_reads to authenticated;
drop policy if exists oshikatsu_item_reads_select on public.oshikatsu_item_reads;
create policy oshikatsu_item_reads_select on public.oshikatsu_item_reads for select to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));
drop policy if exists oshikatsu_item_reads_insert on public.oshikatsu_item_reads;
create policy oshikatsu_item_reads_insert on public.oshikatsu_item_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));

-- 上部の推しのアイコンの数字 = まだ表示していない新着(YouTube・Blog)の件数。
-- 対象は、SNSを登録した後に出た投稿のうち直近30日のもの(登録前の過去の投稿は数えない)
create or replace function public.oshikatsu_unread_counts()
returns table (oshi_id text, unread int)
language sql stable security invoker set search_path = '' as $$
  select s.oshi_id, count(distinct i.id)::int
  from public.oshikatsu_sources s
  join public.oshikatsu_feed_items i on i.feed_id = s.feed_id
  left join public.oshikatsu_item_reads r on r.user_id = s.user_id and r.item_id = i.id
  where s.user_id = (select auth.uid())
    and r.item_id is null
    and i.published_at > greatest(s.created_at, now() - interval '30 days')
  group by s.oshi_id;
$$;
revoke all on function public.oshikatsu_unread_counts() from public, anon;
grant execute on function public.oshikatsu_unread_counts() to authenticated;

-- X・Instagram・TikTok の投稿の既読(これらは新着として保存せず、開くたびに取りに行くので、投稿の番号だけを利用者ごとに覚える)。
-- post_key は x:<番号> / ig:<コード> / tt:<番号>。baseline は SNS を登録した時点ですでにあった投稿(未読に数えない)
create table if not exists public.oshikatsu_post_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.oshikatsu_sources (id) on delete cascade,
  post_key text not null check (char_length(post_key) between 3 and 80),
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  baseline boolean not null default false,
  read_at timestamptz,
  primary key (user_id, source_id, post_key)
);
create index if not exists oshikatsu_post_states_key_idx on public.oshikatsu_post_states (user_id, post_key);
alter table public.oshikatsu_post_states enable row level security;
revoke all on public.oshikatsu_post_states from anon, authenticated;
grant select, insert, delete on public.oshikatsu_post_states to authenticated;
grant update (read_at) on public.oshikatsu_post_states to authenticated;
drop policy if exists oshikatsu_post_states_all on public.oshikatsu_post_states;
create policy oshikatsu_post_states_all on public.oshikatsu_post_states for all to authenticated
  using (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()))
  with check (user_id = (select auth.uid()) and (select public.oshikatsu_session_ok()));

-- 追加した表・関数をすぐ使えるように、Supabase のAPIの一覧を読み直させる
notify pgrst, 'reload schema';
