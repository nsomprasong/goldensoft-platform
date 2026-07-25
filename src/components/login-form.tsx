"use client";

import { useActionState } from "react";

import {
  signInWithPassword,
  type LoginActionState,
} from "@/lib/auth/actions";
import { TH } from "@/lib/i18n/th";

const initial: LoginActionState = { error: null };

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(signInWithPassword, initial);

  return (
    <form action={action} className="mt-6 grid gap-3">
      <input type="hidden" name="next" value={nextPath} />
      <label className="grid gap-1 text-sm">
        {TH.login.email}
        <input
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2"
          type="email"
          name="email"
          autoComplete="username"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        {TH.login.password}
        <input
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="btn mt-2" type="submit" disabled={pending}>
        {pending ? TH.login.submitting : TH.login.submit}
      </button>
      <p className="text-xs text-slate-500">
        {TH.login.forgot} — {TH.login.contactAdmin}
      </p>
    </form>
  );
}
