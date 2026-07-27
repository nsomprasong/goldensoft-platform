"use client";

import { LogIn, Save } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";

import { FormField, LoadingState } from "@/components/ui/admin-ui";
import {
  IconTextButton,
  IconTextLink,
} from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import {
  setPasswordAction,
  type SetPasswordActionState,
} from "@/lib/auth/set-password-action";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { TH } from "@/lib/i18n/th";

type GateState = "checking" | "ready" | "invalid";

const initial: SetPasswordActionState = { error: null };

/**
 * Password setup for:
 * - email invite/recovery links (?code= / #access_token=)
 * - admin-opened reset cookie (initialReset provided by server)
 */
export function SetPasswordGate(props: {
  initialReset: null | { email: string; expiresAtIso: string };
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [gate, setGate] = useState<GateState>(
    props.initialReset ? "ready" : "checking",
  );
  const [sessionEmail, setSessionEmail] = useState<string | null>(
    props.initialReset?.email ?? null,
  );
  const [actionState, formAction, pending] = useActionState(
    setPasswordAction,
    initial,
  );

  useEffect(() => {
    if (props.initialReset) return;
    let active = true;

    async function bootstrap() {
      try {
        const url = new URL(window.location.href);
        const oauthError =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");
        if (oauthError) {
          if (active) setGate("invalid");
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          url.searchParams.delete("code");
          window.history.replaceState({}, "", `${url.pathname}${url.search}`);
        } else if (url.hash) {
          const hash = new URLSearchParams(url.hash.slice(1));
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
            window.history.replaceState({}, "", `${url.pathname}${url.search}`);
          }
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active) return;
        if (user) {
          setSessionEmail(user.email ?? null);
          setGate("ready");
          return;
        }
        setGate("invalid");
      } catch {
        if (active) setGate("invalid");
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [props.initialReset, supabase]);

  if (gate === "checking") {
    return <LoadingState label="กำลังตรวจสอบลิงก์ตั้งรหัสผ่าน..." />;
  }

  if (gate === "invalid") {
    return (
      <div className="mt-2 space-y-4">
        <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {TH.setPassword.invalidBody}
        </p>
        <IconTextLink
          href="/login"
          icon={<LogIn aria-hidden="true" />}
          label={TH.setPassword.backToLogin}
        />
      </div>
    );
  }

  const email = sessionEmail ?? props.initialReset?.email ?? null;
  const expiresLabel = props.initialReset
    ? new Date(props.initialReset.expiresAtIso).toLocaleString("th-TH")
    : null;

  return (
    <>
      <p className="mt-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
        {TH.setPassword.body}
      </p>
      <dl className="mt-4 grid gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {email ? (
          <div className="flex flex-wrap gap-2">
            <dt>{TH.login.email}:</dt>
            <dd className="font-medium text-[var(--foreground)]">{email}</dd>
          </div>
        ) : null}
        {expiresLabel ? (
          <div className="flex flex-wrap gap-2">
            <dt>{TH.setPassword.expiresAt}:</dt>
            <dd className="tabular-nums">{expiresLabel}</dd>
          </div>
        ) : null}
      </dl>
      <form action={formAction} className="mt-6 space-y-4">
        <FormField label={TH.setPassword.password} htmlFor="password" required>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </FormField>
        <FormField
          label={TH.setPassword.confirmation}
          htmlFor="confirmation"
          required
        >
          <Input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
          />
        </FormField>
        {actionState.error ? (
          <p
            className="text-[length:var(--text-helper)] text-[var(--danger)]"
            role="alert"
          >
            {actionState.error}
          </p>
        ) : null}
        <IconTextButton
          type="submit"
          disabled={pending}
          className="w-full"
          icon={
            <Save
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : TH.setPassword.submit}
        />
      </form>
    </>
  );
}
