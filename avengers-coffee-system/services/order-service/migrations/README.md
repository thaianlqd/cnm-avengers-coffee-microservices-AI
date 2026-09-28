# Order Service migrations

This service currently has no configured TypeORM migration runner; production
schema changes are deployed as reviewed PostgreSQL scripts. Apply migration
files once, in lexical order, with the target database credentials, for example:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260926_cart_state_idempotency.sql
```

`20260926_cart_state_idempotency.sql` is additive and preserves the temporary
Batch-1 runtime tables if they already exist. The runtime bootstrap remains only
as a rollout compatibility safeguard; this directory is the canonical schema
history.

`20260928_wallet_payment_reference.sql` adds a partial unique index for wallet
PAYMENT references. Apply it before enabling the transactional wallet checkout
path; inspect and reconcile duplicate PAYMENT references first if the index
reports a conflict.

`20260928_wallet_voucher_claim_outbox.sql` adds the durable voucher delivery
table. Its historical name is retained, while runtime use now covers wallet,
COD, VNPAY and bank QR checkout. Apply it before deploying this checkout path. The order
service retries pending claims on startup and every 30 seconds. Apply the
Identity service `migrations/20260928_promotion_usage_order_unique.sql` first;
its unique order key makes a retry after a lost response safe. Reconcile
duplicate `ma_don_hang` claims before creating that index.

`20260929_voucher_claim_outbox_hardening.sql` adds retry diagnostics, terminal
failure timestamps, a pending retry index and idempotent wallet refund
references. Apply it immediately after the two 20260928 scripts. Runtime
returns `VOUCHER_CLAIM_OUTBOX_NOT_READY` with HTTP 503 for voucher checkout
until both outbox migrations are present. Inspect duplicate REFUND rows by
`(customer_id, reference_id)` before applying if historical callbacks may have
credited the same refund more than once. A REFUND `reference_id` identifies
one refund event; separate partial refunds need separate event references.

Unpaid `WAITING_PAYMENT` claims expire after `VOUCHER_PAYMENT_HOLD_TTL_MINUTES`
(default 30). This uses the existing `created_at` and `status` columns, so no
new migration is needed. A later confirmed payment moves an expired claim back
to `PENDING` for idempotent delivery; monitor late settlements after hold expiry.
