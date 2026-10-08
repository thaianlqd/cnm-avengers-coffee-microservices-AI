# Product information, compound presentation and topping price repair — 2026-10-08

## Reported runtime evidence

The 21:29–21:41 ICT conversation is captured in `/private/tmp/review-followup-runtime.log`. Both review questions at 21:34 called `get_product_insights` successfully with zero business writes. The provider already returned comments, but Hybrid presentation fell through to its summary-only `message`. The flavor question correctly used `get_product_description`; Hybrid's extractive renderer omitted the product title and emphasis.

Two same-turn category discovery commands at 21:30 individually published their product cards, so the second publication replaced the first global display. Drink group references survived, but the UI only showed cakes and the reply repeated its introduction and closing question. At 21:38 fulfillment and payment rendered independently from intermediate state, repeating the address offer and showing payment choices after COD had been selected.

The pasted cart edit also exposed a price defect: Americano Chanh Leo remained 85,000đ after Hạt Sen was removed. Read-only Menu verification found Large = 75,000đ and Hạt Sen = 10,000đ. AI add payloads duplicate standard choices in `custom_attributes`; Order-service's PATCH retained the old custom Topping and charged it despite `toppings: []`.

## Changes

- Hybrid review answers render the average, total, five-star distribution and up to five newest nonblank comments with their rating/date. The SQL provider preserves complete comment content and source labels such as `[Dữ liệu mẫu]`, and uses deterministic date/ID ordering. No customer names or identifiers are retrieved. Review text remains untrusted data and cannot trigger tools. Instruction-shaped comments are filtered; Markdown/HTML formatting is constrained.
- Description answers display the canonical product name in bold and emphasize sensory phrases already present in approved evidence. No extra flavor, ingredient, allergen, price or stock facts are invented. Safety facets retain their existing evidence limitation.
- Adjacent discovery commands publish one combined numbered card collection and one matching reply. New reads replace the same refreshed group; complementary drink/food reads retain both groups. The global list remains capped at 16 with balanced group coverage and an explicit truncation notice. Failed reads preserve verified earlier results and honest failure notes. Separate category predicates cannot be represented by one current discovery delta, so a later ambiguous refinement requires explicit criteria instead of silently refining only the final category.
- Confirmed fulfillment/payment choices are rendered once from final turn state, followed by one remaining question. Payment cards are hidden once a method is selected unless the customer explicitly requests the available methods again. Checkout confirmation and automatic summary gates remain unchanged.
- Order-service makes standard option fields authoritative over their duplicated custom aliases, including explicit empty toppings. It preserves unrelated custom extras, recalculates Menu price, cleans persisted options and configuration signatures, and preserves idempotent replay. This fixes ADD and PATCH for AI/web payloads. AI's own price helper now sums surcharges independently of database row ordering.

## Validation

AI-service full offline suite: **5,884 passed, 1 existing skipped, 2 existing dependency warnings in 32.69 seconds**, run inside a network-disabled Docker container. Log: `/private/tmp/review-followup-suite.log`. Order-service full suite: **18 suites, 199 tests passed**; HTTP contract fixtures require a local loopback listener, so this suite ran with permission to bind it. Log: `/private/tmp/review-followup-order-suite.log`. New regressions cover detailed comments and safety filtering, source labels, evidence-only emphasis, combined card/reference alignment, partial discovery failure, display bounds, final-state checkout prompts in both command orders, topping removal/replacement with unrelated custom extras, mutation replay, and variant row ordering.

The Vietnamese golden corpus adds the reported review follow-up and taste questions (60 labeled cases). Scripted interpretation validates execution and grounding; it does not measure live model language accuracy. No live LLM provider request, customer cart mutation, order placement or cancellation was performed during this repair. Existing customer data and previously cancelled orders are not retrospectively changed.

## Deployment and real data

`docker compose build ai-service order-service` and `docker compose up -d --no-deps ai-service order-service` completed. Both containers started at 21:55:46 ICT. AI `/ai/health` returns `status: ok`, Hybrid commerce and Redis available; Order-service `/` returns `Order service is running`.

Running image IDs:

- AI-service: `sha256:854f50018a00fde514245466b2be86258d837f341f22a7f21c6dd3f698ac45b6`.
- Order-service: `sha256:53e3e4feb942102fb67cec9557460692bcb2224a5d265dcef9df7b15e3bed64c`.

All 20 changed AI runtime Python files match the tested host SHA-256 hashes. Container ID comparison confirms only these two services were recreated; all 12 pre-existing DataPlatform file hashes remain unchanged.

Read-only verification inside the rebuilt AI container returned Bánh Trung Thu Matcha: 4.4/5, 21 reviews, distribution 12 five-star / 6 four-star / 3 three-star / 0 two-star / 0 one-star, and five rendered recent comments with their dates and preserved sample-data labels. Description emphasis was also checked on the supplied Menu description text; this is renderer validation, not a post-fix live conversation test.

The rebuilt compiled Order-service resolver was exercised against actual Menu data with PostgreSQL `default_transaction_read_only=on`: Americano Chanh Leo Large with Hạt Sen = 85,000đ; explicit removal with a stale custom Topping copy = 75,000đ; duplicate standard aliases are removed. This directly verifies the correction without performing an ADD/PATCH on any real cart.

Only AI-service and Order-service are rebuilt/restarted. Frontend, geo.py and DataPlatform are outside this change. The twelve pre-existing dirty DataPlatform files are checked against their earlier hashes. No commit or destructive cleanup is performed.
