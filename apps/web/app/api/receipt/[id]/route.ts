import { NextResponse } from "next/server";
import { db } from "@watchman/db";
import { logApiError, safeMessage } from "../../_errors";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const receipt = await db.receipt.findUnique({ where: { id } });
    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    return NextResponse.json({ receipt });
  } catch (error) {
    logApiError("receipt_get_failed", error);
    const message = safeMessage(error, "Unable to load receipt");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
