import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Configuration } from "@/lib/catalog";
import type { ValidConfiguration } from "./configuration";
import { quoteFor } from "./pricing";

export type PublicOrder = {
  id: string;
  status: "pending" | "paid" | "expired";
  configuration: Configuration;
  total: number;
  currency: "cad";
  createdAt: string;
  paidAt: string | null;
};
function sameConfiguration(left: Configuration, right: Configuration) {
  // JSONB does not preserve object-key insertion order, so whole-object JSON
  // serialization would reject an otherwise identical retry.
  return (
    left.size === right.size &&
    left.frame === right.frame &&
    left.mat === right.mat &&
    left.matWidth === right.matWidth &&
    left.bottomWeighted === right.bottomWeighted &&
    left.photo === right.photo &&
    left.photoName === right.photoName
  );
}
function publicOrder(
  row: Record<string, unknown>,
  includeUploadedPhoto = true,
): PublicOrder {
  const configuration = row.configuration as Configuration;
  const listedConfiguration =
    !includeUploadedPhoto && configuration.photo.startsWith("data:image/")
      ? { ...configuration, photo: "", photoName: "Uploaded photograph" }
      : configuration;
  return {
    id: String(row.id),
    status: row.status as PublicOrder["status"],
    configuration: listedConfiguration,
    total: Number(row.total_cents),
    currency: "cad",
    createdAt: new Date(String(row.created_at)).toISOString(),
    paidAt: row.paid_at ? new Date(String(row.paid_at)).toISOString() : null,
  };
}

export async function createOrGetPendingOrder(
  client: PoolClient,
  configuration: ValidConfiguration,
  idempotencyKey: string,
) {
  const quote = quoteFor(configuration);
  const existing = await client.query(
    "SELECT * FROM orders WHERE idempotency_key = $1 FOR UPDATE",
    [idempotencyKey],
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (!sameConfiguration(row.configuration as Configuration, configuration))
      throw new Error(
        "This idempotency key was already used with a different configuration.",
      );
    return {
      order: publicOrder(row),
      existing: true,
      stripeSessionId: row.stripe_session_id as string | null,
    };
  }
  // The unique constraint is the concurrency authority. A second transaction can
  // observe no row before the first commits, so SELECT-then-INSERT alone races.
  const id = randomUUID();
  const inserted = await client.query(
    "INSERT INTO orders (id, idempotency_key, configuration, total_cents, currency, status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *",
    [
      id,
      idempotencyKey,
      JSON.stringify(configuration),
      quote.total,
      "cad",
      "pending",
    ],
  );
  if (!inserted.rowCount) {
    const winner = await client.query(
      "SELECT * FROM orders WHERE idempotency_key = $1 FOR UPDATE",
      [idempotencyKey],
    );
    if (!winner.rowCount)
      throw new Error("Unable to retrieve the idempotent order.");
    const row = winner.rows[0];
    if (!sameConfiguration(row.configuration as Configuration, configuration))
      throw new Error(
        "This idempotency key was already used with a different configuration.",
      );
    return {
      order: publicOrder(row),
      existing: true,
      stripeSessionId: row.stripe_session_id as string | null,
    };
  }
  return {
    order: publicOrder(inserted.rows[0]),
    existing: false,
    stripeSessionId: null,
  };
}

export async function attachStripeSession(
  client: PoolClient,
  orderId: string,
  sessionId: string,
) {
  await client.query(
    "UPDATE orders SET stripe_session_id = $2 WHERE id = $1 AND stripe_session_id IS NULL",
    [orderId, sessionId],
  );
}

export async function listPublicOrders(pool: Pool): Promise<PublicOrder[]> {
  // Keep the demo list small and never serialize base64 artwork into it. The
  // matching individual order endpoint still returns the submitted artwork.
  const result = await pool.query(
    "SELECT * FROM orders ORDER BY created_at DESC LIMIT 20",
  );
  return result.rows.map((row) => publicOrder(row, false));
}
export async function getPublicOrder(
  pool: Pool,
  id: string,
): Promise<PublicOrder | null> {
  const result = await pool.query("SELECT * FROM orders WHERE id = $1", [id]);
  return result.rowCount ? publicOrder(result.rows[0]) : null;
}

export type PaymentEvent = {
  id: string;
  type: string;
  sessionId: string;
  amountTotal: number | null;
  currency: string | null;
  paymentStatus: string;
  orderId: string | undefined;
};
export async function processPaidCheckout(
  client: PoolClient,
  event: PaymentEvent,
): Promise<"processed" | "ignored"> {
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type) ||
    event.paymentStatus !== "paid" ||
    !event.orderId
  )
    return "ignored";
  const claimed = await client.query(
    "INSERT INTO stripe_events (id, type) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id",
    [event.id, event.type],
  );
  if (!claimed.rowCount) return "ignored";
  const result = await client.query(
    "SELECT * FROM orders WHERE id = $1 FOR UPDATE",
    [event.orderId],
  );
  if (!result.rowCount)
    throw new Error("Checkout references an unknown order.");
  const order = result.rows[0];
  if (
    order.stripe_session_id !== event.sessionId ||
    order.total_cents !== event.amountTotal ||
    order.currency !== event.currency?.toLowerCase()
  )
    throw new Error("Checkout payment did not match its order.");
  if (order.status === "paid") return "ignored";
  await client.query(
    "UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = $1",
    [event.orderId],
  );
  return "processed";
}
