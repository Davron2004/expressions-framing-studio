import { NextResponse } from "next/server";
import { readJson, errorResponse } from "@/lib/server/http";
import { parseConfiguration } from "@/lib/server/configuration";
import { quoteFor } from "@/lib/server/pricing";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    return NextResponse.json(
      quoteFor(parseConfiguration(await readJson(request))),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
