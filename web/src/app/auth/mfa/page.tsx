import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaChallengeForm } from "@/components/auth-forms";
import { AuthFrame } from "@/components/auth-frame";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "二段階認証" };

export default async function MfaPage() {
  if (DEMO) redirect("/app");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AuthFrame title="二段階認証" lead="認証アプリに表示されている6桁のコードを入力してください。">
      <MfaChallengeForm />
      <form action="/auth/signout" method="post" className="mt-4 text-center">
        <button type="submit" className="text-[13px] text-muted underline hover:text-text">
          別のアカウントでログインする
        </button>
      </form>
    </AuthFrame>
  );
}
