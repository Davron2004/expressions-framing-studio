import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, errorResponse, HttpError } from "@/lib/server/http";
import { configurationSchema } from "@/lib/server/configuration";
import { databaseConfigured, withTransaction } from "@/lib/server/db";
import {
  attachStripeSession,
  createOrGetPendingOrder,
} from "@/lib/server/orders";
import { checkoutUrls, getStripe, stripeConfigured } from "@/lib/server/stripe";
import { quoteFor } from "@/lib/server/pricing";

const inputSchema = z
  .object({ configuration: configurationSchema, idempotencyKey: z.uuid() })
  .strict();
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!databaseConfigured() || !stripeConfigured())
      throw new HttpError(
        503,
        "Test checkout isn’t connected yet. Your design is saved in this browser.",
      );
    const input = inputSchema.parse(await readJson(request));
    const pending = await withTransaction((client) =>
      createOrGetPendingOrder(
        client,
        input.configuration,
        input.idempotencyKey,
      ),
    );
    const order = pending.order;
    const quote = quoteFor(input.configuration);
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "cad",
              product_data: { name: "Expressions custom frame" },
              unit_amount: quote.total,
            },
            quantity: 1,
          },
        ],
        metadata: { orderId: order.id },
        success_url: checkoutUrls(order.id).successUrl,
        cancel_url: checkoutUrls(order.id).cancelUrl,
      },
      { idempotencyKey: `framing-order-${order.id}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await withTransaction((client) =>
      attachStripeSession(client, order.id, session.id),
    );
    return NextResponse.json({ url: session.url, orderId: order.id });
  } catch (error) {
    return errorResponse(error);
  }
}
