import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function readJson(
  request: Request,
  limit = 2_800_000,
): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > limit) throw new HttpError(413, "Request body is too large.");
  const text = await request.text();
  if (text.length > limit)
    throw new HttpError(413, "Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: "Invalid configuration." },
      { status: 400 },
    );
  console.error("API request failed", error);
  return NextResponse.json(
    { error: "The service is temporarily unavailable." },
    { status: 503 },
  );
}
