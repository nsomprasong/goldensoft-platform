import { AcceptInviteForm } from "@/components/accept-invite-form";

export default function AcceptInvitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <section className="card">
        <p className="text-sm font-semibold text-[var(--accent)]">GoldenSoft</p>
        <h1 className="mb-5 mt-1 text-2xl font-bold">
          ยอมรับคำเชิญเข้าใช้งาน GoldenSoft
        </h1>
        <AcceptInviteForm />
      </section>
    </main>
  );
}
