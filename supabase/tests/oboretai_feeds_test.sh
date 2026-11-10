#!/bin/bash
H=${PGHOST_DIR:-/var/lib/postgresql/pgtest-oboretai}; DB=${PGDB:-t}
U1=11111111-1111-1111-1111-111111111111; U2=22222222-2222-2222-2222-222222222222; U3=33333333-3333-3333-3333-333333333333
pass=0; fail=0
q(){ psql -h $H -p 5499 -U postgres -d $DB -Atq -c "$1" 2>&1 | tr '\n' ' ' | sed 's/ *$//'; }
# as(user, aal, sql)
as(){ psql -h $H -p 5499 -U postgres -d $DB -Atq <<SQL 2>&1 | tr '\n' ' ' | sed 's/ *$//'
begin;
select set_config('request.jwt.claim.sub','$1',true), set_config('request.jwt.claims','{"sub":"$1","aal":"$2","role":"authenticated"}',true) \g /dev/null
set local role authenticated;
$3
rollback;
SQL
}
svc(){ psql -h $H -p 5499 -U postgres -d $DB -Atq <<SQL 2>&1 | tr '\n' ' ' | sed 's/ *$//'
begin; set local role service_role; $1 commit;
SQL
}
check(){ if [[ "$2" == *"$3"* ]]; then pass=$((pass+1)); else fail=$((fail+1)); echo "NG: $1 => [$2] expected [$3]"; fi; }
# setup
q "insert into auth.users(id,email) values ('$U1','m@x'),('$U2','f@x'),('$U3','p@x') on conflict do nothing" >/dev/null
q "update public.oshikatsu_profiles set plan='master' where user_id='$U1'; update public.oshikatsu_profiles set plan='paid' where user_id='$U3';" >/dev/null
q "insert into public.oshikatsu_records(user_id,kind,id,data) values ('$U1','oshi','o1','{}'),('$U2','oshi','p1','{}'),('$U2','oshi','p2','{}'),('$U3','oshi','q1','{}') on conflict do nothing" >/dev/null
q "insert into public.oshikatsu_records(user_id,kind,id,data,deleted) values ('$U2','oshi','pdel','{}',true) on conflict do nothing" >/dev/null
check "profiles made" "$(q "select count(*) from public.oshikatsu_profiles")" "3"
# 1 existing app unaffected
check "own records select" "$(as $U2 aal1 "select count(*) from public.oshikatsu_records;")" "3"
check "own records insert" "$(as $U2 aal1 "insert into public.oshikatsu_records(user_id,kind,id,data) values ('$U2','live','l1','{}'); select 'ok';")" "ok"
check "other records hidden" "$(as $U2 aal1 "select count(*) from public.oshikatsu_records where user_id='$U1';")" "0"
check "is_master still works" "$(as $U1 aal1 "select public.oshikatsu_is_master();")" "t"
# 2 sources insert denied for users
check "user cannot insert source" "$(as $U2 aal1 "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url) values ('$U2','p1','x','embed','https://x.com/a');")" "permission denied"
# 3 service inserts + guard
check "guard invalid oshi" "$(svc "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url) values ('$U2','nope','x','embed','https://x.com/a');")" "INVALID_OSHI"
check "guard deleted oshi" "$(svc "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url) values ('$U2','pdel','x','embed','https://x.com/a');")" "INVALID_OSHI"
check "guard other users oshi" "$(svc "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url) values ('$U2','o1','x','embed','https://x.com/a');")" "INVALID_OSHI"
for i in $(seq 1 15); do svc "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url) values ('$U2','p1','link','link','https://e.com/$i');" >/dev/null; done
check "free 15 ok" "$(q "select count(*) from public.oshikatsu_sources where user_id='$U2'")" "15"
check "free 16th blocked" "$(svc "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url) values ('$U2','p2','link','link','https://e.com/16');")" "SOURCE_LIMIT"
for i in $(seq 1 20); do svc "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url) values ('$U1','o1','link','link','https://m.com/$i');" >/dev/null; done
check "master unlimited" "$(q "select count(*) from public.oshikatsu_sources where user_id='$U1'")" "20"
# feeds
FID=$(q "insert into public.oshikatsu_feeds(platform,external_key,feed_url) values ('youtube','UC1','https://y/feed') returning id")
FID2=$(q "insert into public.oshikatsu_feeds(platform,external_key,feed_url) values ('blog','b1','https://b/feed') returning id")
svc "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url,feed_id) values ('$U3','q1','youtube','feed','https://youtube.com/channel/UC1','$FID');" >/dev/null
svc "insert into public.oshikatsu_sources(user_id,oshi_id,platform,mode,url,feed_id) values ('$U1','o1','blog','feed','https://b/','$FID2');" >/dev/null
q "insert into public.oshikatsu_feed_items(feed_id,external_id,title,url,published_at) values ('$FID','v1','動画1','https://y/v1',now()-interval '1 day'),('$FID','v2','動画2','https://y/v2',now()-interval '30 days'),('$FID2','e1','記事','https://b/1',now())" >/dev/null
check "subscriber sees feed" "$(as $U3 aal1 "select count(*) from public.oshikatsu_feeds;")" "1"
check "subscriber sees items" "$(as $U3 aal1 "select count(*) from public.oshikatsu_feed_items;")" "2"
check "non-subscriber no feed" "$(as $U2 aal1 "select count(*) from public.oshikatsu_feeds;")" "0"
check "non-subscriber no items" "$(as $U2 aal1 "select count(*) from public.oshikatsu_feed_items;")" "0"
check "timeline own" "$(as $U3 aal1 "select count(*) from public.oshikatsu_timeline;")" "2"
check "timeline not others" "$(as $U2 aal1 "select count(*) from public.oshikatsu_timeline;")" "0"
check "unread default 7d" "$(as $U3 aal1 "select oshi_id||':'||unread from public.oshikatsu_unread_counts();")" "q1:1"
check "seen upsert" "$(as $U3 aal1 "insert into public.oshikatsu_feed_seen(user_id,oshi_id) values ('$U3','q1'); select count(*) from public.oshikatsu_unread_counts();")" "0"
check "seen for other user denied" "$(as $U2 aal1 "insert into public.oshikatsu_feed_seen(user_id,oshi_id) values ('$U3','q1');")" "row-level security"
# 4 sources own
check "own sources only" "$(as $U2 aal1 "select count(*) from public.oshikatsu_sources;")" "15"
check "label update ok" "$(as $U2 aal1 "update public.oshikatsu_sources set label='a' where user_id='$U2'; select 'ok';")" "ok"
check "url update denied" "$(as $U2 aal1 "update public.oshikatsu_sources set url='https://evil' ;")" "permission denied"
check "delete other none" "$(as $U2 aal1 "delete from public.oshikatsu_sources where user_id='$U1'; select count(*) from public.oshikatsu_sources where user_id='$U1';")" "0"
check "delete own ok" "$(as $U2 aal1 "with d as (delete from public.oshikatsu_sources where user_id='$U2' returning 1) select count(*) from d;")" "15"
# 6 MFA
q "insert into auth.mfa_factors(user_id,status) values ('$U3','verified')" >/dev/null
check "mfa aal1 blocked" "$(as $U3 aal1 "select count(*) from public.oshikatsu_feed_items;")" "0"
check "mfa aal2 ok" "$(as $U3 aal2 "select count(*) from public.oshikatsu_feed_items;")" "2"
# 7 admin
check "master aal1 forbidden" "$(as $U1 aal1 "select public.oshikatsu_admin_stats();")" "FORBIDDEN"
check "master aal2 ok" "$(as $U1 aal2 "select (public.oshikatsu_admin_stats()->>'feeds_active');")" "2"
check "free admin forbidden" "$(as $U2 aal2 "select public.oshikatsu_admin_stats();")" "FORBIDDEN"
check "admin feeds list" "$(as $U1 aal2 "select count(*) from public.oshikatsu_admin_list_feeds();")" "2"
check "admin sees all feeds table" "$(as $U1 aal2 "select count(*) from public.oshikatsu_feeds;")" "2"
check "admin cannot read others sources" "$(as $U1 aal2 "select count(*) from public.oshikatsu_sources where user_id<>'$U1';")" "0"
check "admin logs" "$(as $U1 aal2 "select public.oshikatsu_admin_set_feed_status('$FID','paused'); select count(*) from public.oshikatsu_audit_logs;")" "1"
check "admin self suspend denied" "$(as $U1 aal2 "select public.oshikatsu_admin_set_suspended('$U1',true);")" "SELF_CHANGE"
# 8 suspended
q "update public.oshikatsu_profiles set suspended_at=now() where user_id='$U3'" >/dev/null
check "suspended blocked" "$(as $U3 aal2 "select count(*) from public.oshikatsu_feed_items;")" "0"
q "update public.oshikatsu_profiles set suspended_at=null where user_id='$U3'" >/dev/null
# 9 my_plan
check "my_plan free" "$(as $U2 aal1 "select plan||','||coalesce(max_oshi::text,'-')||','||coalesce(max_sources::text,'-')||','||oshi_count from public.oshikatsu_my_plan();")" "free,3,15,2"
check "my_plan paid" "$(as $U3 aal2 "select plan||','||max_oshi||','||max_sources from public.oshikatsu_my_plan();")" "paid,50,300"
check "my_plan master" "$(as $U1 aal1 "select plan||','||coalesce(max_oshi::text,'-') from public.oshikatsu_my_plan();")" "master,-"
# 11 service-only funcs
check "claim denied to user" "$(as $U1 aal2 "select count(*) from public.oshikatsu_claim_due_feeds();")" "permission denied"
check "plan_of denied to user" "$(as $U1 aal2 "select public.oshikatsu_plan_of('$U2');")" "permission denied"
check "claim by service" "$(svc "select count(*) from public.oshikatsu_claim_due_feeds(30);")" "2"
check "claim only_user" "$(svc "update public.oshikatsu_feeds set next_fetch_at=now(); select count(*) from public.oshikatsu_claim_due_feeds(30,'$U2');")" "0"
check "bump usage" "$(svc "select public.oshikatsu_bump_api_usage('youtube',3); select units from public.oshikatsu_api_usage;")" "3"
# 13 manual refresh / display name / admin users
check "claim_user denied to user" "$(as $U3 aal2 "select count(*) from public.oshikatsu_claim_user_feeds('$U3');")" "permission denied"
check "claim_user by service" "$(svc "select count(*) from public.oshikatsu_claim_user_feeds('$U3',10,30);")" "1"
check "claim_user not again within 10min" "$(svc "select count(*) from public.oshikatsu_claim_user_feeds('$U3',10,30);")" "0"
check "claim_user none for free" "$(svc "select count(*) from public.oshikatsu_claim_user_feeds('$U2',10,30);")" "0"
check "set display name" "$(as $U2 aal1 "select public.oshikatsu_set_display_name(' ふー '); select display_name from public.oshikatsu_profiles where user_id='$U2';")" "ふー"
check "display name too long" "$(as $U2 aal1 "select public.oshikatsu_set_display_name(repeat('a',41));")" "TOO_LONG"
check "admin users list" "$(as $U1 aal2 "select count(*) from public.oshikatsu_admin_list_users();")" "3"
check "admin users master first" "$(as $U1 aal2 "select plan from public.oshikatsu_admin_list_users() limit 1;")" "master"
check "admin users search" "$(as $U1 aal2 "select email from public.oshikatsu_admin_list_users('f@');")" "f@x"
check "admin users free forbidden" "$(as $U2 aal2 "select count(*) from public.oshikatsu_admin_list_users();")" "FORBIDDEN"
check "admin set plan" "$(as $U1 aal2 "select public.oshikatsu_admin_set_plan('$U2','paid'); select plan from public.oshikatsu_profiles where user_id='$U2';")" "paid"
check "admin set plan self" "$(as $U1 aal2 "select public.oshikatsu_admin_set_plan('$U1','free');")" "SELF_CHANGE"
check "admin set plan invalid" "$(as $U1 aal2 "select public.oshikatsu_admin_set_plan('$U2','gold');")" "INVALID_PLAN"
check "admin set plan by free" "$(as $U2 aal2 "select public.oshikatsu_admin_set_plan('$U3','free');")" "FORBIDDEN"
# 12 anon
check "anon no feeds" "$(psql -h $H -p 5499 -U postgres -d $DB -Atq -c "begin; set local role anon; select count(*) from public.oshikatsu_feeds;" 2>&1)" "permission denied"
check "anon no records" "$(psql -h $H -p 5499 -U postgres -d $DB -Atq -c "begin; set local role anon; select count(*) from public.oshikatsu_records;" 2>&1)" "permission denied"
# cascade
check "user delete cascade" "$(q "delete from auth.users where id='$U1'; select count(*) from public.oshikatsu_sources where user_id='$U1';")" "0"
echo "pass=$pass fail=$fail"
