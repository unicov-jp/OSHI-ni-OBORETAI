-- 推しに溺れたい: Supabase の自動一時停止を防ぐための「生存確認」の関数
-- 無料プランは、しばらく使われないとプロジェクトが自動で一時停止する。
-- Vercel の定期実行（/api/keepalive、1日1回）がこの関数を呼び、データベースへのアクセスがあった状態を保つ。
-- 何のデータも読まず 1 を返すだけなので、未ログイン（anon）からも呼べるようにしてある。

create or replace function public.oshikatsu_keepalive()
returns integer
language sql
stable
set search_path = ''
as $$
  select 1;
$$;

revoke all on function public.oshikatsu_keepalive() from public;
grant execute on function public.oshikatsu_keepalive() to anon, authenticated, service_role;
