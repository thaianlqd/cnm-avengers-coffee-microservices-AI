# Hybrid informational capability repair — 2026-10-08

## Runtime findings

The 22:35–22:53 ICT demo requests reached the Hybrid interpreter, usually with valid customer commands. The failures were capability integration and presentation gaps:

- 22:35: ASK_KNOWLEDGE/refund supplied an implicit product-description facet to knowledge authority. That facet triggered product resolution and returned a product-name question, even though approved refund evidence exists.
- 22:36: READ_STORE_INFO/hours searched contact RAG. Contact evidence describes hotline/email; published store hours belong to Identity, and some branches have no published hours.
- 22:39 and 22:41: READ_STORE_INFO/reviews called get_top_rated_stores with `limit=5`, although its registered schema and executor accept no arguments. The gateway rejected the server-generated arguments as invalid_arguments. The customer-facing “interpretation error” was misleading here.
- 22:46 and 22:51: rating discovery used a legacy names-only recommendation query. Unrestricted scope admitted toppings, then re-resolved names and discarded rating/count evidence. The old empty-rating fallback could substitute sales/alphabetical results.
- 22:48: the price/category-only request was interpreted as taste recommendations. RECOMMEND_PRODUCTS could not represent numeric bounds. Description relevance could include coffee-flavored Frappe. Menu also contains two active records, IDs 113 and 116, with the same coffee name/price/description; both were recommended.
- 22:53: LIST_PAYMENT_OPTIONS read supported methods successfully, but shared checkout presentation asked for prerequisite choices. Wallet eligibility reported an unknown cart amount at entry.

The earlier RAG files and business providers were present. These errors do not demonstrate their deletion, and neither folder presence nor a valid interpreter envelope establishes correct end-to-end capability wiring.

## Changes

General knowledge reads no longer receive a default product facet. Product description/ingredient/allergen reads retain canonical product binding, source filtering and their existing safety boundaries. The actual curated refund record is used without introducing a keyword production router.

A registered read-only get_store_info provider reads active Identity branches and Franchise kiosks independently of checkout stage. It returns canonical names/addresses and Identity's published opening/closing fields. Kiosks have no equivalent hours columns; missing hours remain unknown. Generic questions list a bounded set of stores and ask which store, without claiming uniform global hours. Exact named/ID targets are grounded through the live provider, while ordinals remain bound to the frozen previous visible list. No store is selected by this read.

Global store reviews call the existing zero-argument provider correctly. Server presentation displays names, average stars, review counts and addresses. Its bounded list becomes the visible branch reference namespace, allowing a subsequent numbered review read. Detail comments are rendered literally through the shared sanitation boundary, preserving sample labels. Empty successful list refreshes invalidate prior branch numbers. Global review results are the provider's high-rated subset (up to five stores), not an exhaustive list of every store.

Rating discovery now uses the shared recursive Menu hierarchy and numeric filters. SQL joins recorded product ratings by canonical product ID, includes average/count evidence, orders by raw average then count/name/ID, excludes products without valid rating records, and applies category and price bounds before limiting. Ordinary all/drink/food discovery excludes toppings and merchandise. Product ratings have no moderation-status column in the deployed schema; branch reviews retain their APPROVED filter. Rating reads never substitute sales or alphabetical lists when evidence is absent. The old names-only recommendation/fallback implementation is removed; rating/price compatibility calls delegate to the canonical filter.

Discovery and taste recommendations can express inclusive/exclusive numeric price bounds; taste recommendations can also use canonical Menu categories. These bounds survive refinement and reach Menu validation. The interpreter guidance separates numeric/category suggestions from actual taste/occasion concepts and requests Cà Phê's canonical category for a coffee-family request. Description recommendations diversify only records with identical visible name/category/price AND approved description, retaining a real selected ID and its evidence. Distinct recipes/prices are retained; no Menu record is deleted or merged. Extractive flavor descriptions share the bold formatting helper.

LIST_PAYMENT_OPTIONS has explicit informational presentation at every stage. With an empty cart it does not request a quote or ask for voucher/fulfillment/branch decisions. With an existing cart it retains a fresh quote to determine wallet eligibility. The supported-methods answer remains informational and never sets a payment/fulfillment choice or advances checkout. Wallet login/balance/amount validation remains mandatory for an actual selection. No unverified wallet method is enabled by the informational path.

The interpreter command count remains 33; one read capability is added (43 total, 22 reads/21 writes). Legacy dynamic tool exposure is unchanged. The shared provider budget, mutation/replay fences and separate order confirmations are unchanged.

## Verification

The full offline AI-service suite and read-only checks are recorded below after final deployment. Scripted interpretation verifies adapters and business behavior, not live provider language accuracy. No live LLM requests or real customer cart/order writes are used in these checks. Existing uncommitted work is preserved; DataPlatform and Order-service are outside this follow-up.

Final full offline suite: **5,916 passed, 1 existing skipped, 2 dependency warnings in 33.67 seconds**. Run inside a network-disabled container with the full repository mounted for shared contract fixtures. Log: `/private/tmp/demo-capability-suite.log`. Added regressions exercise actual curated refund retrieval without product resolution; entry payment questions with no quote; current-cart wallet eligibility; valid global-store-review arguments; visible branch numbering and detailed comments; actual/missing hours; preserved voucher/confirmation state; canonical category/rating/taste price constraints; empty refresh invalidation; duplicate description diversity; and SQL rating scope/metrics/no fallback. Existing inventory-count assertions are updated for the single new read capability; description-evidence assertions ignore bold markup while explicitly checking the requested emphasis. `git diff --check` is clean.

Read-only verification against the deployed database passed:

- Five distinct coffee products under 100,000 VND, all under canonical Cà Phê, each strictly below the bound.
- No active Cà Phê product strictly above 100,000 VND: the reported empty response for this condition is valid for current data.
- Five normal products ranked by recorded average, each retaining rating count, with no topping. Highest: product 73, average 4.73684210526316 from 19 ratings. The fifth normal product is product 61; the prior loose topping is excluded.
- Existing global branch-review provider returns two qualifying active high-rated stores with no schema rejection.
- Canonical branch HN_LINH_DAM_CT3 publishes 07:00–23:00, and the hours renderer displays those source values.
- The actual refund query returns curated `ordering_policy_003`, scoped exclusively to refund.
- Supported payment codes remain VNPAY, NGAN_HANG_QR, THANH_TOAN_KHI_NHAN_HANG and VI_DIEN_TU; eligibility remains a separate current-order check.

Read-only smoke log: `/private/tmp/demo-capability-read-smoke.log`. It performs zero LLM requests and no customer cart/order mutations. These checks verify real SQL/RAG evidence, not natural-language interpretation by the live provider.

## Final deployment

`docker compose build ai-service` and `docker compose up -d --no-deps ai-service` completed for the final tested source. Running image: `sha256:fac52294c52847bfedf5bc477672b3c3c278e7eb43d03b9310ba5da743710ea8`, started **23:15:57 ICT**. `/ai/health` returns HTTP 200, `status: ok`, `agent_architecture: hybrid`, `chat_orchestrator_mode: hybrid_commerce`, with Redis available. All **26 changed/new runtime Python files**, including retained earlier repairs, match their tested host hashes inside this container. Container comparison confirms only AI-service was recreated; no persistent service was added or removed.

All 21 DataPlatform files dirty at the start of this follow-up retain their initial hashes. No Order-service/frontend/geo.py rebuild or edit was made in this follow-up. No commit, reset, staging, orphan removal or customer-session cleanup was performed. Logs and verification manifests are temporary local artifacts; this report is the repository record.
