import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card md:col-span-2">
        <h2 className="text-xl font-semibold">Platform MVP Dashboard</h2>
        <p className="mt-2 text-sm text-slate-600">
          Central Auth, multi-tenant organizations, branches, products, plans,
          subscriptions และ application context สำหรับ Resident V2, HR และ QR
          Station
        </p>
      </section>
      {[
        { href: "/organizations", title: "Organizations", body: "ลูกค้าและสาขา" },
        { href: "/products", title: "Products", body: "RESIDENT / HR / QRSTATION" },
        { href: "/plans", title: "Plans", body: "แพ็กเกจและ version" },
        { href: "/subscriptions", title: "Subscriptions", body: "Entitlement snapshot" },
      ].map((item) => (
        <Link key={item.href} href={item.href} className="card transition hover:shadow-md">
          <h3 className="font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{item.body}</p>
        </Link>
      ))}
    </div>
  );
}
