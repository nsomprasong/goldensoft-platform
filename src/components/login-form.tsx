"use client";

import { LogIn } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import {
  signInWithPassword,
  signInWithPhonePassword,
  type LoginActionState,
} from "@/lib/auth/actions";
import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { TH } from "@/lib/i18n/th";
import { cn } from "@/lib/utils";

const initial: LoginActionState = { error: null };

export function LoginForm({
  nextPath = "/",
  phoneLoginEnabled = false,
}: {
  nextPath?: string;
  phoneLoginEnabled?: boolean;
}) {
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [emailState, emailAction, emailPending] = useActionState(
    signInWithPassword,
    initial,
  );
  const [phoneState, phoneAction, phonePending] = useActionState(
    signInWithPhonePassword,
    initial,
  );

  const pending = emailPending || phonePending;
  const activeError = mode === "email" ? emailState.error : phoneState.error;
  const redirectTo =
    mode === "email" ? emailState.redirectTo : phoneState.redirectTo;

  // Hard navigate to Customer App — Server Action redirect() is same-origin only.
  useEffect(() => {
    if (!redirectTo) return;
    window.location.assign(redirectTo);
  }, [redirectTo]);

  return (
    <div className="mt-6">
      {phoneLoginEnabled ? (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-1">
          <button
            type="button"
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-2 text-sm font-semibold transition",
              mode === "email"
                ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                : "text-[var(--text-muted)]",
            )}
            onClick={() => setMode("email")}
          >
            {TH.login.emailTab}
          </button>
          <button
            type="button"
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-2 text-sm font-semibold transition",
              mode === "phone"
                ? "bg-[var(--card)] text-[var(--primary)] shadow-sm"
                : "text-[var(--text-muted)]",
            )}
            onClick={() => setMode("phone")}
          >
            {TH.login.phoneTab}
          </button>
        </div>
      ) : null}

      {mode === "email" || !phoneLoginEnabled ? (
        <form action={emailAction} className="grid gap-4">
          <input type="hidden" name="next" value={nextPath} />
          <FormField label={TH.login.email} htmlFor="email" required>
            <Input
              id="email"
              type="email"
              name="email"
              autoComplete="username"
              required
            />
          </FormField>
          <FormField
            label={TH.login.password}
            htmlFor="password"
            hint={TH.login.passwordHint}
          >
            <Input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
            />
          </FormField>
          {activeError ? (
            <p
              className="text-[length:var(--text-helper)] text-[var(--danger)]"
              role="alert"
            >
              {activeError}
            </p>
          ) : null}
          <IconTextButton
            type="submit"
            disabled={pending}
            className="w-full"
            icon={
              <LogIn
                className={pending ? "animate-pulse" : undefined}
                aria-hidden="true"
              />
            }
            label={pending ? TH.login.submitting : TH.login.submit}
          />
        </form>
      ) : (
        <form action={phoneAction} className="grid gap-4">
          <input type="hidden" name="next" value={nextPath} />
          <FormField
            label={TH.login.phone}
            htmlFor="phone"
            required
            hint={TH.login.phoneHint}
          >
            <Input
              id="phone"
              type="tel"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="08x-xxx-xxxx"
            />
          </FormField>
          <FormField
            label={TH.login.password}
            htmlFor="phone-password"
            hint={TH.login.passwordHint}
          >
            <Input
              id="phone-password"
              type="password"
              name="password"
              autoComplete="current-password"
            />
          </FormField>
          {activeError ? (
            <p
              className="text-[length:var(--text-helper)] text-[var(--danger)]"
              role="alert"
            >
              {activeError}
            </p>
          ) : null}
          <IconTextButton
            type="submit"
            disabled={pending}
            className="w-full"
            icon={
              <LogIn
                className={pending ? "animate-pulse" : undefined}
                aria-hidden="true"
              />
            }
            label={pending ? TH.login.submitting : TH.login.submit}
          />
        </form>
      )}

      <p className="mt-4 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {TH.login.forgot} — {TH.login.contactAdmin}
      </p>
    </div>
  );
}
