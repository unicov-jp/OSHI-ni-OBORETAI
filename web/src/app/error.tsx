"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">表示できませんでした</h1>
      <p className="text-sm leading-6 text-muted">
        データの読み込み中に問題が起きました。通信環境を確認して、もう一度お試しください。
      </p>
      <Button variant="primary" onClick={reset}>
        もう一度読み込む
      </Button>
    </div>
  );
}
