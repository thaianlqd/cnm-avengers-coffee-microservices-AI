# Customer policy, store references and review presentation repair

Demo evidence: 8 October 2026, 23:23–23:35 ICT. Work completed across midnight on 9 October. This follow-up preserves the previous Hybrid migration and its uncommitted repairs.

## Findings from logs and sources

- The 23:23 refund question successfully used the curated refund domain. Its record was only a generic summary, missing the website policy's deadlines, exclusions, contact and scope. This was an evidence-content gap, rather than a missing RAG route.
- The 23:34 turn interpreted both PROVIDE_LOCATION and READ_STORE_INFO. The first operation returned location-scoped stores; the second made an unscoped store read, emitted another list and replaced the visible branch ordinal namespace. The subsequent first-branch review consequently read 117 Nguyễn Văn Quá. A transient provider 503 and failover also occurred on the interpretation request; the two-list behavior occurred after successful interpretation.
- The request for reviews of five displayed products was represented by four individual READ_PRODUCT_INFO commands. The four-command envelope limit prevented expressing five independent reads in that shape. Individual detailed answers also repeated large comment sections.
- The widget handled bold text alone inside one paragraph. It did not render lists, italics or paragraph spacing as structured content. Seed labels were present in displayed comments, as stored in the source data.

## Changes

The curated refund record now follows sections 2 and 5 and the scope note of the local customer ordering-policy page. It includes transport damage, verified quality problems, same-day deadlines for drinks/cakes, the 24-hour deadline for remaining products, excluded reasons, hotline/email, requested order information, the support response window and online-versus-direct-purchase scope. Historical delivery coverage and obsolete payment availability are not copied into current factual answers. Policy section labels and deadlines are emphasized extractively.

Store listing supports an explicit administrative area and a bounded count. Address components are matched by the shared locality matcher; an empty area result never falls back to unrelated stores. An immediately adjacent read of the same nearby-store list reuses the verified first result, replaces its reply block and publishes a single coherent card/ordinal list. A legacy omitted location purpose is clarified only by this adjacent typed read. Explicit checkout purpose or a different store query is not rewritten. Nearby browsing preserves delivery, pickup and dine-in branch choices and checkout state.

Product review commands support all_visible or explicit targets in one command. The server binds every target against the frozen reference snapshot before executing one registered read capability. That provider uses canonical IDs and three SELECT queries for identities, aggregate ratings and bounded latest comments; it does not re-resolve product names. Duplicate, missing or contradictory selectors fail before execution. Envelope intent count remains 33, maximum commands remains four, and the capability inventory is now 44 (23 reads, 21 writes). Legacy default tool exposure remains unchanged.

Collection answers show every selected product, rating and review count, with bounded comment excerpts. Detailed collection answers add recorded distributions/dates and more comments for small lists. Excerpt budgets include escaped Markdown so large lists retain the final product within the 8,000-character reply-block limit. Single-product detail remains available. Dates from the new SQL provider are JSON-compatible.

The exact seeded prefix `[Dữ liệu mẫu]` is removed only from displayed review text at the user's explicit request. Raw SQL results and database records retain it. Other bracketed content remains literal, and seeded comments are not labeled verified or authentic. Missing comments are described politely without inventing feedback.

The customer widget uses a text-only React renderer for bold, italic, paragraphs, lists, headings and separators. Escaped review Markdown remains literal. HTML and link strings are rendered as text, with no injected HTML. Store, assistant and payment icons use consistent outline SVG components with decorative accessibility hiding. Store cards have clearer typography and support the actual published hours fields; map links accept HTTP(S) URLs only.

## Verification

Verification artifacts are local temporary files under `/private/tmp/presentation-*`.

- Complete network-disabled AI suite: **5,940 passed, 1 existing skipped, 2 dependency warnings in 42.85 seconds**.
- Customer frontend: 60 Node tests passed; production Vite build passed, with the existing bundle-size warning. The initial build attempt inside the running frontend's memory limit exhausted its Node heap; the host build and subsequent image build both passed.
- Actual React server rendering verified bold, italic, list elements and inert escaped HTML. A visual screenshot check was attempted, but Computer Use returned `Computer Use was not approved to use Google Chrome`. No screenshot-based visual approval is claimed; temporary preview files were removed.
- Read-only deployed-data verification returned five stores whose address components match Quận Tân Phú, and an exact subsequent lookup retained the first store's canonical ID/name. That store, 180 Thạch Lam, currently has no approved text comments; the answer remains honest about this.
- Actual recorded top-product IDs 73, 64, 60, 110 and 61 all returned in the review batch, retaining the catalog's averages/counts. Raw seed labels were preserved and displayed labels removed.
- The actual refund query returned ordering_policy_003 and its presentation contained every required deadline, exclusion, support contact and scope fact.
- These checks used no live LLM requests and made no customer cart/order writes. Scripted interpreter tests establish contract/adapter behavior, not live provider language accuracy.

## Deployment and scope

Both AI and customer-web images were rebuilt and recreated without dependencies. A final AI-only image refresh includes the large-review excerpt budget. Health, source hashes and final image identities are recorded below. The customer web service remains the existing Vite development service at port 5175 with its existing bind mount.

All 21 DataPlatform files dirty at the start retained their hashes. Analytics and Order-service container IDs were unchanged. No commit, reset, staging, dependency recreation, orphan removal, persistent-data deletion or customer-session cleanup was performed.

Final deployment evidence:

- /avengers_ai_service running sha256:bb20a11e32ed0f87370be99e555242713335188065b08c64370ca4bafa162942 2026-10-08T17:04:34.587419673Z 8142a65c63bf01a9fba5443b87c6f708fcfe4c9eb4c419c8656b826bbf3775d9
- /avengers_web_customer running sha256:9e6443a01ede83effc837af1be57a44d79364c98f526fadf66aaeaa09b0339e4 2026-10-08T16:57:41.655942426Z c7fe71fb49cd7e0a39b1a475659c1a3a8840ef6fba722eeb8fcacee91cbc5dbb
- /avengers_analytics_api running sha256:7395b8df111952f7c95e51c3cc562a6fffba53ddaeb6485f8fab24d1e297a7f1 2026-10-08T15:42:28.334141712Z 59d6c8748227fc9a53e69771a5c446bc227e15c0b522b9a34b45cdaee93b2f96
- /avengers_order_service running sha256:53e3e4feb942102fb67cec9557460692bcb2224a5d265dcef9df7b15e3bed64c 2026-10-08T14:55:46.438730346Z d24bcff99b9431b9e452801e23a5eaebe5c79389140e76b1c034cee0ba93b95c

AI health returns HTTP 200 with `status: ok`, `agent_architecture: hybrid`, `chat_orchestrator_mode: hybrid_commerce` and Redis available. Customer web returns HTTP 200. All 29 changed/new AI source files and 5 frontend source/test files match the tested workspace hashes. The final read-only policy/store/product smoke check passed after the AI-only refresh. `git diff --check` is clean.
