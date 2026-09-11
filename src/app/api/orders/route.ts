import { NextResponse } from "next/server";
import { databaseConfigured, getPool } from "@/lib/server/db";
import { listPublicOrders } from "@/lib/server/orders";
import { errorResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET() {
  if (!databaseConfigured())
    return NextResponse.json({ orders: [], configured: false });
  try {
    return NextResponse.json({
      orders: await listPublicOrders(getPool()),
      configured: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
