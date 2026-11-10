#!/usr/bin/env bash
# Vercel の「ビルドするか」の判定(exit 1 = ビルドする / exit 0 = やめる)。
# 本番(main)はどちらのプロジェクトでもビルドする。
# 作業用ブランチ(claude/*)は、検証用プロジェクト(oshi-ni-oboretai-next)だけでビルドし、本番プロジェクトではやめる。
# (push のたびに2プロジェクト分のデプロイが作られ、無料枠の1日100件を使い切らないようにするため)
if [ "$VERCEL_ENV" = "production" ]; then
  exit 1
fi
case "$VERCEL_PROJECT_PRODUCTION_URL" in
  oshi-ni-oboretai-next.vercel.app*) exit 1 ;;
esac
echo "検証用プロジェクト以外では、作業用ブランチをビルドしません"
exit 0
