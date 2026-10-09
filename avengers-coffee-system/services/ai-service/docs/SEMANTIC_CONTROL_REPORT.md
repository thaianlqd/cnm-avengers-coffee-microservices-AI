# Customer chatbot semantic-control refactor — 2026-10-07

Scope: `avengers-coffee-system/services/ai-service`, current `branch_thaian`, baseline `c7d7536`. No reset, checkout, revert, commit, deployment or Data Platform change was performed. The implementation is reviewable in the working tree. **Full acceptance is not claimed: 113 existing baseline tests remain failing.**

## 1. Root cause

The existing model could understand a request and propose the correct tool, but pre-model shortcuts, capability gates and gateway checks independently reinterpreted Vietnamese. Different grammars competed across shopping, per-product options, cart targets, vouchers, fulfillment/payment, profile locations, orders, reviews and knowledge. A valid interpretation could be hidden, vetoed or presented as a different unresolved operation.

The pre-edit lifecycle, A–G classification and bottleneck inventory are in [SEMANTIC_CONTROL_AUDIT.md](SEMANTIC_CONTROL_AUDIT.md).

## 2. Before / after

Before: customer → raw-text control shortcuts → model → additional phrase checks → business tool → partly raw-text recovery.

After, in the configured `llm_tools` lane: customer → **the existing model/tool loop** → bounded semantic proposal → server-owned canonical grounding → existing deterministic business checks → existing executor → factual presentation and typed recovery.

`customer_actions` is a virtual gateway adapter, not a replacement business service. Each action has an existing tool name, commitment, `args_json`, optional reference/facet and a current-message evidence span for changes. JSON strings avoid an unspecified object schema and duplicating every business argument schema inside the wrapper. All action structures and JSON objects are checked before executing the batch; business schemas and prerequisites are checked after grounding, immediately before execution.

Direct model reads remain questions. Direct model writes without semantic evidence are denied. Negation, questions, hypotheticals, conditionals and unknown commitments cannot authorize writes. Rejection authorizes only appropriate discard/skip operations; final confirmation requires AFFIRMED and the existing server preview/action checks.

References share one mechanism across PRODUCT, CART_LINE, VOUCHER, BRANCH, LOCATION_CANDIDATE, ORDER, PROFILE_ADDRESS, MENU_CATEGORY, PAYMENT and FULFILLMENT. IDs/names/indexes/focus/pending/singleton/recent/best resolve against authoritative snapshots/state; ambiguity clarifies. Cart ordinals and pending-product selection indexes remain stable during compound edits. Canonical provider aliases survive focus persistence. Current payment/fulfillment references use server checkout state.

## 3. Semantic authorities removed from production routing

| Domain | Change |
|---|---|
| Shopping / menu / discovery | No raw shopping shortcut or category/family rewrite after correct model arguments; existing catalog normalization, caching and display contract retained |
| Product options / defaults / corrections | Per-action canonical attributes replace whole-message option parsing; each product has its own draft and Menu schema; defaults corrections clear prior draft choices |
| Cart | Generic exact-line grounding replaces wording/verb/quantity vetoes; absolute patches and explicit partial-removal quantity use existing cart executors |
| Vouchers | Typed selection/rejection/BEST replaces voucher phrase interpretation; fresh eligibility and savings authority still checked |
| Fulfillment / payment | Typed commitments replace phrase evidence; enum/wallet/checkout prerequisites remain |
| Location / profile | Model supplies kind/purpose and supplied-location evidence; exact saved addresses, immutable map candidates, address completeness and later-turn saved offers remain guarded |
| Branches / reviews | State-only exposure and canonical references replace review-language gates; provider scope and branch inventory still checked |
| Orders | Owned reads unlock mutation capabilities; structured edits replace raw edit dialogue; exact order-line IDs replace ordinal fallback in semantic previews; later AFFIRMED replaces phrase confirmation |
| Knowledge | Validated static domain/facet replaces duplicate keyword authority routing; approved retrieval/source/evidence protections remain |
| Presentation | Typed unresolved namespace takes priority; partial batches show already committed cart state; resolved clarification does not mask later success |

No regression sentences, synonym map, monolithic NLU or semantic-classifier provider call were added. Explicit legacy mode remains available as before. `run_llm_tool_turn(..., semantic_mode=False)` is an internal compatibility interface, never an automatic fallback from the production semantic lane.

## 4. Parsers retained and boundaries

- UUID/code syntax and exact current literal ID/code anchoring are structural. An explicit customer UUID/code still needs owned-order/eligible-voucher service validation.
- Schema shape, enums, positive quantities, finite numbers, array/string bounds and exact Menu option membership are deterministic business/protocol validation.
- Canonical display indexes, alias normalization and snapshot/focus ownership are identity resolution.
- Literal address completeness checks remain conservative; they do not select the customer intent or overwrite the model's area/POI kind.
- Existing Menu default conventions, approved-source/evidence sanitation, currency proof and ingredient evidence checks remain factual/business guards.
- Legacy shopping, order-dialogue and phrase parsers remain for explicit compatibility callers. They are not the general language authority in `llm_tools`.
- The existing location business adapter remains intact and receives a canonical location override. Its internal saved-address/business promotion bridges were not rewritten. This is an intentionally retained adapter boundary, not a new raw-user router.

## 5. Files changed

- `src/agents/semantic_control.py`: shared evidence schema, namespace grounding and canonical focus (new).
- `src/agents/tool_policy.py`: guarded semantic dispatch/batches, canonical options, adapter seams and semantic-aware read cache.
- `src/agents/tool_capabilities.py`: state-only capability exposure and partial removal argument.
- `src/agents/llm_tool_orchestrator.py`: existing loop owns semantics; shorter prompt; explicit compatibility routing isolated.
- `src/agents/tool_artifacts.py`, `customer_flow_presentation.py`: typed recovery, batch completion and factual rendering.
- `src/agents/agent_memory.py`: minimal canonical focus identities/category fields within existing bounds.
- `src/agents/order_management.py`: internal typed confirmation/exact-line seams, business protocol unchanged.
- `src/function_calling/tools/knowledge_tools.py`: internal validated static route, retrieval unchanged.
- `tests/test_semantic_control.py`: new system-wide boundary suite.
- `tests/test_llm_tool_orchestrator.py`: shared **compatibility** fixture explicitly selects the old API; new suite restores the production default. Existing tests were not deleted, xfailed or silently passed off as production semantic coverage.
- This report and the pre-edit audit.

## 6–8. Preserved authority and safety

Catalog/recommendation providers, Menu options, authoritative pricing/sellability/stock, cart write executors, voucher eligibility, wallet/payment validation, profile/geo/branch providers, order service protocol, RAG ingestion/retrieval and factual envelopes remain authoritative. The order/RAG changes are adapter seams; partial removal calls the existing cart quantity executor.

Actor/session ownership, authentication, turn IDs, cart verification, canonical IDs, frozen current cart lines, valid options, branch compatibility, complete delivery addresses, immutable geo coordinates, owned order status/revision, preview expiry, later-turn confirmation, summary fingerprint, operation IDs, replay and uncertain-write reconciliation remain guarded. Preparing a checkout summary through the location adapter also locks confirmation until another turn.

Cache keys distinguish option questions from selection staging, knowledge facets and alternative-discovery requests. Identical semantic reads remain cached. Batch processing stops at unmet prerequisites or denied grounding and preserves successful earlier writes for presentation/replay. Logs include tool, commitment, reference kind, decision/denial and unresolved namespace/count, without evidence spans, full addresses or credentials.

## 9. Added tests

133 deterministic tests cover cross-domain commitment denial, current evidence anchoring, malformed batches/JSON, canonical namespace references, ambiguity/invented identities, per-product defaults/options/toppings, stable pending/cart indexes, quantity edits/removal, compound question plus selection, vouchers/BEST/rejection, fulfillment corrections, payment/wallet, locations/profile rejection/map candidates, branch inventory, category navigation, owned orders/previews, RAG facets, social turns, same-loop orchestration, exact-ID safety, focus persistence, read caching, later-turn/expiry locks, replay, partial recovery and unknown-write outcomes.

Fakes supply semantic decisions independently of production wording rules. These prove that correctly understood model proposals are not vetoed by a finite phrase vocabulary. They **do not prove live-model understanding accuracy**. The old shared runtime tests characterize compatibility behavior; the new suite explicitly exercises the production semantic boundary, including the real mocked provider loop.

## 10–11. Commands and results

Host Python lacks the service test dependencies. Tests ran in the existing image, with `--network none`; no live provider/database call or service restart. The root compose/example files are read-only fixtures, not executed deployment configuration.

Focused command:

```sh
docker run --rm --network none \
  -v '/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI/avengers-coffee-system:/repo/avengers-coffee-system' \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests/test_semantic_control.py -q --tb=short
```

Result: **133 passed, 1 warning in 1.17s** (exit 0).

Broader command:

```sh
docker run --rm --network none \
  -v '/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI/avengers-coffee-system:/repo/avengers-coffee-system' \
  -v '/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI/docker-compose.yml:/repo/docker-compose.yml:ro' \
  -v '/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI/.env.example:/repo/.env.example:ro' \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests -q --tb=short
```

**Final result: 113 failed, 2488 passed, 1 skipped, 2 warnings in 17.64s** (exit 1). All 133 new semantic tests passed; the 113 failure IDs are identical to HEAD. No newly failing test IDs. Full logs: `/private/tmp/chatbot-focused-tests.log` and `/private/tmp/chatbot-semantic-suite.log`.

HEAD comparison used a separate `/private/tmp/chatbot-head-baseline` assembled from tracked HEAD files through `git show`, including ai-service, contracts, compose and `.env.example`; no branch mutation:

```sh
docker run --rm --network none \
  -v '/private/tmp/chatbot-head-baseline:/repo' \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests -q --tb=short
```

HEAD result: **113 failed, 2355 passed, 1 skipped, 2 warnings in 17.63s** (exit 1). Log: `/private/tmp/chatbot-head-suite.log`. Initial runs lacked root fixture files and had one additional FileNotFoundError; that environment error was corrected for both sides.

Failure evaluation: no newly failing test IDs against HEAD. Existing failures include obsolete provider-call/presentation/static topology expectations, legacy option/profile/selection mismatches and business/geo fixture contract issues. They are **not all dismissed as obsolete**; existing safety-related assertions need separate triage. Examples: voucher-memory count, legacy defaults authorization, pending quantities, branch availability mocks and profile confirmation. The baseline suite was retained without weakening assertions. Thus acceptance criterion 25 (all existing relevant tests green) is **not met**.

Static checks: `git diff --check` passed; changed Python files parse with `ast.parse`; final changed/untracked paths are all within ai-service. No Data Platform edits, new language dictionary, second classifier, increased history bounds or catalog injection.

## 12–14. Provider, token/context and latency impact

No unconditional second inference/classifier call. Existing provider tiers, budgets, retries, tool rounds, token limits, response repair, compact context/history/results and caching remain. A batch is at most 16 actions; nested execution is bounded by the existing round-based tool budget, and JSON/string/schema bounds remain enforced.

Existing defaults already prioritize **Gemini 3.5 Flash Lite → Gemini 3.1 Flash Lite**, as verified in provider policy, compose and `.env.example`; no model-policy change in this diff.

Measured characters (not real tokenizer/cost measurements), identical synthetic authenticated server states, JSON `ensure_ascii=False`:

| Context | HEAD tools | New tools | HEAD prompt + schemas | New prompt + schemas |
|---|---:|---:|---:|---:|
| Browsing | 8 | 15 | 15,800 | 12,639 |
| Product context | 12 | 19 | 17,943 | 14,587 |
| Cart | 15 | 26 | 19,879 | 17,374 |
| Owned order context | 21 | 29 | 24,236 | 19,834 |

System prompt alone: **10,281 → 4,635 characters**. More state-reachable tools cost schema characters, offset by shorter shared instructions. Expensive order mutation schemas require owned-order context rather than raw wording. History/context limits are unchanged; focus adds only bounded canonical identity fields. Measurement script: `/private/tmp/chatbot-measure.py`.

Some former raw-text shortcuts used zero inference calls; those natural-language turns now use the normal model call. Removing a second handwritten language engine therefore does not imply identical latency for every turn. Compound actions can execute in one existing round. Real Gemini latency/token usage and output truncation rates were not benchmarked; fake usage counters are not claimed as measured provider savings.

## 15–16. Remaining limits and deferred work

- Live model interpretation remains probabilistic. An evidence substring anchors the current turn; it cannot prove the model classified its meaning correctly. Server protections constrain the effects of an untrusted proposal, and typed questions/negations are denied, but mocked decisions do not establish live paraphrase accuracy.
- Explicit legacy mode/compatibility APIs retain their phrase-based behavior; semantic mode does not fall back to them on provider failure. Provider outages return controlled recovery.
- The established location adapter and conservative address structure/default/evidence conventions are retained. Rewriting those providers/workflows would exceed the demonstrated semantic-boundary change.
- 113 HEAD failures remain; they require triage/migration or independent defect fixes. New semantic tests supplement rather than disguise those failures. All acceptance criteria and deployment readiness are not claimed.
- No live deployment, provider qualification or production chat-log replay was performed for this refactor. The code and detailed test evidence are ready for review.
