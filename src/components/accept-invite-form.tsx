"use client";

import { LogIn, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FormField, LoadingState } from "@/components/ui/admin-ui";
import {
  IconTextButton,
  IconTextLink,
} from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { validateInvitePassword } from "@/lib/auth/accept-invite";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { TH } from "@/lib/i18n/th";

type State = "checking" | "ready" | "invalid" | "setup-incomplete" | "success";

const savePasswordLabel = "บันทึกรหัสผ่าน";
const goLoginLabel = "เข้าสู่ระบบ";

export function AcceptInviteForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    async function establishSession() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          url.searchParams.delete("code");
          window.history.replaceState({}, "", `${url.pathname}${url.search}`);
        } else if (url.hash) {
          const hash = new URLSearchParams(url.hash.slice(1));
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
            window.history.replaceState({}, "", `${url.pathname}${url.search}`);
          }
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (active) setState(user ? "ready" : "invalid");
      } catch {
        if (active) setState("invalid");
      }
    }
    void establishSession();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function submit() {
    setError(null);
    const validationError = validateInvitePassword(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }
    setPending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      setError("ไม่สามารถตั้งรหัสผ่านได้ กรุณาขอคำเชิญใหม่");
      return;
    }
    const response = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const result = (await response.json()) as { message?: string };
    setPending(false);
    if (response.status === 409) {
      setState("setup-incomplete");
      return;
    }
    if (!response.ok) {
      setError(result.message ?? "ดำเนินการไม่สำเร็จ");
      return;
    }
    setState("success");
    router.refresh();
  }

  if (state === "checking") {
    return <LoadingState label="กำลังตรวจสอบคำเชิญ..." />;
  }
  if (state === "invalid") {
    return (
      <div className="space-y-4">
        <p className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          คำเชิญไม่ถูกต้องหรือหมดอายุ
        </p>
        <IconTextLink
          href="/login"
          icon={<LogIn aria-hidden="true" />}
          label={goLoginLabel}
        />
      </div>
    );
  }
  if (state === "setup-incomplete") {
    return (
      <p className="text-[length:var(--text-helper)] text-[var(--warning)]">
        บัญชีอยู่ระหว่างจัดเตรียม กรุณาติดต่อผู้ดูแลระบบ
      </p>
    );
  }
  if (state === "success") {
    return (
      <div className="space-y-4">
        <p className="text-[length:var(--text-helper)] text-[var(--success)]">
          ตั้งรหัสผ่านสำเร็จ
        </p>
        <IconTextLink
          href="/"
          icon={<LogIn aria-hidden="true" />}
          label={goLoginLabel}
        />
      </div>
    );
  }

  const saveLabel = pending ? TH.common.loading : savePasswordLabel;

  return (
    <div className="space-y-4">
      <FormField label="ตั้งรหัสผ่าน" htmlFor="password" required>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </FormField>
      <FormField label="ยืนยันรหัสผ่าน" htmlFor="confirmation" required>
        <Input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </FormField>
      {error ? (
        <p className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <IconTextButton
        type="button"
        disabled={pending}
        onClick={submit}
        icon={
          <Save
            className={pending ? "animate-pulse" : undefined}
            aria-hidden="true"
          />
        }
        label={saveLabel}
      />
    </div>
  );
}
