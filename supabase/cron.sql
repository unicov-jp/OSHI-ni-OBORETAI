-- 推しに溺れたい: 定期取得のスケジュール(Supabase の定期実行 pg_cron から 15分ごとに /api/cron/fetch を呼ぶ)
-- SQL Editor で上から順に実行する。合言葉(CRON_SECRET)はここで作って Supabase の Vault に保管し、
-- 同じ値を Vercel の環境変数 CRON_SECRET(Production のみ)に入れる。値はチャットなどに貼らないこと。

-- 1) 必要な機能を有効にする
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) 合言葉を作って Vault に保管する(すでにあれば作らない)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'oshi_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'oshi_cron_secret', '定期取得の合言葉(Vercel の CRON_SECRET と同じ値)');
  end if;
end $$;

-- 3) 合言葉を表示する(この値を Vercel の CRON_SECRET に入れる)
-- select decrypted_secret from vault.decrypted_secrets where name = 'oshi_cron_secret';

-- 4) 15分ごとに取得処理を呼ぶ(同じ名前で登録し直すと上書きされる)
select cron.schedule(
  'oshi-fetch',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := 'https://oshi-ni-oboretai.vercel.app/api/cron/fetch',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'oshi_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- 確認用: 登録されたスケジュールと、直近の実行結果
-- select jobname, schedule, active from cron.job;
-- select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
-- select status_code, created from net._http_response order by created desc limit 10;
