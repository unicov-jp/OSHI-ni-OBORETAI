import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth-frame";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "利用停止中" };

export default function SuspendedPage() {
  return (
    <AuthFrame
      title="このアカウントは利用を停止されています"
      lead="利用規約に基づき、運営がこのアカウントの利用を停止しました。心当たりがない場合は、お問い合わせ窓口までご連絡ください。"
    >
      <form action="/auth/signout" method="post">
        <button type="submit" className={buttonClass("secondary", "md", "w-full")}>
          ログアウト
        </button>
      </form>
    </AuthFrame>
  );
}
