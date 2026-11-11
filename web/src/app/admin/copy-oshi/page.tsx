import type { Metadata } from "next";
import { CopyOshiForm } from "@/components/copy-oshi-form";

export const metadata: Metadata = { title: "推しの複製" };

// 運営者向け: ある利用者の推しを、別の利用者へ複製する(コピー元は変えない)
export default function AdminCopyOshiPage() {
  return (
    <div className="max-w-[640px] space-y-4">
      <h1 className="text-xl leading-7 font-bold">推しの複製</h1>
      <p className="text-sm text-muted">
        コピー元の利用者の推し(プロフィール・個人とグループのSNS・アイコン・新着の取得先)を、コピー先の利用者へ複製します。
        コピー元は変わりません。コピー先に同じ名前の推しがいる場合、その推しは複製しません。
      </p>
      <CopyOshiForm />
    </div>
  );
}
