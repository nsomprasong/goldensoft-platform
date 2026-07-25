"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { validateInvitePassword } from "@/lib/auth/accept-invite";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type State = "checking" | "ready" | "invalid" | "setup-incomplete" | "success";

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
    return <p>กำลังตรวจสอบคำเชิญ...</p>;
  }
  if (state === "invalid") {
    return (
      <div className="space-y-4">
        <p className="text-red-700">คำเชิญไม่ถูกต้องหรือหมดอายุ</p>
        <Link href="/login" className="btn inline-block">
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }
  if (state === "setup-incomplete") {
    return (
      <p className="text-amber-700">
        บัญชีอยู่ระหว่างจัดเตรียม กรุณาติดต่อผู้ดูแลระบบ
      </p>
    );
  }
  if (state === "success") {
    return (
      <div className="space-y-4">
        <p className="text-green-700">ตั้งรหัสผ่านสำเร็จ</p>
        <Link href="/" className="btn inline-block">
          เข้าสู่ระบบ
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="password">
        ตั้งรหัสผ่าน
      </label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-full rounded-lg border border-(--border) px-3 py-2"
      />
      <label className="block text-sm font-medium" htmlFor="confirmation">
        ยืนยันรหัสผ่าน
      </label>
      <input
        id="confirmation"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        className="w-full rounded-lg border border-(--border) px-3 py-2"
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button type="button" className="btn" disabled={pending} onClick={submit}>
        {pending ? "กำลังบันทึก..." : "บันทึกรหัสผ่าน"}
      </button>
    </div>
  );
}
