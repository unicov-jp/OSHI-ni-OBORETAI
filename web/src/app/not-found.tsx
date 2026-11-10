import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">ページが見つかりません</h1>
      <p className="text-sm leading-6 text-muted">URLが変わったか、削除された可能性があります。</p>
      <Link href="/" className={buttonClass("primary")}>
        トップへ戻る
      </Link>
    </div>
  );
}
