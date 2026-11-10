"use client";

import { useEffect, useState } from "react";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function GoogleLoginButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setBusy(true);
    setError(null);
    const { error: authError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      setBusy(false);
      setError("Googleのログイン画面を開けませんでした。時間をおいてもう一度お試しください。");
    }
  };

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button variant="primary" className="h-12 w-full text-[15px]" onClick={login} disabled={busy}>
        {busy ? "Googleへ移動しています" : "Googleでログイン"}
      </Button>
    </div>
  );
}

// ログイン後の二段階認証(6桁コードの確認)
export function MfaChallengeForm() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        if (!active) return;
        const verified = data?.totp.find((factor) => factor.status === "verified");
        if (verified) setFactorId(verified.id);
        else window.location.replace("/app");
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const verify = async () => {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setBusy(false);
      setCode("");
      return setError("コードが正しくありません。認証アプリに表示されている最新の6桁を入力してください。");
    }
    window.location.replace("/app");
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === 6 && !busy) void verify();
      }}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="認証アプリの6桁コード">
        <input
          className={`${inputClass} num h-12 text-center text-xl tracking-[0.4em]`}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={!ready}
        />
      </Field>
      <Button type="submit" variant="primary" className="h-12 w-full" disabled={busy || code.length !== 6}>
        {busy ? "確認しています" : "コードを確認する"}
      </Button>
    </form>
  );
}
