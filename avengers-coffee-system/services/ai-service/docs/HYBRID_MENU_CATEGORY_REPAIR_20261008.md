# Hybrid Menu category restoration — 2026-10-08

## Runtime evidence and cause

The reported turn at 21:13 ICT / 14:13 UTC (`03cf9436-96bd-4b9f-95c6-e29f84c5c958`) failed with `discovery_delta_conflict` on primary interpretation and `invalid_argument_shape` on format repair. Final class was `INTERPRETER_PROTOCOL`; 2 provider requests and 0 business writes. The preceding generic browse and mixed drinks/foods browse succeeded.

The existing `execute_get_menu_categories`, Menu hierarchy CTE, legacy `READ_MENU` semantic operation, category snapshot, and category presentation were still present. The Hybrid command contract did not expose `READ_MENU` or a category reference in discovery, and TurnContext omitted the category namespace. The migration had left category navigation disconnected. The preceding reference upgrade addressed product group references and did not catch this missing capability. Tests that inject a correct DISCOVER_PRODUCTS meaning could not prove this category utterance would work.

## Restored customer behavior

- Generic “xem menu quán” has a READ_MENU meaning and shows actual sellable root categories, rather than the first five alphabetic products.
- “Xem danh mục Trà” uses READ_MENU with a literal name. The server resolves the actual Menu node and displays its immediate active subcategories.
- READ_MENU on a leaf, such as Matcha or Trà Sữa, displays its products.
- DISCOVER_PRODUCTS can carry `menu_category` for browsing products under a root or leaf. Root selection includes descendants: Matcha remains under Trà even when the product name contains no word “trà”.
- A category number resolves only from the immutable entry `menu_categories` list. It cannot alias a product, pending item, or cart line number, or be created by same-turn READ_MENU.
- Names are exact after accent/case normalization, not fuzzy. Qualified canonical paths disambiguate duplicate category names. Canonical IDs remain server-owned and absent from model context; literal customer IDs retain their existing explicit-presence check.

Menu data is queried through the existing sellable-scope classification: active drink/food products under configured Menu roots. Gift-card or merchandise selling support was not added to the commerce model.

## Implementation

`hybrid_menu.py` reconstructs nodes from canonical root-to-leaf ID/name arrays returned by `execute_get_menu_categories`. It resolves targets, validates current availability and scope, and publishes the displayed hierarchy level only after all references pass preflight. It uses one cached prerequisite category read per turn, without an extra inference pass.

The shared SQL category CTE now exposes ancestor IDs/names. `filter_catalog` binds `:category_id = ANY(paths.category_ids)` so both parent and leaf category filtering work; IDs are SQL parameters. Existing legacy leaf-category callers continue to match the same leaf.

Hybrid adds one READ_MENU intent (33 total) and optional `menu_category` to discovery/refinement. Context exposes names and category numbers. The interpreter distinguishes a category-list request from product search/purchase, and explains mutually exclusive delta representations during a format repair. It does not route raw Vietnamese text through production keyword branches.

A successful category display clears only the current global product-card view and publishes its empty fingerprint. Previously valid drink/food collections remain available for explicit prior-group references. This prevents old product cards from reappearing through fallback while preserving earlier scoped context. Pending options, cart, checkout summary, payment, voucher, and order state remain unchanged by category browsing.

Browse refinements persist a qualified canonical category name rather than a mutable ordinal or a hidden ID. A category switch derives its canonical drink/food scope and removes an incompatible prior multi-group allocation. An explicit broader scope/group change removes an incompatible narrow category constraint. Price/count/search refinements retain a compatible category. Rating within a category currently returns an honest unsupported-ranking message; it never silently drops the category filter or substitutes another ranking.

## Failure and mutation safety

Category reference availability is checked during the same whole-envelope preflight as other references. Unknown, ambiguous, stale, or mismatched categories stop before any write, even if a cart edit appears earlier in the envelope. A Menu outage is returned as a business failure with an honest message; generic READ_MENU does not leak an uncaught reference exception. Failed reads preserve the previous valid display.

Schema, ordinary ordinal semantics, product repair freeze, maximum 3 provider attempts, zero-inference UI clicks, existing stock/options checks, owned-order operations, checkout confirmation, and outcome reconciliation remain intact. No live provider was called by this implementation pass.

## Tests

Final full offline suite: **5,867 passed, 1 existing skipped, 2 existing dependency warnings in 33.17 seconds**. Command: `python -m pytest -q tests` in a network-disabled container; log: `/private/tmp/category-followup-suite.log`.

New `test_hybrid_menu_categories.py` covers hierarchy reconstruction, the exact reported tea request, roots and leaves, recursive membership without product-name matching, category numbers, category-to-product selection, snapshot immutability, stale references, no same-turn ordinals, Menu outages, zero preflight writes, retained group context, pending/summary preservation, delta repair guidance, hidden-ID exclusions, and parameterized SQL ancestry.

The labeled Vietnamese corpus expands from 52 to 57 cases with generic menu and named root/leaf category utterances. Corpus validation and scripted transport tests remain separate from real language accuracy.

## Build, real Menu read, and health

`docker compose build ai-service` and `docker compose up -d --no-deps ai-service` completed successfully. The running image is `sha256:fb64b7a2d59c227a4c4bf193ad2c5e8baff56e4f9d0771753cd51ebcb652a733`, started at 21:25:50 ICT. `/ai/health` returns `status: ok`, `agent_architecture: hybrid`, `chat_orchestrator_mode: hybrid_commerce`, and Redis available. All 18 changed runtime Python files match their tested host SHA-256 hashes inside the running container.

Read-only calls inside the rebuilt container verified the actual Menu database, without invoking the interpreter or an LLM:

- Sellable roots: Cà Phê, Thức Uống Đá Xay, Trà, Bánh & Đồ Ăn.
- Trà children: Matcha, Trà Shan, Trà Sữa, Trà Trái Cây, matching the website hierarchy.
- Filtering by the Trà root returns 26 products across those four subcategories, including Matcha.
- Filtering by the Matcha leaf returns 13 products, all in Matcha.

Container ID comparison confirms only `avengers_ai_service` was recreated. All 12 pre-existing dirty DataPlatform files retain their original hashes. No live provider call or customer mutation was used for these checks.

## Scope

Only AI-service is rebuilt/restarted. Customer frontend, geo.py and DataPlatform are unchanged by this repair. No git commit, destructive reset, live chat request, or real customer mutation is performed. The original V2 report describes its earlier validation checkpoint; this report records the category follow-up.

## Suggested manual checks, not run against a live LLM here

1. “hello cho tôi xem menu quán đi bạn” → actual root category list.
2. “cho tôi xem danh mục trà đi bạn” → actual tea subcategories.
3. Choose the displayed Matcha category number → Matcha products only.
4. Choose a displayed product number → its existing option workflow.
5. “cho xem các món thuộc danh mục Trà” → root descendants, including Matcha.
6. While pending options exist, ask for another category → pending options survive.

No claim of live Gemini success/accuracy is made before an actual post-fix provider run.
