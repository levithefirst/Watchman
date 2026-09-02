import { NextResponse } from "next/server";
import { db } from "@watchman/db";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const wallet = new URL(request.url).searchParams.get("wallet")?.toLowerCase() ?? "demo";
    const user = await db.user.findUnique({ where: { wallet }, include: { hedges: { orderBy: { createdAt: "desc" }, include: { receipt: true } } } });
    return NextResponse.json({ hedges: user?.hedges ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load hedges";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
