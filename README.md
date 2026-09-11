# Expressions & Images — The Framing Studio

A small custom-framing store with an oversized sense of craft. Pick a photograph, choose a real print size, frame and mat, inspect the dimensional preview, and complete a Stripe test checkout.

**Live URL:** https://framing-studio-production.up.railway.app

**Test card:** `4242 4242 4242 4242` · any future expiry · any three-digit CVC · any valid Canadian postal code. Never use a real card.

![The framing studio](docs/studio-desktop.png)

## The two-minute demo

1. Start with the alpine photograph. Move the pointer over the frame to see its depth.
2. Switch oak to walnut or gallery black; the preview and server-calculated price update.
3. Open the mat controls. Compare a standard border with the extra half-inch at the bottom.
4. Select **Explore frame layers** (the stacked-layers icon), then put it back together. Try **On your wall** and switch wall colours.
5. Choose another sample or upload a non-private photograph. Pick a standard print size.
6. Select **Make it yours**, use the Stripe test card, and return to the order confirmation. It waits for the verified webhook before showing **Paid**.
7. Open **Your orders** to see the order.

This is an independent concept demo by Davron, inspired by the Edmonton framing shop. It is not the shop’s operating checkout. There are no physical orders or real payments. The screen recording is intentionally outside this delivery.

## Stack and decisions

- Next.js 16 App Router, React 19, TypeScript.
- Three.js via React Three Fiber for the frame, procedural wood textures, glass, dimensional layers, and pointer interaction. Motion handles interface transitions; reduced-motion preferences are respected. A plain-image frame remains available if WebGL fails.
- PostgreSQL with `pg`, SQL constraints and transactions. Money is integer CAD cents.
- Stripe-hosted Checkout, test credentials only. Webhooks verify the raw-body signature and reject live events.
- Railway app + PostgreSQL deployment, with a multi-stage Docker build and automatic database migration on startup.

The browser submits configuration, never an amount. The server validates the configuration and recomputes the price. Checkout requests are idempotent at both the database and Stripe layers. Only a signed, paid Checkout webhook matching the saved order’s session, currency and amount changes its status to paid. A unique event ID plus row locking prevents duplicate fulfillment. Redirects and order-page polling cannot mark an order paid.

## Run locally

Requires Node 22 and PostgreSQL 17 (or Docker).

```sh
npm ci
cp .env.example .env.local
```

Set `DATABASE_URL`, `APP_URL`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env.local`. Keep secrets out of Git. `APP_URL=http://localhost:3100` for the commands below.

For a local database:

```sh
docker run --name framing-postgres -e POSTGRES_PASSWORD=local-demo-only -e POSTGRES_DB=framing_studio -p 127.0.0.1:55432:5432 -d postgres:17-alpine
```

Set `DATABASE_URL=postgresql://postgres:local-demo-only@127.0.0.1:55432/framing_studio`, then:

```sh
npm run db:migrate
npm run dev -- --port 3100
```

The studio and price calculation work without Stripe credentials; checkout displays an honest unavailable state. No fake payments or fake orders are generated.

With the Stripe CLI signed into a sandbox:

```sh
stripe listen --forward-to localhost:3100/api/stripe/webhook
```

Save its `whsec_…` signing secret in `.env.local`, use a sandbox secret key beginning `sk_test_`, and restart the app. The app rejects live secret keys. Only subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded` for this flow.

## Publish on Railway

1. Sign up at [Railway](https://railway.com) using GitHub. Create a project and choose **Deploy from GitHub repo**, selecting this repository.
2. Add a **PostgreSQL** service in the same project. Add a reference variable to the app: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (use the actual database service name).
3. Generate the app’s public domain in its Networking settings. Set `APP_URL` to that exact `https://…` origin.
4. Sign up at [Stripe](https://dashboard.stripe.com/register) and use a sandbox/test environment. Set the app’s `STRIPE_SECRET_KEY` variable to its test secret key. No live activation is needed for a sandbox demo.
5. In Stripe Workbench → Webhooks, add an event destination for `https://YOUR-RAILWAY-DOMAIN/api/stripe/webhook`. Select `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy the endpoint signing secret to the app variable `STRIPE_WEBHOOK_SECRET`.
6. Deploy. The Dockerfile runs `node scripts/migrate.cjs` before starting the server. The optional Railway configuration also supplies a pre-deploy migration and `/api/health` check. Point the generated domain to the runtime port (Railway assigns 8080 by default).
7. Complete a test purchase at the public URL. Verify the Stripe webhook response is 200, the confirmation changes to paid, and the order appears in the orders page. Replay the same event; the order must remain a single paid order.
8. Replace the live-URL line at the top of this README with the verified Railway URL.

Official references: [Railway Next.js + PostgreSQL](https://docs.railway.com/guides/nextjs), [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe test cards](https://docs.stripe.com/testing).

## Validation

```sh
npm run typecheck
npm test
npm run build
```

Integration tests require a dedicated disposable database whose name ends in `_test`:

```sh
POSTGRES_TEST_URL=postgresql://postgres:local-demo-only@127.0.0.1:55432/framing_test npm test
```

Tests cover authoritative pricing, malformed options and image bytes, concurrent checkout retries, simultaneous replayed webhook events, mismatched-payment rollback, and bad Stripe signatures. Integration tests are skipped without `POSTGRES_TEST_URL`.

## Framing details

Print sizes are 5×7, 8×10, 11×14 and 16×20 inches. Moulding has a ¾-inch visible face; mats are 1½, 2 or 3 inches. A bottom-weighted mat adds ½ inch below the image. Overall preview dimensions include the print, visible borders and moulding. This is a visual sales preview: production cutting measurements, rabbet allowances, exact mat-window overlap and print colour proofing would be a separate production workflow. See [Frame Destination’s mat-ordering guide](https://stage2-wp.framedestination.com/blog/mat-board/how-to-order-mat-board).

## Demo scope and data

There are intentionally no accounts, authentication, cart, shipping calculations or email. Order history and individual order links are public demo surfaces. Use sample photographs or non-private uploads. Uploaded images are resized to JPEG in the browser and validated before storage in PostgreSQL; the public list omits large image bytes, while individual order pages show the saved image. This modest storage approach suits a one-product demo, not a production photo service.

Prices are illustrative, not the shop’s actual price list. The original photograph remains cropped to the selected portrait print ratio; this demo does not include a crop editor. Checkout sessions that expire remain pending unless a paid webhook arrives; no fulfillment runs for them.

## Photograph credits

Sample assets are locally served from Unsplash source photographs under the [Unsplash License](https://unsplash.com/license):

- Alpine stillness: [mountain photograph collection/source](https://unsplash.com/s/photos/mountain), image `photo-1501786223405-6d024d7c3b8d`.
- Coastal light: [Ahmed Saeed — rugged cliffs and turquoise ocean](https://unsplash.com/photos/rugged-cliffs-meet-the-turquoise-ocean-with-crashing-waves-TnEG2VsbSgg).
- Quiet growth: [Tadeusz Zachwieja — sunlit fern](https://unsplash.com/photos/a-close-up-of-a-fern-plant-with-the-sun-shining-through-the-leaves-Zv8GSux1v8E).
