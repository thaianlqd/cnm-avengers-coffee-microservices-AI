# Selected product / pending configuration follow-up — 2026-10-07

Scope: customer chatbot only, continuing the existing uncommitted semantic hardening on HEAD `9a0d4b46fa989e2d1e0471efd493004f2f77f434`. Data Platform is untouched. The user's latest instruction prohibits using their API key for tests: **zero live Gemini requests were sent in this turn**. Every pytest run used Docker `--network none`, scripted provider output and isolated business authorities.

## Evidence and causes

The 16:54 customer journey selected a coffee, then asked for size/ice/sweetness. The assistant asked which drink and showed unrelated products.

Read-only logs for conversation `c83c78e9-ba70-4cfd-b96e-aa971796b7e2` show a successful selected catalog lookup, followed by provider requests with tools disabled before product options were staged. The next customer turn successfully staged options. In the supplied failing configuration turn, the available container log ends at the second provider response's `customer_actions` call at 09:54:57 UTC; it does not expose a completed action/result for that call. The unrelated product interpretation cannot be reconstructed exactly from that incomplete log.

Source inspection and offline reproducers establish these server defects:

1. `discovery_complete()` treated a finished single-read catalog plan as completion even when the typed semantic action selected a product and still needed options. The provider loop disabled executors prematurely.
2. An `add_to_cart` CONFIGURE/DEFAULTS proposal omitting both product ID and reference reached required-field validation, despite a unique selected pending product. A nearby 09:53 log shows this exact missing-target configuration being denied with `invalid_arguments`.
3. A no-tool clarification was accepted while selected pending identities already existed. There was no requirement to consult that state before asking the customer which product again. A selected singleton lookup could likewise finish with another product-choice reply without reaching canonical options.

## Changes

- Selected discovery keeps executors available for configuration. A final envelope after only a selected singleton lookup requires `get_product_options`; a completed catalog read alone cannot finish the purchase step.
- Target-free CONFIGURE/DEFAULTS binds only a unique frozen pending product. It never guesses from focus, visible products or cart lines. Zero or multiple pending targets return structured unknown/ambiguous-reference guidance without writes. Commitment, current evidence, explicit default authorization, Menu legality, quantity and price checks remain in place.
- A no-tool clarification with pending products returns targeted internal tool feedback. The model must process the newest request against existing pending identities, or use the appropriate read for a question/interruption. This does not infer option values from raw customer text or authorize a write by itself.
- No sentence/product/category routing rules were added. Existing business tools and Gemini model priority remain unchanged.

## Verification

New offline regressions cover the multi-turn singleton purchase/configuration path, final-envelope selection repair, implicit CONFIGURE/DEFAULTS, zero/multiple-target safety, question/default authorization, internal repair of the identity clarification, and social/catalog interruptions retaining pending state. The initial reproducer run failed before source changes; all **9 new cases pass** after the fix.

Full offline suite: **2,546 passed, 113 failed, 1 skipped**. A separately reconstructed pre-fix source overlay, without changing the working tree, produced **2,537 passed, 113 failed, 1 skipped** (9 new cases deselected). Exact failed node IDs are identical: **zero new failures**. Syntax parsing and `git diff --check` pass.

Logs are retained at `/private/tmp/chatbot-pending-options-{full,baseline,build}.log`. This qualifies the deterministic server paths with scripted semantic proposals, not the real model's language accuracy. The remaining 113 baseline failures mean the full suite is not green; this follow-up does not claim system-wide live-model qualification.

## Applied locally

`docker compose build ai-service` and `docker compose up -d --no-deps ai-service` succeeded; only `avengers_ai_service` was recreated. HTTP `/ai/health` returned 200 with `status=ok`, `chat_orchestrator_mode=llm_tools`, `agent_provider=gemini`, and Redis available. SHA-256 hashes for both changed production files match between the tested workspace and the running container. The health check performs no model inference. Changes remain uncommitted for review.

Follow-up: the user explicitly requested resolution of the 113 baseline failures. They have now all been handled; the full offline suite is **2,659 passed, 0 failed, 1 skipped**. See [BASELINE_113_REPAIR.md](BASELINE_113_REPAIR.md) for production fixes, test-contract migrations, exact results and the updated local deployment verification. The figures above describe the earlier pending-options-only checkpoint.
