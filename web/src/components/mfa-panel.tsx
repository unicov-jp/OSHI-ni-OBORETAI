"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Field, inputClass, Notice } from "@/components/ui";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { factorId: string; qr: string; secret: string };

// 二段階認証(認証アプリの6桁コード)の登録と解除。
// Googleログインに加えて、このアプリ専用の確認コードを求めるようになる。
export function MfaPanel({ enabled, isAdmin }: { enabled: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (DEMO || !enabled) return;
    let active = true;
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        const verified = data?.totp.find((factor) => factor.status === "verified");
        if (active && verified) setFactorId(verified.id);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const start = async () => {
    if (DEMO) return setError("デモ表示では変更できません");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // 途中でやめた登録が残っていれば片付ける
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `認証アプリ ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (enrollError || !data) return setError("登録を始められませんでした。時間をおいてもう一度お試しください。");
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const verify = async () => {
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) return setError("コードが正しくありません。認証アプリに表示されている最新の6桁を入力してください。");
    setEnrollment(null);
    setCode("");
    router.refresh();
  };

  const turnOff = async () => {
    if (DEMO) return setError("デモ表示では変更できません");
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    if (unenrollError) {
      setBusy(false);
      return setError("解除できませんでした。時間をおいてもう一度お試しください。");
    }
    await supabase.auth.refreshSession();
    setBusy(false);
    setFactorId(null);
    setConfirmOff(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={enabled ? "ok" : "neutral"}>{enabled ? "有効" : "未設定"}</Badge>
        <p className="text-sm text-muted">
          {enabled
            ? "ログインのたびに、認証アプリの6桁コードを確認します。"
            : "有効にすると、Googleログインのあとに認証アプリの6桁コードを確認します。"}
        </p>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {!enabled && !enrollment ? (
        <Button variant="primary" onClick={start} disabled={busy}>
          二段階認証を設定する
        </Button>
      ) : null}

      {enrollment ? (
        <div className="grid gap-5 rounded-lg border border-line p-4 sm:grid-cols-[200px_minmax(0,1fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qr} alt="認証アプリで読み取るQRコード" width={200} height={200} className="rounded-lg bg-white p-2" />
          <div className="min-w-0 space-y-3">
            <p className="text-sm">
              認証アプリ(Google Authenticator など)でQRコードを読み取り、表示された6桁のコードを入力してください。
            </p>
            <p className="text-xs text-muted">
              読み取れないときはこのキーを手入力:
              <span className="mt-1 block rounded bg-sunken px-2 py-1 text-[13px] text-text [overflow-wrap:anywhere]">
                {enrollment.secret}
              </span>
            </p>
            <Field label="6桁のコード">
              <input
                className={`${inputClass} num max-w-[160px] tracking-[0.3em]`}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={verify} disabled={busy || code.length !== 6}>
                コードを確認して有効にする
              </Button>
              <Button variant="ghost" onClick={() => setEnrollment(null)}>
                やめる
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {enabled ? (
        confirmOff ? (
          <div className="space-y-3">
            {isAdmin ? (
              <Notice tone="warn">解除すると、設定し直すまで管理画面を開けなくなります。</Notice>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={turnOff} disabled={busy}>
                二段階認証を解除する
              </Button>
              <Button variant="ghost" onClick={() => setConfirmOff(false)}>
                やめる
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => setConfirmOff(true)}>二段階認証を解除</Button>
        )
      ) : null}
    </div>
  );
}
