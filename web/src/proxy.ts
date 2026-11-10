import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

// セッションの更新と、未ログイン・二段階認証未完了の振り分けを行う。
// ここは入口の案内であり、最終的な防御はDBの行レベルセキュリティが担う。
export async function proxy(request: NextRequest) {
  if (DEMO) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/app") || path.startsWith("/admin");

  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!user) {
    return isProtected ? redirectTo("/login") : response;
  }

  if (isProtected) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      return redirectTo("/auth/mfa");
    }
  }

  if (path === "/" || path === "/login") {
    return redirectTo("/app");
  }

  return response;
}

export const config = {
  // /api もログインの延長(セッションの更新)だけ行う。振り分けは /app・/admin だけ
  matcher: ["/", "/login", "/app/:path*", "/admin/:path*", "/auth/mfa", "/api/:path*"],
};
