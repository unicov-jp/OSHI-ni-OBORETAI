import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GoogleLoginButton } from "@/components/auth-forms";
import { AuthFrame } from "@/components/auth-frame";
import { Notice } from "@/components/ui";
import { DEMO } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ログイン" };

const ERRORS: Record<string, string> = {
  auth: "ログインを完了できませんでした。もう一度お試しください。",
  profile: "アカウント情報を読み込めませんでした。もう一度ログインしてください。",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (DEMO) redirect("/app");
  const { error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;

  return (
    <AuthFrame title="ログイン" lead="Googleアカウントでログインします。パスワードを当アプリが預かることはありません。">
      <div className="space-y-4">
        {message ? <Notice tone="danger">{message}</Notice> : null}
        <GoogleLoginButton />
        <p className="text-xs leading-5 text-muted">
          ログインすると
          <Link href="/legal/terms" className="underline">利用規約</Link>
          と
          <Link href="/legal/privacy" className="underline">プライバシーポリシー</Link>
          に同意したものとみなします。
        </p>
      </div>
    </AuthFrame>
  );
}
