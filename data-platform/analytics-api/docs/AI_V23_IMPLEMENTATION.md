# Data Platform AI V2.3 — implementation and qualification

> Historical V2.3 record. Production now uses [V2.4 single-shot planning](AI_V24_IMPLEMENTATION.md); automatic repair/transport recovery described below is limited to explicit legacy tests.

Implemented on 2026-10-06. All validation described here uses scripted tools, synthetic metadata/results or mocked transports. It does not establish live language accuracy or warehouse business truth.

## Starting state and scope

- Branch: `branch_thaian`.
- HEAD: `a5c238eae340b15979614fe5f2c3cb4193cb3af2`.
- The starting working tree already contained changes in root `.env.example`, `docker-compose.yml`, and the chatbot AI service, including untracked chatbot files. Those changes were preserved; no chatbot code was read, edited, tested, staged or reverted during this task.
- There were no starting Data Platform diffs. This implementation changes only `data-platform/**`. `docker-compose.data.yml` was inspected and used for scoped builds; its content did not need modification.
- `data-platform/.env` was not changed. New budget examples are in `data-platform/.env.example`.
- No dependencies were added. Backend tests used the existing `/private/tmp/data-platform-ai-v21-venv/bin/python`; frontend commands used existing `node_modules`.
- Baseline: 292 backend tests passed in 25.767 seconds. TypeScript already failed on six missing type exports before the implementation.

## Root cause and evidence limits

The old `AnalyticalQuery` served both the model boundary and the strict internal query contract. Its `operation=aggregate` default consumed omission before structural repair. An explicit ranking object with an omitted operation could therefore become a contradictory aggregate query. `ranking.metric` was required before a single selected metric could supply the redundant reference. Partial refinement was also validated too early, before inheriting unchanged server state.

Rejected batches exposed a broad category rather than a bounded field/code explanation. The model lacked an actionable repair target. A sticky historical error could mask a later transport failure or round exhaustion, and the HTTP layer labeled a contract rejection as an invalid provider response. These are reproducible architectural defects.

The exact six-call live failure cannot be deterministically proven from the supplied browser summary. Its original model payloads and per-round transport diagnostics were not available. The offline regressions reproduce plausible payload classes, including omitted operation, explicit conflicting operation, omitted ranking metric, repeated invalid payloads and stale error attribution. They do not claim to reconstruct the exact live conversation.

Provider model availability, quota, interpretation quality and real Gemini acceptance remain provider-dependent. Existing mocked authentication, API style, retry, fallback and opaque continuation tests remain intact.

## Boundary and canonical contract

The production path is:

`LLM → semantic discovery → AnalyticalToolInput → canonicalizer → AnalyticalQuery → catalog grounding → AnalysisSpec/QueryPlan → deterministic SQL → SQL/security validation → read-only execution → result contract → evidence/dashboard`.

`AnalyticalToolInput` preserves omission with `model_fields_set` and `exclude_unset`. It validates field types but permits incomplete structure at the boundary. `AnalyticalQuery` requires a canonical operation and enforces logical dependencies. The reduced Gemini schema communicates required execution fields while strict Pydantic/catalog validation remains on the server.

Normalization uses explicit tool fields only:

| Condition | Canonical treatment |
|---|---|
| Ranking object exists; operation absent | Set operation to ranking |
| Ranking metric absent; exactly one metric selected | Copy that selected metric reference |
| Role absent | Existing default requested |
| Time absent | Existing default all_time |
| Ranking direction absent | Existing default DESC |
| Supporting purpose absent | Context |
| Refinement names a stored replacement | Merge unchanged fields from authoritative server state before logical validation |

Explicit nulls and conflicting values are not silently overwritten. Subject, metric, dimension, filters, comparison populations and trend granularity are never inferred from the user's sentence. Trend requires an explicit observation granularity. Detail requires projected fields and cannot aggregate. Ranking, cross-tab and relationship shapes remain strict. Time objects reject fields belonging to a different time kind.

The compiler and SQL/result validators retain catalog-owned metric formulas, populations, joins, time columns, grain, ranking limits, identity, privacy constraints and approved projection rules. No model SQL is executed. The generic `run_analysis` tool remains the only analytical execution tool; the six-tool surface is unchanged.

The actual Gemini native and OpenAI-compatible request bodies are tested. They contain typed scalar/list filter values and a usable partial clarification schema. Unsupported validation keywords and empty object schemas are excluded; source Pydantic schemas are not mutated. Bearer authentication, endpoint shape, model selection, retry caps, optional Groq fallback and opaque thought signatures retain their existing adapter behavior.

## Bounded repair and independent error attribution

Rejected contracts return at most eight allowlisted issues, for example:

```json
{"status":"rejected","error_category":"invalid_analysis_contract","issues":[{"path":"operation","code":"ranking_operation_required"}]}
```

Paths are bounded, unknown keys become `field`, and errors exclude raw Pydantic input/context, prompt text, SQL, physical schema, filter values, provider prose and secrets. Companion analytical calls receive `batch_aborted`. Semantic/value discovery can run first, but every analytical contract in a batch is prepared before any analytical SQL executes.

The default is two repair cycles across the turn, configurable with `AI_AGENT_CONTRACT_REPAIRS` and clamped to 0–2. This is a conservative turn-level cap. A repeated invalid semantic payload stops immediately after its first repair. Detection ignores arbitrary call/query IDs and normalizes order-insensitive selections; filter values enter only an internal digest. Digests are not exposed in diagnostics. Structural normalization is counted separately and does not consume a model repair round.

`current_round_error`, `last_contract_rejection`, `terminal_error`, `provider_failure` and `budget_exhaustion` are separate. The current error resets each round. A later provider failure or round/context budget wins over a historical rejection; an invalid contract in the last available round remains attributable to that rejection. Execution/result failures do not trigger model SQL repair.

| Layer | Diagnostics |
|---|---|
| Transport | provider_status: not_started/success/failed; provider_error_category only for transport failures |
| Tool contract | agent_contract_status: valid/repaired/invalid; agent_contract_error |
| Meaning | semantic_status: not_started/grounded/clarification/unsupported |
| Execution | execution_status: not_started/passed/failed |
| Returned rows | result_status: not_started/passed/failed |

A valid HTTP/tool response followed by a bad analytical contract reports provider success and agent invalid. Approval can report provider not_started with execution/result passed. A partial refinement retains prior validated results, marks completion partial and preserves the latest failed result-contract status rather than concealing it as passed.

Diagnostics include provider attempts/model/API style, agent/semantic/analytical/repair rounds, rounds to first valid query and finish, duplicate invalid count, tool/cache counts, requested/supporting operation counts, DB/value lookup counts, query-plan and result-row counts, chart counts/types/omissions, evidence counts and timings. Approval retains a bounded proposal cost summary. Provider tokens remain the adapter's reported values; character counts are not presented as tokens.

## Discovery, approval and refinement

Search returns physically checked, paginated subject/metric/dimension summaries. Subject summaries include available measures, units, grain, historical/additive capability, compatible dimensions and checked related subjects. Safe canonical enums are included only on the delivered dimension page. Search trims oversized result pages and returns a real next offset. Describe offers bounded pagination; value resolution remains a bounded read-only lookup for unresolved references.

Only IDs actually delivered through discovery or retained in fingerprint-checked server state are authorized. IDs hidden on another page cannot be guessed. Selected subject, metrics, grouping, projection, filters, ranking partitions and sort fields are checked. Compiler-generated period/rank fields remain subject to compiler validation. A sufficient search response permits execution without serially describing every reference. A resolve/run/finish batch can finish in one subsequent round.

The session retains learned references as well as validated operations, so a later metric refinement can reuse earlier discovery. Replacement patches inherit unchanged metrics/dimensions/filters/time/ranking/limits and omitted role/parent/purpose before validation. A replacement cannot promote/demote its stored role or switch its supporting parent. New metrics or dimensions still require actual prior discovery or an additional discovery call. Cached rows are revalidated under the current fingerprint and contract.

Proposal registers and validates operations without analytical execution; bounded dimension lookup may still be necessary. Public report generation requires a proposed session and matching request/schema. Approval executes the complete stored operation set and reuses its dashboard plan with **zero model calls**. Trusted internal pipeline calls without a session remain available for existing offline fixtures; the public HTTP path cannot use that bypass. The UI's Step 1 direct execution shortcut was removed.

## Supporting investigations and budgets

The model chooses supporting questions from discovered measures, dimensions and checked related facts. Production has no product/city/ranking phrase router. The system instruction encourages distinct breakdowns, historical trends and complete-population composition when analytically useful, while respecting a request for a single number or table.

Supporting operations require a requested parent. Their filters and normalized time must equal the parent's. Compatible related subjects need a checked child-to-parent path and matching authoritative metric time/population predicates; different fact grains remain different measurements. Snapshot metrics cannot acquire historical trends. Invalid supporting scope cannot produce SQL.

Defaults: six agent rounds, eight logical operations, twelve DB queries, eight charts, three supporting operations per requested parent, four value lookups, 6,000 characters per tool result, 48,000 history characters, four preview rows, 100 categories and sixteen series. Existing environment controls remain configurable. Requested work is admitted before optional supporting work. Excess requested work fails visibly; optional support can be omitted with a limitation and partial completion.

## Dashboard, evidence and interface

The dashboard validates model visual proposals against stored rows and fills uncovered results with safe defaults. An invalid proposed chart no longer suppresses a valid default for that result. Families include bars/horizontal bars, grouped/stacked/100% bars, line/area/multi-line, donut, heatmap and scatter; eligibility depends on actual shape, units, completeness, ordering and paired observations. Scalar/detail results can remain KPI/table only.

Requested views take priority. Canonical operation purpose orders ranking, comparisons, trends, composition and relationships; arbitrary model purpose/priority cannot demote requested results. Duplicate views are omitted. Quality diagnostics describe operation/purpose/family/metric coverage and duplicates rather than inventing a score.

Different units use separate linked views. An auxiliary revenue view over quantity-ranked products explicitly identifies the selected ranking cohort. Compatible same-unit metrics can use grouped bars or multi-line trends. A Top N or explicitly limited subset cannot become whole-population composition. Donut/100% composition requires validated complete, nonnegative additive populations. Scatter requires sufficient paired observations at an explicit grain and carries an observational caveat. Every chart/KPI/value comes from validated rows or deterministic evidence; creating an additional view does not execute a new query.

Representative results: a bounded product investigation yields four views from four queries; a composite fixture yields seven views from six queries and five families (horizontal bar, bar, line, donut, multi-line). A narrow ranking fixture remains one chart; no artificial chart minimum was added.

Deterministic features retain ranking gaps/concentration, complete-population shares, comparisons, observed trends and paired relationships where valid. Conclusions add applicable interpretation caveats instead of repeating the same finding sentence. Claims/recommendations reference accepted evidence and retain existing preconditions; causal, stock, margin, depreciation, forecast and future-demand claims are not fabricated.

The interface separates requested and supporting views, gives the primary/time-series views more width, renders every accepted chart within the server budget and paginates secondary result tables. Cards display actual business titles, purposes, units and subset caveats. Step 2 shows interpreted scope/ranking/granularity and source explanations without SQL; ranking is no longer mislabeled as an area/trend. Saved reports preserve analytical queries, explanation, dashboard plan and completion status. Failure headings name the actual failed layer; HTTP 200 alone never implies success. Partial reports show their incomplete status and row observation time. Evidence scope labels use business subjects rather than visible internal query IDs.

## Cost measurements

These are actual counts from scripted orchestration. DB calls below are mocked. Approval rows are separate invocations from proposal rows; charts are constructed after approval. No actual token counts or prices are claimed.

| Fixture/invocation | Rounds | Semantic tools | Analytical tools | Mock DB | Repairs | Queries | Charts |
|---|---:|---:|---:|---:|---:|---:|---:|
| Normalized ranking proposal | 2 | 1 | 1 | 0 | 0 | 1 | 0 |
| Ranking approval | 0 | 0 | 0 | 1 | 0 | 1 | 1 |
| Bounded investigation proposal | 2 | 2 | 4 | 0 | 0 | 4 | 0 |
| Investigation approval | 0 | 0 | 0 | 4 | 0 | 4 | 4 |
| Composite proposal | 2 | 6 | 6 | 0 | 0 | 6 | 0 |
| Composite approval | 0 | 0 | 0 | 6 | 0 | 6 | 7 |
| Conflicting contract repaired proposal | 3 | 1 | 2 | 0 | 1 | 1 | 0 |
| Repaired proposal approval | 0 | 0 | 0 | 1 | 0 | 1 | 1 |
| Add revenue refinement | 1 | 0 | 1 | 1 | 0 | 1 | 2 |
| Add weekly trend refinement | 1 | 0 | 1 | 1 | 0 | 2 | 3 |
| View-only refinement | 1 | 0 | 0 | 0 | 0 | 2 | 3 |
| Duplicate invalid failure | 3 | 1 | 2 | 0 | 1 | 0 | 0 |

System prompt: 2,502 characters. Compact agent declarations: 3,056 characters during discovery; 9,119 for all six tools. History characters: normalized ranking `[379, 1714]`; repaired ranking `[379, 1714, 2235]`; bounded investigation `[379, 2044]`; composite `[379, 10810]`; metric/trend/view-only refinements `3263/4000/6215`. The JSON artifact records each round's semantic context, tool result and result projection sizes. Native/OpenAI wrappers can add transport characters; exact wire schemas are separately tested.

The archived V2.2 matrix used a different fixture/test set (153 tests) and smaller declarations/system text; it is not a fresh apples-to-apples baseline. This implementation does not claim universal token savings. It makes omission recoverable, repair bounded, sufficient discovery reusable and approval free of model calls. The reported six-round live failure is a supplied observation, not a locally reproduced provider measurement. The composite script intentionally repeats subject discovery; repeated identical calls use the semantic cache.

See `AGENT_MATRIX_V23_OFFLINE.json` for costs and `MANUAL_MATRIX_V23_OFFLINE.json` for 86 compiled-meaning scenarios.

## Security and qualification

Raw SQL fields, extra fields, unsafe identifiers and invalid analytical shapes remain rejected. Discovered IDs are an additional knowledge check, not authorization: catalog availability, privacy, relation/cardinality checks, metric population, SQL semantic/security validation, read-only execution and row/result contracts still determine what can run. Model-selected IDs cannot grant access. Duplicate analysis/cache reuse revalidates rows. Logs/traces exclude prompts, SQL, filter values, credentials, arbitrary provider error prose, thought signatures and chain-of-thought.

The hard-coding audit found no natural-language routing or specific city/Top 5 phrases in changed agent, boundary, discovery or compilation production modules. Legacy understanding helpers are used for dates, business labels and clarification presentation, not primary prompt classification. Metadata and existing compiler/result validators were not weakened.

Added 24 backend tests in `test_agent_v23.py`: omission versus explicit values, canonical enums, paraphrase-independent scripts, field feedback, bounded repair, duplicate detection, latest/stale/provider errors, layer diagnostics, value-free traces, non-guessing, exact wire schemas, discovered IDs, resolve/run batching, inherited refinements, atomic batches, hard UI scope, zero-provider approval, approval-required HTTP, execution/result failure attribution, seven-view diversity, units/result reuse, safe chart fallback and snapshot/supporting scope rejection. Existing V2.2 fixtures now explicitly provide trend grain and paginate discovery for selected IDs; synthetic `in` rows respect population/grain rather than bypassing validators.

Frontend tests include requested/support grouping, all seven cards, responsive width classes, units/Top N caveats, paginated safe labels/escaping, six failure layers, observed area segments/gaps, proposal type labels and single weekly trend display. Existing chart/understanding/transport/security tests remain included.

Final command results and the complete changed-file list are recorded in `V23_QUALIFICATION.md`: 316 backend tests, 24 V2.3 matrix tests, 86 domain scenarios and 34 frontend tests passed. Vite and both scoped Docker builds passed. TypeScript retains exactly its six baseline errors. Reproduction from `analytics-api`, using the existing environment with requirements installed:

```sh
AI_OFFLINE=1 python -m unittest discover -s tests
AI_OFFLINE=1 python tools/agent_matrix_v23.py
AI_OFFLINE=1 python tools/analysis_matrix.py --output docs/MANUAL_MATRIX_V23_OFFLINE.json
```

From `web-ui`: `npm run test:ai-charts`, `npm run test:ai-understanding`, `npm run test:ai-agent`, `npm run typecheck`, `npm run build`. From the repository: `docker compose -f docker-compose.data.yml build analytics-api web-ui`. No services were started and no images were pushed. Original CRLF files retain their line endings; diff whitespace verification uses `core.whitespace=cr-at-eol`.

## Manual live matrix — for the user, not executed here

Use Auto scope unless the scenario specifies a UI constraint. Inspect/approve Step 2 before execution. Confirm values against Silver/business definitions rather than against synthetic offline numbers.

| Test | User prompt | Expected result |
|---|---|---|
| A | top 5 sản phẩm được mua nhiều nhất tại khu vực thành phố hồ chí minh | Product quantity ranking, HCM, Top 5 descending, all time, few rounds; distinct supporting views when catalog/data permit |
| B | top 5 món bán chạy nhất tại thành phố hồ chí minh tháng 9 | Correct September/year resolution, Top 5, generic sản phẩm unit |
| C | cho tôi top 5 sản phẩm bán chạy ở Hà Nội và top 3 sản phẩm bán chạy ở Cần Thơ trong quý trước | Separate populations with Top 5/Top 3 and the same previous quarter; no global flattening |
| D | chi nhánh nào hoạt động tốt nhất tháng trước? | Narrow metric clarification using catalog choices, preserving subject and previous-month time |
| E | cho tôi xu hướng doanh thu theo tuần trong 30 ngày gần nhất tại Hồ Chí Minh | Revenue, weekly observation grain, rolling 30 days, HCM, line-style view |
| F | top 5 sản phẩm bán chạy ở Hà Nội trong quý trước, so sánh doanh thu với TP.HCM và cho tôi xu hướng doanh thu theo tuần | Multiple requested ranking/comparison/trend operations; relevant rich dashboard |
| G | phân tích tình hình bán hàng tại Hồ Chí Minh trong quý trước | Bounded investigation chosen by the model from the catalog, with disclosed scope and evidence |
| H | phân tích cơ cấu và xu hướng thanh toán trong quý trước | Available payment metric/dimension, composition only on complete population, historical trend only if supported |
| I | lợi nhuận thực tế sau khấu hao theo chi nhánh | Unsupported metric/clarification; no invented formula and no analytical SQL for unsupported meaning |
| J | Turn 1: Top 5 products HCM; turn 2: thêm doanh thu; turn 3: thêm xu hướng theo tuần | Preserve scope/time/ranking, reuse prior discovery/results, add only necessary metric/trend work |

For every live scenario record provider attempts/models/API style and reported tokens, agent/semantic/analytical/repair rounds, sanitized tool names/issues, operations/plans, query/lookup counts, result rows, charts/types/requested/supporting/omitted counts, evidence count and latency. Do not export keys, prompt-containing debug dumps, raw values/PII, opaque continuation or private reasoning. Approval diagnostics include the earlier proposal cost summary; approval itself should have no model calls.

## Remaining limitations and task boundaries

- Live Gemini compatibility, language understanding, chart choices and business correctness were not measured. A successful offline script is not proof that an actual model interprets every paraphrase correctly.
- Useful supporting queries are model-selected, not forced by a server phrase rule. A narrow request may remain one chart. Seven charts are a representative fixture, not a promised minimum for every report.
- Tool/history/query/chart caps can produce clarification, failure or explicitly partial results. High-cardinality results retain bounded query/visual/table behavior; the dashboard does not invent full-population composition from a limit.
- Session storage remains the existing in-memory TTL store; multi-replica persistence and fresh-data invalidation are outside this scope. Reused rows retain their observation timestamp and are revalidated but are not silently refreshed.
- TypeScript still has the same six baseline missing export errors in the store/StreamingView. No new TypeScript errors were introduced; unrelated type definitions were not changed.
- Visual browser inspection could not run: computer-use permission review rejected Google Chrome with “Computer Use was not approved to use Google Chrome”. React render tests, responsive layout assertions, Vite build and Docker builds passed. Temporary preview files were removed and the local preview process stopped.
- The working tree remains uncommitted; preexisting out-of-scope edits remain present.

REAL PROVIDER CALLS: **0**.

EMBEDDING CALLS: **0**.

LIVE WAREHOUSE QUERIES: **0**.

LIVE WAREHOUSE MUTATIONS: **0**.

NO COMMIT PERFORMED.

NO PUSH PERFORMED.
