-- 推しに溺れたい: 初期スキーマ
-- 方針:
--  * 利用者が直接書けるのは自分の「推し」「分類」だけ。権限・課金・取得元は利用者から書けない。
--  * 上限(推し数/アカウント数)はDBトリガーで強制する。APIを直接叩かれても破れない。
--  * 二段階認証を登録した利用者は、aal2 のセッションでなければ一切のデータに触れない。
--  * 運営者(admin)は aal2 必須。運営者でも各利用者の推しの中身は読めない(件数のみ)。

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '' check (char_length(display_name) <= 40),
  role text not null default 'user' check (role in ('user', 'admin')),
  suspended_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('group', 'agency', 'genre')),
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (user_id, kind, name)
);

create table public.oshi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#3FC8E4' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  note text not null default '' check (char_length(note) <= 200),
  group_id uuid references public.categories (id) on delete set null,
  agency_id uuid references public.categories (id) on delete set null,
  genre_id uuid references public.categories (id) on delete set null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index oshi_user_idx on public.oshi (user_id, created_at);

-- 取得元。同じYouTubeチャンネル/RSSを複数の利用者が登録しても1件に集約し、取得回数を増やさない。
create table public.feeds (
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
create index feeds_due_idx on public.feeds (next_fetch_at) where status = 'active';

-- 本文と画像は保存しない。保存するのは見出し・リンク・日時・(YouTubeのみ)サムネイルURL。
create table public.feed_items (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.feeds (id) on delete cascade,
  external_id text not null,
  title text not null,
  url text not null check (url ~ '^https?://'),
  thumbnail_url text,
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  unique (feed_id, external_id)
);
create index feed_items_feed_pub_idx on public.feed_items (feed_id, published_at desc);
create index feed_items_fetched_idx on public.feed_items (fetched_at);

-- 推しに紐づくSNSアカウント。登録はサーバー側(URLの検証と取得元の解決が必要)だけが行う。
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  oshi_id uuid not null references public.oshi (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'blog', 'x', 'instagram', 'threads', 'tiktok', 'link')),
  mode text not null check (mode in ('feed', 'embed', 'link')),
  url text not null check (url ~ '^https?://' and char_length(url) <= 500),
  handle text not null default '' check (char_length(handle) <= 100),
  label text not null default '' check (char_length(label) <= 60),
  feed_id uuid references public.feeds (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (oshi_id, url)
);
create index sources_user_feed_idx on public.sources (user_id, feed_id);
create index sources_feed_idx on public.sources (feed_id);
create index sources_oshi_idx on public.sources (oshi_id);

create table public.fetch_logs (
  id bigint generated always as identity primary key,
  feed_id uuid references public.feeds (id) on delete cascade,
  ok boolean not null,
  items_found int not null default 0,
  items_added int not null default 0,
  duration_ms int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index fetch_logs_created_idx on public.fetch_logs (created_at desc);

create table public.api_usage (
  day date not null,
  provider text not null,
  units int not null default 0,
  primary key (day, provider)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- 外部URLの取得を伴う操作の回数制限用(service_role のみ)。
create table public.rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_idx on public.rate_events (user_id, action, created_at desc);

-- ---------------------------------------------------------------------------
-- 判定用の関数
-- ---------------------------------------------------------------------------

create function public.is_pro(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = uid and s.status in ('active', 'trialing')
  );
$$;

-- 上限の正本。無料: 推し3人/アカウント15件、Pro: 推し50人/アカウント300件。
create function public.plan_max_oshi(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.is_pro(uid) then 50 else 3 end;
$$;

create function public.plan_max_sources(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.is_pro(uid) then 300 else 15 end;
$$;

-- 停止されておらず、二段階認証を登録済みなら aal2 で入っていること。
create function public.session_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select
    (select auth.uid()) is not null
    and not exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.suspended_at is not null
    )
    and (
      coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = (select auth.uid()) and f.status = 'verified'
      )
    );
$$;

-- 運営者は二段階認証(aal2)必須。
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin' and p.suspended_at is null
    );
$$;

-- ---------------------------------------------------------------------------
-- トリガー
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.oshi_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  current_count int;
begin
  if tg_op = 'INSERT' then
    -- 同一利用者の同時登録で上限をすり抜けないよう直列化する
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 1));
    select count(*) into current_count from public.oshi o where o.user_id = new.user_id;
    if current_count >= public.plan_max_oshi(new.user_id) then
      raise exception 'OSHI_LIMIT' using errcode = 'P0001';
    end if;
  end if;

  if new.group_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.group_id and c.user_id = new.user_id and c.kind = 'group'
  ) then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if new.agency_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.agency_id and c.user_id = new.user_id and c.kind = 'agency'
  ) then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  if new.genre_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.genre_id and c.user_id = new.user_id and c.kind = 'genre'
  ) then
    raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger oshi_guard_trg
  before insert or update on public.oshi
  for each row execute function public.oshi_guard();

create function public.sources_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  current_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 2));
  if not exists (
    select 1 from public.oshi o where o.id = new.oshi_id and o.user_id = new.user_id
  ) then
    raise exception 'INVALID_OSHI' using errcode = 'P0001';
  end if;
  select count(*) into current_count from public.sources s where s.user_id = new.user_id;
  if current_count >= public.plan_max_sources(new.user_id) then
    raise exception 'SOURCE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sources_guard_trg
  before insert on public.sources
  for each row execute function public.sources_guard();

-- ---------------------------------------------------------------------------
-- 権限と行レベルセキュリティ
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.categories enable row level security;
alter table public.oshi enable row level security;
alter table public.feeds enable row level security;
alter table public.feed_items enable row level security;
alter table public.sources enable row level security;
alter table public.fetch_logs enable row level security;
alter table public.api_usage enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, delete on public.oshi to authenticated;
grant update (name, color, note, group_id, agency_id, genre_id, last_seen_at) on public.oshi to authenticated;
grant select on public.feeds to authenticated;
grant select on public.feed_items to authenticated;
grant select, delete on public.sources to authenticated;
grant update (label) on public.sources to authenticated;
grant select on public.fetch_logs to authenticated;
grant select on public.api_usage to authenticated;
grant select on public.audit_logs to authenticated;


-- 自分のプロフィールは停止中・二段階認証前でも読める(案内画面を出すため)。
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.session_ok()))
  with check (id = (select auth.uid()));

create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()) and (select public.session_ok()));

create policy categories_all on public.categories for all to authenticated
  using (user_id = (select auth.uid()) and (select public.session_ok()))
  with check (user_id = (select auth.uid()) and (select public.session_ok()));

create policy oshi_all on public.oshi for all to authenticated
  using (user_id = (select auth.uid()) and (select public.session_ok()))
  with check (user_id = (select auth.uid()) and (select public.session_ok()));

create policy sources_select on public.sources for select to authenticated
  using (user_id = (select auth.uid()) and (select public.session_ok()));
create policy sources_update on public.sources for update to authenticated
  using (user_id = (select auth.uid()) and (select public.session_ok()))
  with check (user_id = (select auth.uid()));
create policy sources_delete on public.sources for delete to authenticated
  using (user_id = (select auth.uid()) and (select public.session_ok()));

create policy feeds_select on public.feeds for select to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.session_ok())
      and exists (
        select 1 from public.sources s
        where s.feed_id = feeds.id and s.user_id = (select auth.uid())
      )
    )
  );

create policy feed_items_select on public.feed_items for select to authenticated
  using (
    (select public.session_ok())
    and exists (
      select 1 from public.sources s
      where s.feed_id = feed_items.feed_id and s.user_id = (select auth.uid())
    )
  );

create policy fetch_logs_admin on public.fetch_logs for select to authenticated
  using ((select public.is_admin()));
create policy api_usage_admin on public.api_usage for select to authenticated
  using ((select public.is_admin()));
create policy audit_logs_admin on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 利用者向けのビューと関数
-- ---------------------------------------------------------------------------

create view public.timeline with (security_invoker = true) as
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
from public.sources s
join public.feed_items i on i.feed_id = s.feed_id;

revoke all on public.timeline from anon, authenticated;
grant select on public.timeline to authenticated;

create function public.my_plan()
returns table (plan text, max_oshi int, max_sources int, oshi_count int, source_count int)
language sql stable security definer set search_path = '' as $$
  select
    case when public.is_pro((select auth.uid())) then 'pro' else 'free' end,
    public.plan_max_oshi((select auth.uid())),
    public.plan_max_sources((select auth.uid())),
    (select count(*)::int from public.oshi o where o.user_id = (select auth.uid())),
    (select count(*)::int from public.sources s where s.user_id = (select auth.uid()));
$$;

create function public.unread_counts()
returns table (oshi_id uuid, unread int)
language sql stable security invoker set search_path = '' as $$
  select o.id, count(i.id)::int
  from public.oshi o
  join public.sources s on s.oshi_id = o.id
  join public.feed_items i on i.feed_id = s.feed_id and i.published_at > o.last_seen_at
  where o.user_id = (select auth.uid())
  group by o.id;
$$;

-- ---------------------------------------------------------------------------
-- 運営者向けの関数(すべて is_admin() を確認し、変更は監査ログに残す)
-- ---------------------------------------------------------------------------

create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'suspended', (select count(*) from public.profiles where suspended_at is not null),
    'pro', (select count(*) from public.subscriptions where status in ('active', 'trialing')),
    'oshi', (select count(*) from public.oshi),
    'sources', (select count(*) from public.sources),
    'feeds_active', (select count(*) from public.feeds where status = 'active'),
    'feeds_error', (select count(*) from public.feeds where status = 'error'),
    'feeds_paused', (select count(*) from public.feeds where status = 'paused'),
    'items_24h', (select count(*) from public.feed_items where fetched_at > now() - interval '24 hours'),
    'fetch_ok_24h', (select count(*) from public.fetch_logs where ok and created_at > now() - interval '24 hours'),
    'fetch_ng_24h', (select count(*) from public.fetch_logs where not ok and created_at > now() - interval '24 hours'),
    'youtube_units_today', coalesce((
      select units from public.api_usage
      where provider = 'youtube' and day = (now() at time zone 'America/Los_Angeles')::date
    ), 0)
  );
end;
$$;

create function public.admin_list_users(search text default '', page_size int default 50, page_offset int default 0)
returns table (
  id uuid, email text, display_name text, role text, suspended_at timestamptz,
  created_at timestamptz, plan text, oshi_count int, source_count int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select
    p.id, p.email, p.display_name, p.role, p.suspended_at, p.created_at,
    case when public.is_pro(p.id) then 'pro' else 'free' end,
    (select count(*)::int from public.oshi o where o.user_id = p.id),
    (select count(*)::int from public.sources s where s.user_id = p.id)
  from public.profiles p
  where search = '' or p.email ilike '%' || search || '%' or p.display_name ilike '%' || search || '%'
  order by p.created_at desc
  limit least(greatest(page_size, 1), 200) offset greatest(page_offset, 0);
end;
$$;

create function public.admin_list_feeds(only_status text default '', page_size int default 100, page_offset int default 0)
returns table (
  id uuid, platform text, title text, feed_url text, status text, error_count int,
  last_error text, last_fetched_at timestamptz, next_fetch_at timestamptz, subscribers int, items int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select
    f.id, f.platform, f.title, f.feed_url, f.status, f.error_count, f.last_error,
    f.last_fetched_at, f.next_fetch_at,
    (select count(distinct s.user_id)::int from public.sources s where s.feed_id = f.id),
    (select count(*)::int from public.feed_items i where i.feed_id = f.id)
  from public.feeds f
  where only_status = '' or f.status = only_status
  order by (f.status = 'error') desc, f.last_fetched_at desc nulls last
  limit least(greatest(page_size, 1), 200) offset greatest(page_offset, 0);
end;
$$;

create function public.admin_set_suspended(target uuid, suspended boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if target = (select auth.uid()) then
    raise exception 'SELF_CHANGE' using errcode = 'P0001';
  end if;
  update public.profiles
    set suspended_at = case when suspended then now() else null end
    where id = target;
  insert into public.audit_logs (admin_id, action, target)
  values ((select auth.uid()), case when suspended then 'user.suspend' else 'user.resume' end, target::text);
end;
$$;

create function public.admin_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if target = (select auth.uid()) then
    raise exception 'SELF_CHANGE' using errcode = 'P0001';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'INVALID_ROLE' using errcode = 'P0001';
  end if;
  update public.profiles set role = new_role where id = target;
  insert into public.audit_logs (admin_id, action, target, detail)
  values ((select auth.uid()), 'user.role', target::text, new_role);
end;
$$;

create function public.admin_set_feed_status(target uuid, new_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if new_status not in ('active', 'paused') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  update public.feeds
    set status = new_status,
        error_count = case when new_status = 'active' then 0 else error_count end,
        next_fetch_at = case when new_status = 'active' then now() else next_fetch_at end
    where id = target;
  insert into public.audit_logs (admin_id, action, target, detail)
  values ((select auth.uid()), 'feed.status', target::text, new_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- 取得ジョブ用(service_role のみ)
-- ---------------------------------------------------------------------------

-- 取得期限が来たものを排他的に確保する。確保した分は15分先送りし、二重取得を防ぐ。
create function public.claim_due_feeds(batch int default 30) returns setof public.feeds
language sql security definer set search_path = '' as $$
  update public.feeds f
  set next_fetch_at = now() + interval '15 minutes'
  where f.id in (
    select d.id from public.feeds d
    where d.status = 'active'
      and d.next_fetch_at <= now()
      and exists (select 1 from public.sources s where s.feed_id = d.id)
    order by d.next_fetch_at
    limit least(greatest(batch, 1), 100)
    for update skip locked
  )
  returning f.*;
$$;

create function public.bump_api_usage(p_provider text, p_units int) returns void
language sql security definer set search_path = '' as $$
  insert into public.api_usage (day, provider, units)
  values ((now() at time zone 'America/Los_Angeles')::date, p_provider, p_units)
  on conflict (day, provider) do update set units = public.api_usage.units + excluded.units;
$$;

-- 保存期間を過ぎた項目・ログと、誰も登録していない取得元を消す。
create function public.cleanup_old_data(retention_days int default 30) returns void
language sql security definer set search_path = '' as $$
  delete from public.feed_items where fetched_at < now() - make_interval(days => greatest(retention_days, 1));
  delete from public.fetch_logs where created_at < now() - interval '30 days';
  delete from public.rate_events where created_at < now() - interval '1 day';
  delete from public.feeds f
    where f.created_at < now() - interval '1 day'
      and not exists (select 1 from public.sources s where s.feed_id = f.id);
$$;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- 関数の実行権限(最後にまとめて絞る。既定では誰でも実行できてしまうため)
-- ---------------------------------------------------------------------------

revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.session_ok() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_plan() to authenticated;
grant execute on function public.unread_counts() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.admin_list_feeds(text, int, int) to authenticated;
grant execute on function public.admin_set_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_set_feed_status(uuid, text) to authenticated;

grant execute on all functions in schema public to service_role;
