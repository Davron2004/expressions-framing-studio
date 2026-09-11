import assert from "node:assert/strict";
import test from "node:test";
import { parseConfiguration } from "../src/lib/server/configuration";
import { quoteFor } from "../src/lib/server/pricing";
import { processPaidCheckout } from "../src/lib/server/orders";

const config = {
  size: "8x10",
  frame: "walnut",
  mat: "ivory",
  matWidth: 2,
  bottomWeighted: true,
  photo: "/samples/mountain.jpg",
  photoName: "Alpine stillness",
} as const;
test("authoritative quote includes only eligible options", () => {
  const quote = quoteFor(parseConfiguration(config));
  assert.equal(quote.total, 11900);
  assert.deepEqual(
    quote.breakdown.map((item) => item.amount),
    [7900, 1500, 2000, 500],
  );
  const noMat = quoteFor(
    parseConfiguration({ ...config, mat: "none", bottomWeighted: false }),
  );
  assert.equal(noMat.total, 9400);
  assert.equal(noMat.breakdown.length, 2);
});
test("configuration rejects forged options and invalid image bytes", () => {
  assert.throws(() => parseConfiguration({ ...config, size: "99x99" }));
  assert.throws(() =>
    parseConfiguration({ ...config, bottomWeighted: "true" }),
  );
  assert.throws(() =>
    parseConfiguration({
      ...config,
      photo: "data:image/jpeg;base64,iVBORw0KGgo=",
    }),
  );
});
test("payment processing locks event handling and validates order values", async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("INSERT INTO stripe_events"))
        return { rowCount: 1, rows: [] };
      if (sql.startsWith("SELECT * FROM orders"))
        return {
          rowCount: 1,
          rows: [
            {
              stripe_session_id: "cs_test",
              total_cents: 11900,
              currency: "cad",
              status: "pending",
            },
          ],
        };
      return { rowCount: 1, rows: [] };
    },
  };
  const outcome = await processPaidCheckout(client as never, {
    id: "evt_1",
    type: "checkout.session.completed",
    sessionId: "cs_test",
    amountTotal: 11900,
    currency: "cad",
    paymentStatus: "paid",
    orderId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(outcome, "processed");
  assert.ok(
    calls.some((sql) => sql.startsWith("UPDATE orders SET status = 'paid'")),
  );
  await assert.rejects(() =>
    processPaidCheckout(client as never, {
      id: "evt_2",
      type: "checkout.session.completed",
      sessionId: "cs_test",
      amountTotal: 1,
      currency: "cad",
      paymentStatus: "paid",
      orderId: "00000000-0000-4000-8000-000000000001",
    }),
  );
});
