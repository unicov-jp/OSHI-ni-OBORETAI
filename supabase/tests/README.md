# DB のテスト（ローカルの PostgreSQL 16）

Supabase のロール（anon / authenticated / service_role）と `auth` スキーマ（`auth.users`、`auth.uid()`、`auth.jwt()`、`auth.mfa_factors`）、
`storage` スキーマの一部を `supabase_mock.sql` で模擬し、`supabase/migrations/` を順に実行してから権限のテストを流す。

```bash
PG=/usr/lib/postgresql/16/bin; T=/var/lib/postgresql/pgtest-oboretai
mkdir -p $T && chown postgres:postgres $T && chmod 700 $T
su postgres -c "$PG/initdb -D $T/data -A trust -U postgres"
su postgres -c "$PG/pg_ctl -D $T/data -o '-p 5499 -k $T' -l $T/log start"
P="psql -h $T -p 5499 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "drop database if exists t" -c "create database t"
$P -d t -f supabase/tests/supabase_mock.sql
for f in supabase/migrations/*.sql; do $P -d t -f "$f"; done
bash supabase/tests/oboretai_feeds_test.sh   # pass=48 fail=0 なら成功
```

`oboretai_feeds_test.sh` が確かめること：今のアプリの記録（oshikatsu_records）の読み書きが変わらないこと、
SNSの登録は利用者から直接書けないこと、推しが本人のものかの確認、登録数の上限（無料15・マスターは上限なし）、
登録した人だけが取得元と新着を読めること、未読の数、二段階認証（aal2）、停止中の利用者、運営者（マスター・aal2）専用の関数、
取得ジョブ用の関数は service_role だけ、未ログインは何も読めないこと、アカウント削除時の連鎖削除。
