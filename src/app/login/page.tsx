export default function LoginPage() {
  return (
    <section className="card mx-auto max-w-lg">
      <h2 className="text-xl font-semibold">Login</h2>
      <p className="mt-2 text-sm text-slate-600">
        Placeholder สำหรับเชื่อม Supabase Auth ของ Central Project
        (ยังไม่เชื่อม Production ใน Phase นี้)
      </p>
      <form className="mt-6 grid gap-3">
        <label className="grid gap-1 text-sm">
          Email
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            type="email"
            placeholder="you@company.com"
            disabled
          />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input
            className="rounded-lg border border-[var(--border)] px-3 py-2"
            type="password"
            placeholder="••••••••"
            disabled
          />
        </label>
        <button className="btn mt-2 opacity-60" type="button" disabled>
          Sign in (wire Supabase Auth next)
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-500">
        Test auth ใช้ header <code>x-test-auth-user-id</code> เมื่อ
        ALLOW_TEST_AUTH=1
      </p>
    </section>
  );
}
