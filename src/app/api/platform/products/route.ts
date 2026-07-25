import { NextRequest, NextResponse } from "next/server";

import { requireAuthUser } from "@/lib/auth/request-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await requireAuthUser(request);
  if (!user) {
    return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    where: { status: { code: "ACTIVE" } },
    include: {
      status: true,
      plans: {
        where: { status: { code: "ACTIVE" } },
        include: {
          status: true,
          versions: {
            where: { status: { code: "PUBLISHED" } },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      },
      features: { where: { status: { code: "ACTIVE" } } },
    },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({ products });
}
