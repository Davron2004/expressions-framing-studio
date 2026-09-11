import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  createOrGetPendingOrder,
  processPaidCheckout,
} from "../src/lib/server/orders";
import { parseConfiguration } from "../src/lib/server/configuration";
import { POST as webhookPost } from "../src/app/api/stripe/webhook/route";

const url = process.env.POSTGRES_TEST_URL;
const integration = url ? test : test.skip;
const configuration = parseConfiguration({
  size: "8x10",
  frame: "walnut",
  mat: "ivory",
  matWidth: 2,
  bottomWeighted: true,
  photo: "/samples/mountain.jpg",
  photoName: "Alpine stillness",
});

integration(
  "PostgreSQL preserves idempotency and rolls back bad events without global cleanup",
  async () => {
    if (!new URL(url!).pathname.endsWith("_test"))
      throw new Error(
        "POSTGRES_TEST_URL must target a database ending in _test.",
      );
    const pool = new Pool({ connectionString: url });
    let orderId: string | undefined;
    const eventPrefix = `evt_test_${randomUUID().replaceAll("-", "")}`;
    try {
      await pool.query(
        await readFile(
          new URL("../db/001_initial.sql", import.meta.url),
          "utf8",
        ),
      );
      const key = randomUUID();
      const create = async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await createOrGetPendingOrder(
            client,
            configuration,
            key,
          );
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      };
      const [first, second] = await Promise.all([create(), create()]);
      assert.equal(first.order.id, second.order.id);
      assert.equal(
        (await pool.query("SELECT count(*)::int AS count FROM orders")).rows[0]
          .count,
        1,
      );
      orderId = first.order.id;
      await pool.query(
        "UPDATE orders SET stripe_session_id = $2 WHERE id = $1",
        [orderId, "cs_test_expected"],
      );
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await assert.rejects(() =>
          processPaidCheckout(client, {
            id: `${eventPrefix}_mismatch`,
            type: "checkout.session.completed",
            sessionId: "cs_test_wrong",
            amountTotal: 11900,
            currency: "cad",
            paymentStatus: "paid",
            orderId,
          }),
        );
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM stripe_events WHERE id = $1",
            [`${eventPrefix}_mismatch`],
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (await pool.query("SELECT status FROM orders WHERE id = $1", [orderId]))
          .rows[0].status,
        "pending",
      );
      const paidEvent = {
        id: `${eventPrefix}_paid`,
        type: "checkout.session.completed",
        sessionId: "cs_test_expected",
        amountTotal: 11900,
        currency: "cad",
        paymentStatus: "paid",
        orderId,
      };
      const deliver = async () => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const outcome = await processPaidCheckout(client, paidEvent);
          await client.query("COMMIT");
          return outcome;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      };
      assert.deepEqual((await Promise.all([deliver(), deliver()])).sort(), [
        "ignored",
        "processed",
      ]);
      assert.equal(
        (await pool.query("SELECT status FROM orders WHERE id = $1", [orderId]))
          .rows[0].status,
        "paid",
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM stripe_events WHERE id = $1",
            [paidEvent.id],
          )
        ).rows[0].count,
        1,
      );
      const oldEnv = {
        DATABASE_URL: process.env.DATABASE_URL,
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      };
      process.env.DATABASE_URL = url;
      process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
      const invalid = await webhookPost(
        new Request("http://localhost/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": "not-a-signature" },
          body: "{}",
        }),
      );
      assert.equal(invalid.status, 400);
      Object.assign(process.env, oldEnv);
    } finally {
      if (orderId)
        await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
      await pool.query("DELETE FROM stripe_events WHERE id LIKE $1", [
        `${eventPrefix}%`,
      ]);
      await pool.end();
    }
  },
);
