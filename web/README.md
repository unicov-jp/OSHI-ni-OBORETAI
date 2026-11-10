# 推しに溺れたい

推しのSNSとBlogを、ひとりずつ1つのタブにまとめて追いかけるWebアプリ。

- 構成: Next.js 16 (App Router) / Supabase (認証・DB) / Vercel (配信・定期実行) / Stripe (課金)
- 認証: Googleログイン + 認証アプリによる二段階認証 (運営者は必須)
- 表示: PC / スマホ対応、ライト / ダーク切り替え

## できること・できないこと

| サービス | 方式 | 内容 |
|---|---|---|
| YouTube | 自動取得 | 新着動画の見出し・リンク・サムネイルURLを定期取得 |
| Blog (RSS/Atomがあるもの) | 自動取得 | 新着記事の見出し・リンクを定期取得 |
| X / Instagram / TikTok | 公式埋め込み | 各サービスが配信する埋め込みを表示。投稿は取得も保存もしない |
| Threads / その他 | リンク | プロフィールへのリンクとして保存 |

本文と画像は保存しない。各SNSの「アカウント連携(OAuth)」は行わない。追いかける対象は他人のアカウントであり、
各社の公式APIは本人の認可なしに他人の投稿を取得させないため。

## まず画面だけ見る (接続不要)

```bash
npm install
NEXT_PUBLIC_DEMO_MODE=1 npm run dev
```

http://localhost:3000 を開く。架空のデータで全画面(管理画面は /admin)を確認できる。変更操作は無効。

## セットアップ

### 1. Supabase

1. プロジェクトを作成し、SQL Editor で `supabase/migrations/0001_init.sql` を実行する。
2. Authentication > Providers で Google を有効にし、Google Cloud で作成した OAuth クライアントIDとシークレットを設定する。
   Google 側の「承認済みのリダイレクトURI」には Supabase が表示するコールバックURLを登録する。
3. Authentication > URL Configuration の Site URL に本番URL、Redirect URLs に `https://<本番ドメイン>/auth/callback` を登録する。
4. Authentication > Multi-Factor で TOTP を有効にする。
5. Project Settings > API から URL、Publishable key、Secret key を控える。

### 2. 環境変数

`.env.example` を `.env.local` にコピーして埋める。Vercel にも同じ値を登録する。
`SUPABASE_SECRET_KEY` `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` `CRON_SECRET` は秘密情報。`NEXT_PUBLIC_` を付けないこと。

### 3. 最初の運営者

一度Googleでログインしたあと、SQL Editor で実行する。

運営者は今のアプリのマスター（`oshikatsu_profiles.plan = 'master'`）。
マスターが設定画面で二段階認証を有効にすると /admin を開ける。

### 4. 定期取得

`vercel.json` で `/api/cron/fetch` を毎日 09:00 UTC（日本時間 18:00）に呼ぶ設定にしてある。
Vercel の無料プラン（Hobby）の定期実行は1日1回までのため、それ以外は新着画面の「更新」ボタン（`POST /api/feeds/refresh`）で取りに行く。
「更新」は本人が登録した取得元のうち前回の取得から10分以上たったものだけを取り、1人1時間に6回まで。
1日の取得が45秒に収まらないほど取得元が増えたら、外部のスケジューラから `Authorization: Bearer <CRON_SECRET>` を付けて同じURLを追加で呼べばよい。

### 5. Stripe (有料プランを使う場合)

1. 商品と継続課金の料金を作成し、料金IDを `STRIPE_PRICE_ID` に設定する。
2. Webhook の送信先に `https://<本番ドメイン>/api/stripe/webhook` を登録し、次のイベントを選ぶ。
   `checkout.session.completed` / `customer.subscription.created` / `customer.subscription.updated` /
   `customer.subscription.deleted` / `customer.subscription.paused` / `customer.subscription.resumed`
3. 署名シークレットを `STRIPE_WEBHOOK_SECRET` に設定する。
4. カスタマーポータルを有効にする (解約・支払い方法の変更に使う)。
5. `/legal/terms` `/legal/privacy` `/legal/tokushoho` の「◯」を埋める (雛形のままでは公開不可)。

上限は DB が正本: 無料 = 推し3人 / アカウント15件、Pro = 推し50人 / アカウント300件
(`0001_init.sql` の `plan_max_oshi` `plan_max_sources`)。変更する場合は画面の表記
(`src/app/app/settings/page.tsx`、`src/app/page.tsx`) も合わせる。

### 6. YouTube Data API (任意)

`YOUTUBE_API_KEY` を設定すると `@handle` 形式のURLを登録でき、新着取得も公式API経由になる
(1回1ユニット、既定の上限は1日10,000ユニット。管理画面で使用量を確認できる)。
未設定の場合は `/channel/UC...` 形式のみ登録でき、チャンネルの公開フィードから取得する。

## 確認用コマンド

```bash
npm run typecheck   # 型チェック
npm run selftest    # 取得処理の自己診断 (内部アドレスの遮断、フィード解析、URL判定)
npm run build
```

## 共通UIルール (一覧表示)

一覧(リスト・カード・表)の要素は、文字数で大きさが変わらない。新しい画面を足すときも次の部品を使う。

- 文字の省略: `Clamp` (`src/components/ui.tsx`) または `.clamp-1/2/3`。指定行数ぶんの高さを常に確保し、あふれた分は「…」。
  全文は `title` (PC) と詳細ダイアログ (スマホ含む) で確認できる。
- カード: `.card-grid`。同じ画面幅では全カードが同じ幅・同じ高さ。
- 表: `.data-table` + `<colgroup>` で列幅を固定。狭い画面では表ごと横スクロール。
- ボタン・バッジ・タグ: `Button` `Badge` `PlatformTag` の高さは固定。

## セキュリティ上の設計

- 利用者のデータは行レベルセキュリティで本人だけに見える。運営者にも、誰を推しているかは見えない (件数のみ)。
- 権限・契約状態・取得元は利用者から書き換えられない (列単位の権限とトリガーで強制)。
- 二段階認証を有効にした利用者は、コード確認済みのセッションでなければDBが何も返さない。
- 利用者が入力したURLをサーバーが取得する処理は、内部アドレス・非標準ポート・過大な応答を遮断する。
- Stripe の通知は署名を検証し、契約状態は必ず Stripe から取り直して反映する。

## 未実装・要確認

- 退会 (アカウント削除) の画面。現状は Supabase の管理画面からユーザーを削除する (関連データは連鎖削除される)。
- Supabase / Google / Stripe の実環境での通し確認。
- X・Instagram・TikTok の埋め込みが実際に表示されるかの確認 (各社の仕様で、未ログインのブラウザでは表示されない場合がある)。
- 利用規約・プライバシーポリシー・特定商取引法表記は雛形。
