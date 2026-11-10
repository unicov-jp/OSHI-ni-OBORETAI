# 推しに溺れたい（OSHI NI OBORETAI）

推しのSNSの投稿・ギャラリー・LIVEとチェキのカレンダーを、推しごとにまとめてスワイプで見るWebアプリです。
旧名は「推し活手帳」です。記録（推し・LIVE・チェキなど）は以前のアプリと同じデータベースの行をそのまま使っています。

- 本番：https://oshi-ni-oboretai.vercel.app
- 確認用：https://oshi-ni-oboretai-next.vercel.app

## 構成

| 場所 | 内容 |
|---|---|
| `web/` | アプリ本体（Next.js）。Vercel の Root Directory はここ |
| `supabase/migrations/` | データベース（Supabase）の表・関数・権限の SQL |
| `web/MIGRATION.md` | 作り直しの経緯と残作業 |

## 主な機能

- **投稿**：推しと所属グループの YouTube・X・Instagram・TikTok・Blog の投稿を1本の流れにまとめ、上下のスワイプで見る
- **カレンダー**（右へスワイプ）：LIVE・チェキの記録。LIVE は現地（マップ）・チケット・配信へすぐ移れる
- **ギャラリー**（左へスワイプ）：推しの写真とチェキ。写真は利用者の Google ドライブ（「推しに溺れたいapp」フォルダ）に保存
- **設定**：Google ログイン、二段階認証、Google ドライブの接続、プラン
- **管理画面**（運営者）：利用者・取得元・料金とプラン名・ログ

## 開発

```bash
cd web
npm install
npm run dev            # http://localhost:3000
npm run build          # 本番と同じビルド
NEXT_PUBLIC_DEMO_MODE=1 npm run dev   # データベースにつながずに、架空のデータで画面を確認する
```

必要な環境変数（Vercel の Production に設定。秘密の値は Production のみ）：

| 変数 | 内容 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase の接続先と公開鍵 |
| `SUPABASE_SECRET_KEY` | Supabase の秘密鍵（サーバーのみ） |
| `CRON_SECRET` | 定期取得の呼び出しの確認 |
| `NEXT_PUBLIC_SITE_URL` | サイトのURL |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google ドライブ接続用の OAuth クライアント |
| `STRIPE_SUBSCRIBE_URL` | 設定画面の「Stripe」ボタンの行き先（任意） |
