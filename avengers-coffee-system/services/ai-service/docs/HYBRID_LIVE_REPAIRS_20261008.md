# Customer conversation repairs — 2026-10-08

## Evidence and causes

Read existing `avengers_ai_service` logs for 12:19–12:35 Asia/Ho_Chi_Minh; no live model, map or payment request was initiated for qualification.

- At 12:33, `select_location_candidate` succeeded, then `request_checkout` rejected `confirmed_destination_drift`. The provider label had commas without spaces; `set_checkout_prefs` applied `canonical_address`, while destination drift and summary checks compared raw strings. Coordinates and selected candidate did not need replacement.
- `SELECT_PRODUCTS` always staged options, including products with an empty Menu option schema.
- Separate `CONFIGURE_PRODUCT` commands rendered each intermediate cart, producing repeated confirmations and cart lists for one customer message.

## Changes

- Compare checkout address and summary address using the same structural normalizer as persistence. Preserve the original provider identity, coordinates, label and fingerprint; actual destination changes still fail validation. This also accepts already persisted sessions affected by comma spacing.
- After successful delivery location confirmation, present current payment options when payment is the next required milestone. Use the final command state so a payment selected later in the same message does not receive a stale prompt. No payment method is chosen automatically.
- Ask only missing delivery address components. Preserve the numbered street across explicit administrative fragments; a new numbered street replaces the draft. Incomplete addresses do not trigger geocoding or silently use a saved address.
- Automatically add selected products with no configurable Menu options through the existing canonical option, quantity, price, stock and mutation gates. Fixed recipe fields are validated; optional toppings still require a customer choice. Read-only option questions do not add products. Same-message explicit configuration suppresses auto-add to avoid duplicate writes.
- Aggregate adjacent selection/configuration/cart-edit commands into one final cart reply. Mixed selections show the committed cart and only remaining drafts. Partial business failures report completed writes and the unfinished part once.

## Validation

- New offline regressions: 17 cases, in `tests/test_hybrid_live_repairs.py`.
- Focused Hybrid commerce/journeys/repairs: **99 passed**.
- Complete ai-service suite: **5672 passed, 1 existing skip, 2 dependency warnings** in 32.74 seconds.
- Tests ran in Docker with `--network none`, scripted inference and blocked socket connections for Hybrid fixtures. No orders or payments were submitted to live services.
- Full test output: `/private/tmp/hybrid-live-repairs-full.log`.
- Existing migration changes and customer data were retained. Only ai-service is rebuilt/recreated; infrastructure and other services are untouched.
- Rebuild and `docker compose up -d --no-deps ai-service` completed at approximately 12:43 Asia/Ho_Chi_Minh. Startup completed without logged errors; `/ai/health` returned `status=ok`, `agent_architecture=hybrid`, `chat_orchestrator_mode=hybrid_commerce`, `redis_available=true`.
- Live behavior after deployment remains for customer manual testing; qualification used offline provider fixtures and a read-only health request.
