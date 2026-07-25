"use client";

import { useActionState } from "react";

import {
  signInWithPassword,
  type LoginActionState,
} from "@/lib/auth/actions";
import { FormField } from "@/components/ui/admin-ui";
import { TH } from "@/lib/i18n/th";

const initial: LoginActionState = { error: null };

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, initial);

  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="next" value={nextPath} />
      <FormField label={TH.login.email} htmlFor="email" required>
        <input
          id="email"
          className="input"
          type="email"
          name="email"
          autoComplete="username"
          required
        />
      </FormField>
      <FormField label={TH.login.password} htmlFor="password" required>
        <input
          id="password"
          className="input"
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
      <button className="btn btn-block-mobile" type="submit" disabled={pending}>
        {pending ? TH.login.submitting : TH.login.submit}
      </button>
      <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {TH.login.forgot} — {TH.login.contactAdmin}
      </p>
    </form>
  );
}
