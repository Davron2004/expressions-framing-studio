import { NextResponse } from "next/server";
import { databaseConfigured, withTransaction } from "@/lib/server/db";
import { processPaidCheckout } from "@/lib/server/orders";
import { getStripe } from "@/lib/server/stripe";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!databaseConfigured() || !secret || !/^whsec_/.test(secret) || !signature)
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  try {
    const event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      secret,
    );
    if (event.livemode)
      return NextResponse.json(
        { error: "Live webhook events are not accepted." },
        { status: 400 },
      );
    const session = event.data.object;
    if (session.object !== "checkout.session")
      return NextResponse.json({ received: true });
    await withTransaction((client) =>
      processPaidCheckout(client, {
        id: event.id,
        type: event.type,
        sessionId: session.id,
        amountTotal: session.amount_total,
        currency: session.currency,
        paymentStatus: session.payment_status,
        orderId: session.metadata?.orderId,
      }),
    );
    return NextResponse.json({ received: true });
  } catch (error) {
    // Invalid signatures are expected on endpoint probes; never log request data.
    console.error("Stripe webhook rejected");
    return NextResponse.json(
      { error: "Webhook signature or payload is invalid." },
      { status: 400 },
    );
  }
}
