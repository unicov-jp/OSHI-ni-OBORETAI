import { NextResponse } from "next/server";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!DEMO) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
