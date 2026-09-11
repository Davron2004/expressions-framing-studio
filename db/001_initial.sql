CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  idempotency_key UUID NOT NULL UNIQUE,
  configuration JSONB NOT NULL,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency VARCHAR(3) NOT NULL CHECK (currency = 'cad'),
  status VARCHAR(10) NOT NULL CHECK (status IN ('pending', 'paid', 'expired')) DEFAULT 'pending',
  stripe_session_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
