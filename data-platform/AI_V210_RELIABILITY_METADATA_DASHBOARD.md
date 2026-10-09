# DataPlatform AI V2.10 reliability, metadata and dashboard qualification

Follow-up: a real model response exposed an extra disclosure grouping and zero
ranking charts that this qualification missed. See
[Ranking dashboard recovery](AI_RANKING_DASHBOARD_RECOVERY.md) for the observed
reproduction, general fixes and additional verification.

## Scope and starting state

- Starting HEAD: `18a9bae8e350cadfb6e1a9bf55b3ffea383bd13a`, branch `branch_thaian`.
- Previous DataPlatform version: 2.9.6. Changes since `19ac766666e89fa76c33195527cdefab8c811667` were inspected before implementation. The starting worktree was clean.
- Baseline: 666 backend tests passed (220.035 s); 98 frontend tests passed.
- Scope: `data-platform/**` only. Customer chatbot files, dependencies and services are untouched. No reset/revert or customer restart was performed.
- Runtime reliability version: 2.10.0. The existing 2.8 semantic contract/provenance version remains compatible with saved-report verification.

## Observed failure and timeout policy

The recorded live failure contained no valid provider interpretation. Gemini consumed approximately a 16-second read window, then an identical large semantic submission received only approximately six seconds. Local metadata preparation was approximately 0.07 seconds. SQL, resolver execution, result validation and warehouse execution did not cause that incident. Provider slowness was observed; its upstream cause was not established.

| Policy | Before | After |
| --- | --- | --- |
| HTTP proposal ceiling | 29 s | 29 s, async boundary and shared cancellation event |
| Shared internal allowance | 27 s | 28 s, established before local metadata work |
| Deterministic reserve | 3 s | 3 s before every provider call |
| Primary transport | 18 total / 2 connect / 16 read | Up to 25 total / 2 connect / approximately 23 read, reduced by local elapsed time |
| Recovery transport | Up to 8 total / approximately 6 read | Remaining shared allowance minus reserve; no fresh deadline |
| Normal requests | 1 | 1 |
| Hard maximum | 3 | 3 across interpretation, format correction, transport retry and semantic repair |

One transport retry is allowed only for an actual early failure (elapsed <=3 s), with at least six useful provider seconds left after reserve and retry delay: connection/reset/DNS, early timeout, transient 500/502/503/504 or explicit UNAVAILABLE/INTERNAL, or retryable 429 with a valid positive Retry-After <=2 s. Small bounded jitter applies. Long response-window timeouts, authentication/access/model/schema errors, daily quota, exhausted time and a second transport resend are forbidden. Rate/quota classifications remain distinct.

Semantic repair follows a successful parsed interpretation and local validation issues. It patches named fields and freezes accepted unrelated meaning. A rare second targeted repair shares the same three-call ceiling. Invalid JSON is classified PROVIDER_FORMAT and counted separately from semantic repair and transport retry; bounded schema correction includes an explicit format instruction. Provider timeouts are PROVIDER_TRANSPORT, never semantic invalidity.

Deadline checks cover local preparation, invocation, validation, preflight and session writes. The HTTP boundary sets a shared cancellation event so a late worker cannot start more provider work or create/save a proposal. A synchronous transport already in flight cannot be forcibly terminated by Python; its timeout bounds it and late processing is rejected. A wall-clock test actually waits for a late worker, verifies the HTTP response under 29.25 s and verifies no late persistence.

## Compact metadata packet

`SemanticCandidatePacket` combines exact catalog anchors, focused domain retrieval, the cached compatibility index, grounded dimension values, structured UI constraints and stored meaning during refinement. It contains protected metric/dimension/time/ranking facts, relevant definitions/populations/units/filters, compatible subjects/dimensions, selected lens summaries, declared equivalent metric groups, caveats and unresolved candidate ambiguity. It is a menu of meaning, not an executable plan.

The interpreter chooses decomposition, analytical shapes, genuine ambiguous meaning, and clarification/unsupported meaning. It does not emit SQL, joins, operation graphs, chart layouts or authoritative supporting suggestions. Global metric directories, broad unrelated domain packs and repeated manifest/definition prose are removed from primary interpretation.

Product-ranking fixture, same question and UI controls, serialized wire body measured through the native/compat body serializer:

| Measurement (characters, not tokens or UTF-8 bytes) | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Native provider body | 17,463 | 10,572 | 39.46% |
| Compatibility provider body | 17,602 | 10,711 | 39.15% |
| Candidate packet | — | 3,175 | — |
| Provider parameter schema | 3,899 | 3,899 | Schema remains complete |

A warmed offline product proposal measured local metadata 41.84 ms, grounding 34.39 ms, retrieval 19.75 ms, resolver 2.02 ms and total 133.36 ms. These are synthetic, scripted-provider measurements from one warmed run, not production latency percentiles or a live model speed claim. The provider is still the dominant unmeasured variable. The packet regression asserts meaningful relative reduction, not an exact fragile character count.

## Catalog audit and validation

The audit covered orders, order_items, products, branches (`stores`), payments, promotions/vouchers, customers and inventory. All selected metrics already have business definitions, populations, aliases and units; profiles contain short business purposes, lenses, caveats, relationships and compatible dimension references. Metric dimensions are derived by physically validated compatibility rather than redundant per-metric prose. Voucher metrics have explicit non-null voucher requirements. SQL aggregate/null behavior and result validation remain unchanged: missing measurements are not silently zero-filled.

Orders/order counts and valid-order revenue/AOV remain separate populations. Product quantities are item units, not order counts; item revenue is not order-total revenue. Payment amount is transaction money, not order sales. Customer `total_spent` and inventory are snapshots with no invented history; inventory profiles explicitly disclose snapshot-only/historical-unavailable limits. No broad catalog rewrite was needed.

Real gap fixed: payment transaction status (`silver.giao_dich_thanh_toan.trang_thai`) was missing as a distinct dimension from order payment status. Added its business aliases and profile/lens/blueprint references, transaction-amount aliases and a precise all-transaction population definition. The generic metadata negation relation protects “do not treat A as B”; population-disclosure qualifiers prevent “nêu rõ trạng thái” from becoming an extra grouping. Numeric ranking quantifier aliases extract N and an unambiguous nearby catalog criterion; they never generate a complete intent or special-case any acceptance question.

Startup/readiness now validate subject/metric/dimension references, units, population filters, expression sources, aliases/canonical-identity conflicts, alias groups, feature shapes, domain/lens/blueprint references and relationship endpoints. Shared ambiguous natural-language aliases remain candidates. Descriptive reverse one-to-many edges are permitted only as metadata with a declared keyed endpoint; the SQL compiler independently authorizes unique target joins physically. Broken catalogs fail locally before provider use.

Compatibility and domain retrieval indexes are bounded and keyed by catalog fingerprint. Value profiles are bounded to 32 snapshots, use catalog fingerprint/snapshot version/physical-stat inputs and a five-minute TTL, and return defensive copies. Sensitive/missing columns are excluded. Metadata caching never caches an arbitrary model interpretation as authoritative meaning.

## Resolver and expansion invariants

The server continues to own compatibility, subjects, population decomposition, time, ranking legality, derived-feature prerequisites, physical query reuse, coverage and capacity. Every explicit requested requirement retains a mapping, including duplicate equivalent requirements sharing one executable query. Requested work resolves first; supporting work cannot replace it. All analytical SQL is compiler-generated, read-only, approved before execution and result-validated. Proposal generation executes no analytical result query.

Exact deterministic depth policy (unique requested semantic meanings; display IDs/prose do not count):

1. An explicit structured UI depth wins.
2. Comprehensive if at least two canonical subject-owning domains, at least five goals, at least three goals with at least three metrics, or ranking + trend + composition/comparison/aggregate are present.
3. Otherwise deep if multiple goals or more than two metrics; otherwise focused.

Targets remain guidance: focused 2–4, deep 4–6, comprehensive 6–8 useful views. Focused requests are not padded. Deep/comprehensive expansion first uses relevant lens recommended drilldowns and diagnostic dimensions, then compatible related-domain aggregate/distribution blueprints. It is deterministic, ordered by semantic meaning and metadata, bounded to 64 candidates, at most three supporting operations and eight total unique operations. Each candidate must pass resolver population relatedness, identical time/filter checks, query deduplication and compiler/capacity preflight. Raw identity/clock axes are skipped. No extra LLM call is made for expansion.

Invalid/oversized optional work is omitted with a limitation and excluded from replay; requested work remains. Saved reports replay the same server policy and omission IDs. Physical capacity is counted after executable deduplication. Dashboard allocation reserves slots for requested derived-share views before optional drilldowns. Quality scores are recomputed honestly from stored artifacts; no score is boosted to make tests pass.

## Dashboard and provider status

The primary dashboard changed from six-column hero/trend/donut spans to `grid-cols-1 lg:grid-cols-2`; every chart card is `col-span-1`. Four charts produce two rows of two; six produce three rows. Odd counts create no fake chart. Requested charts stay visible even above the preferred six; remaining slots use supporting charts. Semantic duplicates are removed; supporting charts retain labels. KPI, quality verification, tables and evidence remain available.

Plot areas use a consistent 320 px region. Long labels use horizontal bars inside the same card. Long explanations are available through a details disclosure without stretching the plotting region. No chart-type-specific card width remains.

Local readiness and provider operational status are separate. Provider status uses only real transport observations: unknown initially or after five stale minutes; available after success; degraded after one failure; unavailable after repeated failures or auth/access/daily-quota failure. It is process-local, resets on restart and does not lock out future requests. There is no Gemini healthcheck ping. UI shows warehouse, catalog and provider state separately, truthful processing text without fake percentages, transport-specific messages, and semantic clarification with the actual missing meaning.

Safe diagnostics include request ID, fingerprint prefix, packet/body/schema sizes, attempt categories/latencies, separate repair/retry counts, remaining allowance and metadata/grounding/retrieval/provider/resolver/persistence/session/total times. Structured logs exclude provider keys, full sensitive user text, secrets and hidden reasoning.

## Qualification results

| Gate | Final result |
| --- | --- |
| Full backend | **687/687 passed**, 283.610 s, isolated offline Docker |
| Full frontend | **104/104 passed**, 411.139 ms, all `src/utils/*.test.mjs` |
| TypeScript | `npm run typecheck` passed |
| Offline golden evaluation | **110/110 passed**, no failed cases |
| Offline capacity qualification | **8/8 passed** |
| Build/deployment | Both images built; only `analytics-api` and `web-ui` recreated; both **healthy** |
| Scope / whitespace | Every changed/new file is under `data-platform/**`; `git diff --check` passed |

Evaluation uses the existing V2.9 harness against the V2.10 implementation. See `analytics-api/evaluation/v210/acceptance_summary.json` and `payload_measurement.json`. Full backend covers archived contracts, approval, read-only execution, adversarial SQL/metadata, artifact/session integrity, semantic repair/frozen fields, deadline/transport classification, exact ranking anchors, the three acceptance questions, capacity/query reuse, saved-report verification and metadata expansion. Frontend tests include SSR layout for 1/3/4/5/6 charts, requested visibility, semantic deduplication and provider error/status presentation.

Deployment commands: `docker compose -f docker-compose.data.yml build analytics-api web-ui`, followed by `docker compose -f docker-compose.data.yml up -d --no-deps analytics-api web-ui`. No orphan removal was performed. Read-only smoke checks verified `/api/readiness` and `/api/ai/status` through the frontend proxy: version 2.10.0, local status ready, warehouse/catalog/Redis available, provider configured with state unknown, three-call ceiling, startup warehouse DDL disabled. All nine customer container IDs **and start times** match the pre-deployment snapshot. No customer service was restarted.

`analytics-api/evaluation/v210/qualification_results.json` records the final gate and smoke results. Full offline runs used `python -m tools.run_tests_v29` and `python -m evals.run_eval_v29 --output /out` in isolated Docker containers with the API source mounted read-only and `--network none`; evaluation output alone was mounted writable. Frontend verification used `node --test src/utils/*.test.mjs` and `npm run typecheck`.

Regression fixtures were updated where the intended policy changed: counts distinguish requested queries from new server supporting views; synthetic catalog extensions explicitly register their allowlisted sources and use their own aliases. Coverage and score verification remain enforced.

LIVE_PROVIDER_REQUESTS = 0. **Real provider stability not measured.** No live qualification was run. Mocked native HTTP and scripted intent fixtures prove server boundaries, not Gemini semantic accuracy or first-click reliability. The optional manual proposal-only qualification tool caps three submissions/six provider requests, reserves the worst-case three-call ceiling before starting another submission, and stops on unknown accounting/auth/quota. It is not CI and never approves/executes warehouse analysis.

WAREHOUSE_WRITES = 0 during qualification. Offline Docker tests have network disabled and fixture storage. Operational readiness probes perform read-only checks; startup warehouse DDL remains disabled.

Known limits: external provider latency/availability and semantic accuracy are not measured; metadata reflects documented warehouse semantics, not independent ground truth; snapshots do not gain history; process-local provider evidence is not a distributed health service; optional views depend on physical availability/capacity and may be fewer than targets. A synchronous in-flight I/O operation may finish after cancellation, but cannot continue proposal processing or persistence after deadline checks.

## Explicit acceptance answers

| Question | Answer |
| --- | --- |
| What caused the observed 16 s + 6 s failure? | No valid provider interpretation returned; two short read windows and a large repeated body allocated the allowance poorly. Local metadata/SQL were not the cause. Upstream Gemini cause remains unknown. |
| Did primary timeout change; can it use most of <30 s? | Yes: approximately 23 s read / 25 s transport within one 28 s internal deadline and 29 s HTTP ceiling. |
| When is transport retry allowed? | Once, early <=3 s transient failure, useful remaining window >=6 s after reserve/delay; small valid retry-after for 429. |
| When is transport retry forbidden? | Long primary timeout, insufficient remaining window, repeated resend, auth/access/model/schema/daily-quota failures. |
| Normal provider call count / hard maximum? | 1 / 3 per submission, across all recovery types. |
| Does the model generate SQL? | NO. |
| Does the server own analytical resolution? | YES. |
| Does local metadata narrow provider context? | YES. |
| Product-ranking body before / after? | Native 17,463 / 10,572; compatibility 17,602 / 10,711 characters. |
| Two equal-width desktop charts per row? | YES; one per mobile row. |
| Can supporting charts make requested work fail capacity? | NO; optional queries/views yield capacity first. |
| Provider reachability distinct from readiness? | YES; local readiness can be ready while provider evidence is unknown. |
| Customer chatbot files modified? | NO. |
| Real provider requests / live stability measured? | 0 / NO. Real provider stability not measured. |

## Changed files

- `data-platform/AI_V210_RELIABILITY_METADATA_DASHBOARD.md`
- `data-platform/analytics-api/evals/run_eval_v28.py`
- `data-platform/analytics-api/evaluation/v210/acceptance_summary.json`
- `data-platform/analytics-api/evaluation/v210/payload_measurement.json`
- `data-platform/analytics-api/evaluation/v210/qualification_results.json`
- `data-platform/analytics-api/metadata/semantic_catalog.json`
- `data-platform/analytics-api/routers/ai.py`
- `data-platform/analytics-api/server.py`
- `data-platform/analytics-api/services/agent_pipeline.py`
- `data-platform/analytics-api/services/agent_provider.py`
- `data-platform/analytics-api/services/analysis_catalog.py`
- `data-platform/analytics-api/services/analysis_expansion_service.py`
- `data-platform/analytics-api/services/analysis_pipeline.py`
- `data-platform/analytics-api/services/analytical_resolver.py`
- `data-platform/analytics-api/services/dashboard_planner_service.py`
- `data-platform/analytics-api/services/domain_intelligence_service.py`
- `data-platform/analytics-api/services/hybrid_analyst_planner.py`
- `data-platform/analytics-api/services/provider_budget.py`
- `data-platform/analytics-api/services/provider_health_service.py`
- `data-platform/analytics-api/services/readiness_service.py`
- `data-platform/analytics-api/services/request_anchors.py`
- `data-platform/analytics-api/services/semantic_candidate_service.py`
- `data-platform/analytics-api/services/semantic_catalog_validation.py`
- `data-platform/analytics-api/services/session_service.py`
- `data-platform/analytics-api/services/value_profile_service.py`
- `data-platform/analytics-api/tests/test_agent_v22.py`
- `data-platform/analytics-api/tests/test_analysis_contract.py`
- `data-platform/analytics-api/tests/test_comparison_score_v282.py`
- `data-platform/analytics-api/tests/test_domain_v25.py`
- `data-platform/analytics-api/tests/test_first_submission_v294.py`
- `data-platform/analytics-api/tests/test_hybrid_v28.py`
- `data-platform/analytics-api/tests/test_inactive_bindings_v295.py`
- `data-platform/analytics-api/tests/test_one_shot_v24.py`
- `data-platform/analytics-api/tests/test_overview_dashboard_v296.py`
- `data-platform/analytics-api/tests/test_overview_v283.py`
- `data-platform/analytics-api/tests/test_reliability_v210.py`
- `data-platform/analytics-api/tests/test_semantic_normalization_v293.py`
- `data-platform/analytics-api/tests/test_semantic_recovery_v284.py`
- `data-platform/analytics-api/tests/test_understanding_v21.py`
- `data-platform/analytics-api/tests/test_voucher_scope_v285.py`
- `data-platform/analytics-api/tools/qualify_live_dataplatform_ai.py`
- `data-platform/web-ui/src/components/AnalysisClarification.tsx`
- `data-platform/web-ui/src/components/AnalystDashboardSummary.tsx`
- `data-platform/web-ui/src/utils/analysisPresentation.mjs`
- `data-platform/web-ui/src/utils/analysisQuality.test.mjs`
- `data-platform/web-ui/src/utils/analystDashboard.test.mjs`
- `data-platform/web-ui/src/utils/analystDashboardLayout.mjs`
- `data-platform/web-ui/src/utils/analystDashboardLayout.test.mjs`
- `data-platform/web-ui/src/views/AnalyticsView.tsx`
