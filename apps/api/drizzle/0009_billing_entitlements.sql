CREATE TABLE IF NOT EXISTS billing_provider_events (
  provider_event_id text PRIMARY KEY,
  provider_subscription_id text NOT NULL,
  tenant_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  failed_at timestamptz,
  failure_reason text
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  provider_subscription_id text PRIMARY KEY,
  provider_customer_id text NOT NULL,
  tenant_id text NOT NULL,
  plan_id text NOT NULL,
  plan_version text NOT NULL,
  provider_price_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL CHECK (status IN ('active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')),
  current_period_end timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entitlements (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  capability text NOT NULL,
  source text NOT NULL CHECK (source = 'subscription'),
  source_id text NOT NULL REFERENCES billing_subscriptions(provider_subscription_id) ON DELETE RESTRICT,
  plan_id text NOT NULL,
  plan_version text NOT NULL,
  active boolean NOT NULL,
  valid_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_id, capability)
);

CREATE INDEX IF NOT EXISTS entitlements_tenant_capability_idx ON entitlements (tenant_id, capability, active, valid_until);
