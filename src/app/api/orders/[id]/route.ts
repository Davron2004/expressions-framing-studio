import { NextResponse } from "next/server";
import { databaseConfigured, getPool } from "@/lib/server/db";
import { getPublicOrder } from "@/lib/server/orders";
import { errorResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!databaseConfigured())
    return NextResponse.json(
      { error: "Orders are unavailable." },
      { status: 503 },
    );
  try {
    const order = await getPublicOrder(getPool(), (await params).id);
    return order
      ? NextResponse.json({ order })
      : NextResponse.json({ error: "Order not found." }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
