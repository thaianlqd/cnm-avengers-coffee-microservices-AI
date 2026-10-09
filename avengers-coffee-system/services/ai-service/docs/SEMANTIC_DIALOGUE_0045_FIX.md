# Customer chatbot: dialogue and suitability protocol, 2026-10-08

## Reported production turns

All times below are Asia/Ho_Chi_Minh. Existing container source matched nine workspace production files; startup occurred at 00:43. The reported turns were running the rebuilt application.

- **00:45:51–00:46:07, `hi`:** seven Gemini 3.5 responses, zero provider failures. The eventual action was a successful read of `get_cart`; server customer-flow presentation rendered the empty cart. No business writes occurred. Logs did not retain the content/rejection reason of the first five tool-free model responses, so their exact formatting errors cannot be established retrospectively.
- **00:46:40–00:46:47, sweet/cool drink request:** the stored proposal correctly contained `category=drink`, `preference_query="nước vị ngọt ngọt mát lạnh cho trời nóng"`, `preference_concepts=["ngọt","mát"]`, but `criteria=null` and `search_text="ngọt"`. The recommendation tool rejected it as `recommendation_basis_required`. The subsequent repair changed to `filter_catalog` with literal product-name search `ngot`, which returned `not_found`. The pending recommendation action remained unresolved and the final error was `semantic_repair_exhausted`. Two model responses, no timeout, no writes, no approved description retrieval reached.

This is distinct from the earlier provider outage. An HTTP 200/healthy container is not proof that semantic business behavior is correct.

## Changes

1. Remove the mandatory-looking `get_cart` example from the model-facing business-tool description. Explicitly distinguish final social JSON from business reads, selections and changes; document recommendation fields alongside the actual operation.
2. Treat a missing response kind or malformed final JSON as formatting feedback, rather than absence of business facts. For an initial tool-free turn without an established configuration/confirmation, allow **one** tools-disabled format repair. A typed social response ends normally. A typed business response must still obtain authoritative evidence through tools. Established pending configuration retains its guarded dispatch opportunity. Persistent formatting failure stops without inventing a business read.
3. Preserve a validated social reply after incidental successful cart/quote reads instead of unconditionally replacing it with cart presentation. A real cart consultation still renders authoritative committed/pending state; business writes retain their existing presentation and replay protection.
4. Normalize only structured model fields: a nonempty `preference_query` with missing/null/empty criteria declares description-based `preferences`. If a literal name filter duplicates an explicitly supplied preference concept, remove that duplicate name filter. Distinct product-family filters remain. Explicit contradictory sales/price/rating criteria require model repair; absent needs never default to sales. No raw-customer keyword classifier or product/location-specific rule was added.
5. A failed READ action cannot be completed or diverted by changing to an unrelated READ operation. WRITE repairs retain their existing prerequisite-read path and guarded operation checks.
6. Log safe response-validation categories and executed-tool counts to distinguish future formatting and evidence issues without recording response text, keys or customer details.

Description recommendations continue to require approved description evidence and current Menu identity/price/scope. Missing evidence remains an explicit clarification, never an unrelated bestseller fallback.

## Offline verification

New regression suite reproduced **11 failures before implementation**. Focused semantic, description, pending-cart and Gemini-continuation group after implementation: **255 passed**, 1 dependency warning, 3.33 seconds.

Full `tests` suite: **2,876 passed, 1 skipped, 2 dependency warnings**, 20.29 seconds. Log: `/private/tmp/chatbot-0045-full.log`. `git diff --check` passed.

Fixtures include the exact proposal from the reported production request and synthetic approved product descriptions, distinct English family/concept fields, multiple social phrasings, missing/contradictory criteria, unrelated-operation repair, bounded format failure, and a formatting-repaired business question that still requires authority. Existing pending-options/defaults, mutation evidence, checkout, continuation signatures, and read/write repair tests remain covered.

All tests run inside Docker with `--network none`, scripted providers and synthetic data. **Live inference calls made for this repair: 0.** Keep Gemini-only model order 3.5 → 3.1. Do not change `.env` or DataPlatform AI. Offline fixtures establish protocol/state behavior, not the reliability of future Gemini intent interpretation or current remote provider availability.

## Runtime update

Built and recreated only `ai-service` with `docker compose up -d --no-deps ai-service`. Internal `/ai/health` returned HTTP 200, `llm_tools`, provider `gemini`, fallback allowlist `gemini`, Redis available. Ten production files exactly matched workspace hashes. No chat/inference request was sent to verify deployment.
