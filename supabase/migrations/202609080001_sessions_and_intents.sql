-- Phase 04 migration: wallet session, intents, idempotent payment attempts.
--
-- C-SESSION pins (verbatim):
-- - challenge TTL 5 min (expires_at now()+5min)
-- - session TTL 30 min (HMAC exp, expires_at now()+30min)
-- - sha256-hex-only nonce_hash/token_hash TEXT CHECK 64-hex + indexes
-- - NO plaintext columns (no token / signature / bearer plaintext storage)
-- - atomic UPDATE ... WHERE nonce_hash=$1 AND consumed_at IS NULL RETURNING
--   (second verify -> AUTH_INVALID, no session)
-- - function-only SESSION_HMAC_SECRET with versioned rotation
--   (verify-accept-old-for-one-session-TTL overlap then destroy; rotation
--   statement reserved for report). The secret lives only in Supabase secrets,
--   never in this migration, never bundled to edge/browser.
--
-- C-DDL pins (verbatim):
-- - payment_attempts(intent_id TEXT, idempotency_key TEXT, status TEXT,
--   tx_hash TEXT, card_nonce TEXT NOT NULL, timestamps)
--   PRIMARY KEY(intent_id,idempotency_key) UNIQUE(idempotency_key)
--   + tx_hash index
-- - first-claim INSERT ... ON CONFLICT DO NOTHING + SELECT ... FOR UPDATE
-- - store-txHash-before-wait ordering
-- - findByNonce+receipt reconcile; never second-submit
-- - settled only on receipt.status==1 (never-settled-on-uncertain)

create table if not exists session_challenges (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  wallet_address text not null,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists session_challenges_nonce_hash_idx on session_challenges (nonce_hash);
create index if not exists session_challenges_wallet_idx on session_challenges (wallet_address);

create table if not exists sessions (
  id text primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  wallet_address text not null,
  role text not null default 'user',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sessions_token_hash_idx on sessions (token_hash);
create index if not exists sessions_wallet_idx on sessions (wallet_address);

-- Canonical one-time consume (atomic; second verify -> AUTH_INVALID):
--   UPDATE session_challenges SET consumed_at = now()
--   WHERE nonce_hash = $1 AND consumed_at IS NULL
--   RETURNING nonce_hash, wallet_address, expires_at;

create table if not exists intents (
  intent_id text primary key,
  card_id text not null,
  merchant_id text not null,
  amount_base_units text not null,
  asset text not null default 'native-testnet-ctc',
  purpose text not null,
  confidence double precision not null,
  provider text not null default 'openai',
  model text not null default 'gpt-5.6-luna',
  policy_version integer not null,
  intent_hash text not null,
  status text not null default 'ready',
  request_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists payment_attempts (
  intent_id text not null,
  idempotency_key text not null,
  status text not null,
  tx_hash text,
  card_nonce text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (intent_id, idempotency_key),
  unique (idempotency_key)
);

create index if not exists payment_attempts_tx_hash_idx on payment_attempts (tx_hash);

-- Canonical first-claim (idempotent lock ordering):
--   INSERT INTO payment_attempts(intent_id, idempotency_key, status, card_nonce)
--   VALUES ($1, $2, 'pending', $3) ON CONFLICT DO NOTHING RETURNING *;
--   SELECT * FROM payment_attempts
--   WHERE intent_id = $1 AND idempotency_key = $2 FOR UPDATE;
-- Ordering invariant: UPDATE payment_attempts SET tx_hash=$1, status='broadcast'
-- BEFORE waitForReceipt (store-txHash-before-wait).
-- Reconcile policy: on timeout call findByNonce(cardId, nonce) + receipt lookup
-- by stored txHash before any retry; unproven outcome ->
-- PAYMENT_RECONCILIATION_REQUIRED, never a second submit.
