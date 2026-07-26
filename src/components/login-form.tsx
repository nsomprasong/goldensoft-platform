"use client";

import { LogIn } from "lucide-react";
import { useActionState } from "react";

import {
  signInWithPassword,
  type LoginActionState,
} from "@/lib/auth/actions";
import { FormField } from "@/components/ui/admin-ui";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { TH } from "@/lib/i18n/th";

const initial: LoginActionState = { error: null };

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, initial);
  const label = pending ? TH.login.submitting : TH.login.submit;

  return (
    <form action={action} className="mt-6 grid gap-4">
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
      <FormField label={TH.login.password} htmlFor="password" required>
        <Input
          id="password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </FormField>
      {state.error ? (
        <p className="text-[length:var(--text-helper)] text-[var(--danger)]" role="alert">
          {state.error}
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
        label={label}
      />
      <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {TH.login.forgot} — {TH.login.contactAdmin}
      </p>
    </form>
  );
}
