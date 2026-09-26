# Order Service migrations

This service currently has no configured TypeORM migration runner; production
schema changes are deployed as reviewed PostgreSQL scripts. Apply migration
files once, in lexical order, with the target database credentials, for example:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260926_cart_state_idempotency.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260927_checkout_safety.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/20260928_checkout_outbox.sql
```

`20260926_cart_state_idempotency.sql` is additive and preserves the temporary
Batch-1 runtime tables if they already exist. The runtime bootstrap remains only
as a rollout compatibility safeguard; this directory is the canonical schema
history.

The corresponding Identity Service migration
`../identity-service/migrations/20260928_promotion_usage_idempotency.sql` must
also be applied before enabling strict checkout voucher reconciliation. It
adds the remote order/voucher/user uniqueness guard used by the checkout
outbox.
