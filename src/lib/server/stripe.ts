import Stripe from "stripe";

let stripe: Stripe | undefined;

export function stripeConfigured() {
  const key = process.env.STRIPE_SECRET_KEY;
  return Boolean(key && /^(sk_test_|rk_test_)/.test(key));
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk_test_|rk_test_)/.test(key))
    throw new Error("Stripe test credentials are not configured.");
  stripe ??= new Stripe(key);
  return stripe;
}

export function appUrl(): URL {
  const value = process.env.APP_URL;
  if (!value) throw new Error("APP_URL is not configured.");
  const url = new URL(value);
  const local =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || local) || url.username || url.password)
    throw new Error(
      "APP_URL must be an HTTPS URL (or localhost for development).",
    );
  return url;
}

export function checkoutUrls(orderId: string) {
  const base = appUrl();
  const success = new URL(`/order/${orderId}`, base);
  success.searchParams.set("checkout", "success");
  const cancel = new URL("/", base);
  cancel.searchParams.set("checkout", "cancelled");
  return { successUrl: success.toString(), cancelUrl: cancel.toString() };
}
