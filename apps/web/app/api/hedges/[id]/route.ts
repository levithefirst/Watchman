import { NextResponse } from "next/server";
import { db } from "@watchman/db";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const hedge = await db.hedge.findUnique({ where: { id }, include: { exposure: true, receipt: true } });
    if (!hedge) return NextResponse.json({ error: "Hedge not found" }, { status: 404 });
    return NextResponse.json({ hedge });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load hedge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
