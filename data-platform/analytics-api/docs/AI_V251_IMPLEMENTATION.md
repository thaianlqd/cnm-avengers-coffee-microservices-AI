# Data Platform AI V2.5.1 implementation report

Date: 2026-10-06. Scope: Data Platform only. Qualification uses scripted providers,
synthetic physical metadata and synthetic result rows, with HTTP and warehouse
connections forbidden. It does not establish live Gemini interpretation accuracy.

## A. Starting branch, HEAD and status

Actual branch: `branch_thaian`. Actual HEAD:
`2da735337bbc3a00d6715c991d5f205d137b8871`, matching the supplied reviewed baseline.
`git diff -- data-platform docker-compose.data.yml` was empty at the start.
Seven chatbot files already had user changes: `customer_choice_authority.py`,
`option_state.py`, `selection_language.py`, `shopping_turn_control.py`,
`tool_artifacts.py`, `tool_policy.py`, and `utils/geo.py`. No task edit touched them,
the review seed backups, or any other user-owned work. No Git mutation was used.

Baseline backend: 408 tests passed in 65.164 seconds.

## B. Live failure reproduced offline

Supplied live evidence: transport succeeded, contract failed at `filters.field`
with `invalid_filter_shape`, one provider call, zero analytical queries, 6,568 input
tokens and 931 output tokens. The body was 23,451/24,000 characters; only orders
and stores detailed packs survived, although products, promotions and payments
were explicit in the question.

Before editing, the same question, UI previous-quarter selection, comprehensive
depth and `multi` domain were reproduced using a scripted operation with
`field: city`, operator `in`, and the two stated city values. The local baseline
rejected before execution. Its strict Pydantic issue representation was
`field_required`/`unexpected_field` at sanitized nested filter paths, rather than
the supplied live `invalid_filter_shape` spelling. This is the same structural
root cause; the offline fixture does not claim to reconstruct the entire live
provider response. Local baseline body: 23,291 characters, 709 headroom. The
160-character difference from the reported live body is retained explicitly.

After the fix the fixture reaches `proposal_ready`, with one scripted call,
`filter_field_to_dimension`, zero repair and zero analytical proposal queries.
The expanded fixture validates all six requested operations across the five
domains and produces eight deterministic charts after synthetic approval.

## C. Root cause

`DecisionOperation.filters` directly exposed the strict internal `Filter`.
Pydantic rejected `field` as an extra key and required `dimension` before the
existing analytical canonicalizer could run. Provider transport and SQL were not
the failing layers.

## D. Model-boundary normalizer

`services/decision_boundary_normalizer.py` deep-copies an operation, checks a
maximum of 12 filters, and normalizes only the immediate filter objects before
`DecisionOperation.model_validate`. It accepts no prompt, metadata, routing,
grounding or SQL input. Reapplying it is idempotent and leaves values unchanged.
Requested and supporting operations use the same boundary independently.
Clarification revalidation uses the same normalized shape without double-counting.
Partial model clarification drafts also normalize their filter keys locally.

## E. Supported compatibility rules

| Input | Action | Rule ID |
|---|---|---|
| `field` only | Rename to `dimension` | `filter_field_to_dimension` |
| Equal `field` and `dimension` | Remove `field` | `redundant_filter_field_removed` |
| Canonical `dimension` only | Preserve | None |

Existing canonical ranking/default handling remains available. No additional
filter aliases (`column`, `property`, `key`, `attribute`, `dimension_name`,
`field_name`) are accepted. Internal `Filter` remains unchanged and strict.

## F. Conflict behavior

Conflicting references reject with path `filters.dimension` and stable code
`conflicting_filter_dimension`. The server never guesses. A conflict in any
requested operation rejects the complete plan before analytical execution. A
conflicting optional operation is omitted while valid requested work survives.

## G. Tool schema filter changes

Dedicated `DecisionFilter` exposes only `dimension`, `operator`, `value`.
The dimension description says to use `dimension`, never `field`. Operator
description requires a list for `in` and a scalar for every other operator.
Malformed combinations still reject locally. Both Gemini adapters carry the
same canonical declaration. Fresh planning omits refinement-only properties,
`removed_query_ids`, `order_by`, and support purpose boilerplate. Detail limits,
complete time grammar and partial clarification meaning remain available.
Refinement retains replacement/change fields. Chart properties remain absent.

## H. Normalization diagnostics

`contract_normalization_count` counts rule applications; `contract_normalizations`
contains a bounded unique list of rule IDs. Six aliased requested filters produce
count six, with one unique ID. These diagnostics carry no values, prompt, SQL or
raw provider response. Unresolved values still ask for semantic clarification;
alias compatibility does not bypass value grounding or UI constraints.

## I. Domain context priorities

1. Structured UI selection, protected.
2. Direct metadata label/profile/subject/entity/metric alias evidence, protected.
3. Main-domain related context and previous subjects.
4. Other optional related context.

Retrieval uses metadata text and checked profile links only. It does not choose
metrics, filters, operations or execution authorization. Ambiguous shared aliases
do not establish a direct domain. Longer exact matches suppress contained generic
matches. Shared scope words in legacy subject aliases require independent domain
profile evidence; a city phrase alone does not add the stores domain. Generic
analysis verbs are catalog stopwords. Diagnostic evidence uses IDs/categories,
without matching substrings from the prompt. Ties use score and ID deterministically.

## J. Full, compact and directory representations

The global directory has every physically available domain ID and business label.
Full packs retain purpose, entities, lenses, diagnostics, drilldowns, health
comparison constraints, related domains and caveats. Compact packs retain domain
and subject IDs, all checked profile metric/dimension references, lens IDs and
business labels/capabilities, and critical caveats. Business domain labels are
resolved through the always-present directory; metric labels remain in the
manifest. Additional metric meanings are deduplicated at domain-context level.
Caveat codes have short model meanings; public Vietnamese caveat labels stay intact.
Directory-only is permitted for optional knowledge, never silently for a strong
explicit domain. Cached full/compact packs are isolated by fingerprint, tier and
references and returned as copies.

## K. Pruning order

Remove optional purpose prose; degrade full to compact; omit optional packs from
lowest priority upward. Mandatory compact packs survive. Packing measures both
serialized adapters after every change. If required minimum knowledge cannot
fit, fail with `one_shot_context_budget_exceeded` before provider consumption.
Large sessions can prune whole optional manifest subjects, with explicit-domain
and stored-subject priority and reprojected packs; no partial JSON truncation.

## L. Explicit coverage of case #1

Strong candidates: orders, stores, products, promotions, payments. All five reach
the model as compact packs, together with all 16 directory entries. Order-item
and hourly optional knowledge is pruned. Reviews, wishlists, surveys and cashier
reconciliation cannot displace those five. This knowledge grants no permission
to execute an invalid metric, population, time, scope, relationship or PII query.

## M–Q. Before/after sizes and headroom

Counts are compact Unicode JSON characters, including provider envelopes and
escaping of the nested user content. They are not network bytes or token counts.
Both adapter bodies are serialized; the larger controls the hard allowance.
Production preview uses the actual configured primary model ID. The reproducible
qualification uses the fixed fixture ID `configured_model`.

| Component | Supplied live V2.5 | Reproduced local V2.5 | V2.5.1 fixture |
|---|---:|---:|---:|
| M. Semantic manifest | 8,384 | 8,384 | 7,525 |
| N. Decision schema | 6,366 | 6,366 | 6,139 |
| O. Domain context | 4,444 | 4,444 | 4,243 |
| P. Larger complete body | 23,451 | 23,291 | 21,727 |
| Q. Headroom under 24k | 549 | 709 | 2,273 |

After native body: 21,727; compatible body: 21,671. Fragment counts are not added
to estimate the body, because escaping/envelopes matter. The manifest saves
duplicate subject labels and uses lossless single-level dimension-set sharing;
roundtrip tests preserve all exact compatibility sets. Metric membership,
population groups, aggregation/additivity, quality directions, historical flags,
units, grounded value modes and checked references remain available.

The preferred 21,000-character target is exceeded by 727. It is a soft target:
the minimum five compact packs and essential time/clarification/semantic grammar
are retained. The hard default remains 24,000; it was not raised.

## R–T. Representative depth fixtures

| Fixture | Depth | Complete body | Headroom | Requested/supports | Charts |
|---|---|---:|---:|---:|---:|
| R. Top 5 products HCM | focused | 19,436 | 4,564 | 1/0 | 1 |
| S. Orders this month | deep | 20,645 | 3,355 | 1/5 | 6 |
| S. Voucher this month | deep | 22,030 | 1,970 | 1/4 | 5 |
| S. Payments previous quarter | deep | 19,376 | 4,624 | 1/4 | 6 |
| T. Exact live multi-domain | comprehensive | 21,727 | 2,273 | 6/0 | 8 |

Focused sends the products full pack only. Deep orders sends orders/hourly full
packs. Deep promotions retains promotions/orders full and stores compact.
Deep payments retains payments full. Greater depth is not required to consume
monotonically more characters; coverage and useful views are the contracts.

## U. Provider call invariant

Each analytical turn has a request-owned maximum of one provider call, including
transport allowance checks. Context errors consume zero calls. Normalization,
requested failures and optional omissions consume at most the initial call.
Approval consumes zero additional provider calls. Visual refinement and insight
generation remain deterministic. Analytical refinement is a new one-call turn.
The stored canonical contract remains `2.5`, because its shape did not change;
public pipeline/capability diagnostics identify implementation `2.5.1`.

## V. Contract repair count

Zero. No repair path was introduced or invoked.

## W. Fallback and escalation

Both zero. No provider/model switch or retry was introduced. Manual user retry
continues to be a new user action; the UI does not invoke it automatically.

## X. Requested/supporting behavior

Requested operations validate atomically and retain priority over optional work.
Total operations remain at most eight. Global optional limits are focused one,
deep six (configurable downward), comprehensive seven, further limited by
remaining total capacity. The tool includes `maxItems` locally, explicit dynamic
descriptions, and `ui.supporting_limit`. Existing Gemini compatibility conversion
strips validation-only `maxItems`; the description/UI signal controls model output
and strict local enforcement controls acceptance. Oversized optional arrays are
validated for at most 24 elements; omission diagnostics store at most 12 entries.
Supports inherit scope/time. Related populations require checked links, matching
clock and scope; no inferred shares or reconciliation. Voucher fixture marks
different metric-owned populations explicitly related.

## Y. Dashboard behavior

Chart selection, insights, evidence, domain sections and explanations remain
deterministic after approval. The live-shaped six requested operations yield
eight charts; counts are targets rather than quotas. The broad V2.5 fixture also
retains eight views, deep sales six with four chart families. Snapshot history,
Top N composition, distinct customer non-additivity, clock separation, contextual
store volume/exposure and no-cause protections remain tested. SQL compilation,
AST/PII/allowlist checks, read-only execution and result contracts are unchanged.
No frontend fields or flows were added.

## Z. Files changed

Production: `metadata/semantic_catalog.json`, `routers/ai.py`,
`services/agent_pipeline.py`, `analysis_pipeline.py`, `analyst_clarification.py`,
`analyst_decision.py`, `analytical_tool_contract.py`,
`decision_boundary_normalizer.py` (new), `domain_intelligence_service.py`,
`one_shot_context.py` (new), `one_shot_planner.py`, `semantic_manifest_service.py`.
Qualification: `tests/test_contract_v251.py` (new), `tests/test_domain_v25.py`,
`tools/qualification_v251.py` (new).
Documentation: this report, `MANUAL_EVALUATION_V251.md`, `V251_QUALIFICATION.json`
and the V2.5 implementation addendum. All paths above are inside analytics-api.
No compose, frontend or chatbot source changes were needed.

## AA. Tests added

Twenty new test methods cover: idempotence/value preservation/bounds, equality and
conflict, strict internal filter/unknown aliases, operator/value shapes, exact
live context/serialized headroom, six-operation approval, atomic requested and
nonblocking optional conflicts, unresolved-value clarification, support aliases
and global depth limits, oversized optional arrays, both wire schemas and
new/refinement separation, lossless manifest sets, deterministic priority pruning,
selected-domain priority/cache copies, pre-call budget failure, focused isolation,
dynamic metadata-only entity/metric aliases, authoritative UI scope/time,
redundant-key diagnostics, and refinement inheritance.
The existing depth-context test now checks complete directory/explicit coverage
instead of requiring context bytes to increase monotonically after compression.

## AB. Backend qualification

Commands run from `data-platform/analytics-api` with `AI_OFFLINE=1` and
`PYTHONDONTWRITEBYTECODE=1`, using `/private/tmp/data-platform-v24-venv/bin/python`:

```sh
python -m unittest discover -s tests -v
python -m unittest tests.test_contract_v251 tests.test_domain_v25
python tools/analysis_matrix.py --output /private/tmp/v251-analysis-matrix.json
python tools/one_shot_matrix.py --output /private/tmp/v251-one-shot-matrix.json
python tools/domain_matrix_v25.py --output /private/tmp/v251-domain-matrix.json
python tools/qualification_v251.py
```

Full suite: 428/428 tests passed in 74.115 seconds.
Targeted final retrieval/contract suite: 41/41 passed in 10.710 seconds.
New contract suite separately: 20/20 passed in 4.982 seconds.
Analysis matrix: 86/86 passed. One-shot matrix: 68/68 tests passed, with its
qualification scenarios completed. Existing domain qualification: eight scenarios
passed. New qualification: seven scenarios passed. Python AST syntax validation:
68 modules passed, without writing bytecode. No skipped failures were hidden.
Existing local LibreSSL/urllib3 warning does not fail the tests.

## AC. Frontend tests

From `data-platform/web-ui`: `npm run test:ai-charts` (8/8),
`npm run test:ai-understanding` (2/2), `npm run test:ai-agent` (31/31),
`npm run test:ai-input` (12/12). Total: 53/53 passed. Existing React list-key
warning appeared in the dashboard fixture; no frontend source was modified.
Tests preserve the five conceptual fields, safe error copy, hidden internal
payloads and user-triggered retry.

## AD. TypeScript and build

`npm run typecheck`: passed. `npm run build`: passed, 64 modules transformed,
Vite 5.4.21, 1.04 seconds. Main JS 370.20 kB (gzip 101.12 kB). No UI source change.

## AE. Docker

`docker compose -f docker-compose.data.yml build analytics-api web-ui`: passed
for both Data Platform images. Initial sandbox attempt could not write Docker's
external buildx activity cache; authorized sandbox escalation completed the same
two-image build. No service was started/restarted, and no chatbot image was built.

## AF–AH. External-call and mutation counts

AF. Real provider calls: **0**.

AG. Real embedding calls: **0**.

AH. Live database mutations: **0**; live database queries during task: **0**.

Network/warehouse guards enforce offline qualification. Approval executor calls
in artifacts are synthetic mocks, not live queries. Offline token counts remain
null; supplied live token usage is recorded only as historical evidence.

## AI. Manual live matrix

See [MANUAL_EVALUATION_V251.md](MANUAL_EVALUATION_V251.md) for the exact five live
retest questions, five UI inputs, expected safe diagnostics, approval checks and
blank token/result recording fields. These live tests were not executed here.
Machine-readable offline evidence: [V251_QUALIFICATION.json](V251_QUALIFICATION.json).

## AJ. Remaining limitations

The comprehensive preferred 21k target is not yet met; 2,273 characters of
headroom remain under 24k with all required semantics. Model language accuracy,
actual tokens, latency and warehouse report quality require the manual live
retest. Lexical retrieval recognizes explicit metadata evidence, not semantic
negation or arbitrary paraphrases; ambiguous candidates remain discoverable in
the global directory. Very large catalogs/sessions can safely fail before calling
the provider if mandatory knowledge cannot fit. No paid embeddings or hidden
provider rounds are used to mask those limits.

## AK. Git audit and final status

`git diff --check -- data-platform docker-compose.data.yml`: passed.
All task edits are inside `data-platform/**`; no hardcoded scenario-phrase branch
was added to production retrieval, normalization or planning. Semantic SQL and
security boundaries were not weakened. Final status is recorded below after
qualification; pre-existing chatbot modifications remain user-owned.

```text
 M avengers-coffee-system/services/ai-service/src/agents/customer_choice_authority.py
 M avengers-coffee-system/services/ai-service/src/agents/option_state.py
 M avengers-coffee-system/services/ai-service/src/agents/selection_language.py
 M avengers-coffee-system/services/ai-service/src/agents/shopping_turn_control.py
 M avengers-coffee-system/services/ai-service/src/agents/tool_artifacts.py
 M avengers-coffee-system/services/ai-service/src/agents/tool_policy.py
 M avengers-coffee-system/services/ai-service/utils/geo.py
 M data-platform/analytics-api/docs/AI_V25_IMPLEMENTATION.md
 M data-platform/analytics-api/metadata/semantic_catalog.json
 M data-platform/analytics-api/routers/ai.py
 M data-platform/analytics-api/services/agent_pipeline.py
 M data-platform/analytics-api/services/analysis_pipeline.py
 M data-platform/analytics-api/services/analyst_clarification.py
 M data-platform/analytics-api/services/analyst_decision.py
 M data-platform/analytics-api/services/analytical_tool_contract.py
 M data-platform/analytics-api/services/domain_intelligence_service.py
 M data-platform/analytics-api/services/one_shot_planner.py
 M data-platform/analytics-api/services/semantic_manifest_service.py
 M data-platform/analytics-api/tests/test_domain_v25.py
?? data-platform/analytics-api/docs/AI_V251_IMPLEMENTATION.md
?? data-platform/analytics-api/docs/MANUAL_EVALUATION_V251.md
?? data-platform/analytics-api/docs/V251_QUALIFICATION.json
?? data-platform/analytics-api/services/decision_boundary_normalizer.py
?? data-platform/analytics-api/services/one_shot_context.py
?? data-platform/analytics-api/tests/test_contract_v251.py
?? data-platform/analytics-api/tools/qualification_v251.py
```

**NO COMMIT PERFORMED. NO PUSH PERFORMED.**
