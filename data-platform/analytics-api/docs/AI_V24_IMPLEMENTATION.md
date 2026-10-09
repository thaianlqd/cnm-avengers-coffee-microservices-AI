# Data Platform AI V2.4 — single-shot, cost-first

Implemented 2026-10-06. Default production planning is one decision and at most one provider HTTP attempt. All evidence below is offline: scripted meaning, synthetic warehouse metadata/results, or mocked HTTP. It does not measure live language accuracy, warehouse truth, or real token usage.

## A. Starting branch, HEAD and working tree

Branch `branch_thaian`; HEAD `fa0795fc568380982e40c285bd818665c7a809db`. Data Platform had no starting diff. Existing user changes were confined to the chatbot AI service and were left untouched. Implementation scope is `data-platform/**` plus `docker-compose.data.yml`. Actual `.env` contents and credentials were not inspected or edited. No dependency or lockfile change was needed; a temporary virtualenv installed the existing requirements.

## B–C. Prior architecture and supplied live failure

V2.3 discovered concepts through multiple provider rounds, then registered analytical tools, repaired contracts, and finished a dashboard. Its transport adapter could retry 503, hop configured models on quota/404, or fall back to Groq. Contract defaults helped some redundant structures but did not prevent repeated context and schema transmission.

The user supplied a live trace with five successful provider responses, five semantic rounds, three analytical attempts, three rejections, two repairs and zero SQL. Aggregate operations included detail projections, followed by inconsistent time objects. Approximate input counts were 1.5k + 8.5k + 9.1k + 9.3k + 9.5k = 37.9k tokens. This is supplied evidence, not a live measurement performed during this implementation.

## D. Production architecture

```text
question + explicit UI scope + compact server state
    → cached semantic manifest
    → one submit_analyst_decision provider response
    → local normalization and mandatory preflight
    → independently validate/drop optional support
    → proposal (zero analytical SQL)
    → approval executes the stored plan (zero provider calls)
    → validated rows → features → dashboard → grounded summary (zero provider calls)
```

`AnalysisPipeline()` selects `OneShotPlanner`. No production path invokes the legacy loop after a failure. Legacy regression tests explicitly select `planning_mode="legacy"`; the old agent additionally requires `legacy_mode=True`, and old transport recovery requires `legacy_policy=True`. The production provider wrapper rejects a legacy transport.

## E–F. Semantic manifest design and measured size

The manifest is a compact columnar business index generated from the semantic registry and current physical metadata. Subjects expose IDs, labels, grain, metric IDs, default dimensions, safe detail fields and historical availability. Metrics expose IDs, labels, units, grain, compatible subjects/dimension sets, additivity, historical availability and opaque population-group numbers. Dimensions expose logical IDs/labels/types and value-grounding mode. Small authoritative enums, a bounded alias subset and checked directional business links are included.

Metric expressions/dependencies, dimension columns/expressions, privacy and join reachability are checked locally. SQL, physical table/column paths, expressions, DDL, full alias lists, narrative descriptions and chat history are absent from the request. Shared dimension sets avoid repeated lists. Population groups communicate compatibility without exposing SQL predicates. The compiler and validators remain execution authority.

An isolated LRU cache holds at most sixteen manifests keyed by the combined physical/semantic fingerprint and character allowance. Catalog label/definition/schema changes invalidate it. When a global index exceeds the allowance, optional enum/alias enrichment is removed first, then whole subject shards are deterministically pruned. JSON entries and selected references remain coherent; omitted subjects are counted, and `complete=false` is explicit. There is no question classifier or phrase-specific retrieval router. A concept outside the delivered shard requires clarification or a larger configured allowance; it is not automatically authorized.

Current complete fixture coverage: **16 subjects, 33 metrics, 26 dimensions**.

| Measured fixture | Manifest chars | Decision schema chars | Total provider-body context chars |
|---|---:|---:|---:|
| Focused simple ranking | 8,996 | 9,837 | 22,825 |
| Focused four-operation investigation | 8,996 | 9,837 | 22,825 |
| Focused six-operation complex plan | 8,996 | 9,837 | 22,825 |
| Deep sales/payments/inventory/customers | 8,996 | 9,837 | 22,821 |

The schema includes both operation arrays, structured clarification and optional visual choices. Total context measures the larger serialized Gemini native/OpenAI-compatible body, including wrappers, JSON escaping, system instructions, question, UI scope, manifest and state. The adapter checks the actual outgoing body again before HTTP. These are character measurements, **not token estimates**. Fixtures above use the same short qualification question; actual questions/refinement state change the total. No previous semantic/tool transcript is replayed.

## G–J. Decision contract, defaults, time and detail fields

One tool supports `plan`, `clarification`, and `unsupported`. A plan contains mandatory `requested_operations` and independently parsed optional `supporting_operations`; optional visuals and explicit removals support refinement. Role is owned by the containing operation array. Unsupported decisions use an allowlisted reason with a server-rendered message; metric ambiguity choices use compatible current catalog definitions. Provider prose/chain-of-thought is not accepted as a report or explanation.

Operations preserve omission until canonicalization. The server owns `filters=[]`, scalar `group_by=[]`, requested role, bounded limits, operation-specific ordering and missing time `relative/all_time`. A ranking object supplies an omitted ranking operation; one selected metric supplies an omitted ranking metric; direction defaults to DESC. No rule interprets a sentence or silently changes an explicit semantic choice. Supporting time/filters may inherit their explicitly referenced requested parent; explicit conflicts still fail.

Time is optional on the wire. Seven `anyOf` branches declare each kind's required fields using the same grammar as local validation. Relative requires `mode`; month/quarter/year require their calendar field; day requires month/day; range requires start/end; rolling requires amount/unit. Relative mode is an enum that excludes `custom`; a range uses ordered ISO start/end dates. Contradictory fields, impossible dates, incomplete shapes and explicit nulls fail without repair. Missing fields produce specific paths such as `time.mode`. Null padding for unused fields in stored canonical objects does not alter scope. Partial month/quarter semantics retain the existing deterministic recent-occurrence rule; explicit years remain exact.

Filter aliases resolve locally before applying the DB lookup allowance. Exact catalog-qualified labels (for example, "Thành phố Hồ Chí Minh") resolve to the same canonical value; conflicting normalized aliases cannot silently select a population. Selected numeric identifiers are searched as text but require an actual canonical column value. Repeated references reuse the turn's resolution. Unresolved requested values produce `needs_clarification` with safe catalog/lookup choices and a named filter, while optional unresolved values are omitted independently. Full structural validation remains required before semantic clarification; unknown values never remove the requested filter or trigger a second provider call. Refinements preserve the approved report and inherited time/Top N while clarification is pending.

The model uses `detail_fields`; generic `project` is absent from the schema and rejected at this boundary. Nonempty detail fields on another operation fail with `detail_fields_only_for_detail`. Only valid detail fields map to the existing internal `project`; replacement `changed_fields` maps accordingly. Internal strict contracts, grain, business populations, privacy, AST/SQL/result checks remain intact.

## K–M. Provider guard, repairs, escalation and fallback

Each planner owns a locked `ProviderBudget(max_calls=1)`. Scripted providers consume it before invocation; native providers consume the same object immediately before `requests.post`. Reentry is blocked before HTTP/mock invocation with `provider_call_budget_exceeded`. Native direct use also retains its default allowance until an explicit new-turn reset. HTTP 400/401/403/404/429/500/503, timeout, connection failure and malformed responses do not trigger a second production attempt. The first configured Gemini model is used; remaining configured model names do not authorize escalation. Existing Gemini API style/key configuration is preserved.

Automatic repair, escalation, fallback and post-result synthesis are disabled. Deployment settings fail closed if they request a larger allowance or enable any of those automatic calls:

```dotenv
DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN=1
DATA_ANALYST_ENABLE_CONTRACT_REPAIR=0
DATA_ANALYST_ENABLE_MODEL_ESCALATION=0
DATA_ANALYST_ENABLE_PROVIDER_FALLBACK=0
DATA_ANALYST_ENABLE_POST_RESULT_SYNTHESIS=0
DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS=10000
DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS=24000
AI_AGENT_SUPPORTING_OPERATIONS=3
DATA_ANALYST_DEEP_SUPPORTING_OPERATIONS=6
```

These defaults hold without an environment file. The enable flags validate the strict deployment policy; this release does not implement an opt-in extra synthesis call. Legacy repair/fallback environment settings cannot enable them on the production planner. Compose pins the five strict policy values in the analytics-api service. No API keys were copied into Compose.

## N–P. Mandatory/optional isolation, approval and report generation

Every requested operation is compiled and validated before analytical execution. A bad requested contract ends the turn with provider success, contract invalid and terminal `invalid_analysis_contract`; no SQL, repair or fallback follows. Optional contracts, scope conflicts, duplicate IDs and excess optional work are omitted independently with bounded value-free field/code diagnostics. A primitive or oversized optional array cannot invalidate the mandatory plan. Linked visuals for omitted support are omitted too.

Accepted work is bounded to eight operations, twelve analytical queries and eight charts. Deep mode defaults to at most six supports per parent; focused mode retains the prior three-support allowance. Requested work takes priority. Fingerprint, cohort, metric population and canonical time checks remain authoritative. The proposal can perform bounded parameterized read-only value grounding for a reference explicitly selected by the decision, but executes no analytical SQL. Canonical enum aliases require no warehouse lookup.

Approval executes the fingerprint/request-checked stored plan and calls no provider. Optional execution/result failures can be omitted while retaining verified requested results. Report construction, chart generation and narrative synthesis are deterministic; there is no call per chart.

## Q–T. Dashboard richness, families, reuse and insights

Qualification records show a narrow ranking with one chart, an investigation with **four charts from four queries**, and a composite plan with **seven charts from six queries**. The complex dashboard uses five families: horizontal bar, bar, line, donut and multi-line. A chart minimum is not imposed on scalar, table-only, empty or narrow requests.

Existing supported families remain: bar, horizontal bar, grouped bar, stacked bar, stacked 100%, line, area, multi-line, donut, heatmap, scatter and table. Requested views precede optional views. Different units use linked views; a Top N cohort cannot become whole-population composition. Line/area requires ordered historical data; composition requires a complete nonnegative additive population; scatter requires paired varying observations. Duplicate views are omitted, and unavailable visual proposals do not suppress valid defaults.

Result signatures include canonical scope and schema fingerprint. Reused rows are checked again, preserving observation timestamps. Additional charts over one stored result do not execute additional SQL. Deterministic insights retain ranking gaps, valid concentration/shares, comparison gaps, observed changes and paired relationships. Statements cite actual evidence and scope. Recommendations retain evidence preconditions and may be absent; causes, profit, depreciation, stock availability and forecasts are not invented.

## U. Session and refinement behavior

Sessions keep selected semantic references, canonical operations, result/evidence references, dashboard choices, fingerprint and revision. Refinement sends compact current queries and visual references, not prior messages, SQL, raw rows, or opaque provider continuation. A natural-language refinement has a fresh one-call allowance. Invalid requested refinement raises before report/session update; the prior report, operations and revision remain intact.

`visual_changes: [{chart_id, chart_type}]` uses authoritative server charts under the revision lock. It recompiles/revalidates cached results and changes only validated presentation choices: **zero provider and zero SQL calls**. The UI exposes bar/orientation and line/area choices. Other presentation families still require compatible shapes. A natural-language chart change may use one planning call; no phrase router is used to recognize it.

## V. Diagnostics and UX

Primary diagnostics include allowance/consumed calls/attempts/blocked calls, provider and contract status/error, input/output/cumulative planning tokens, manifest/schema/total-context chars, requested/supporting/omitted support counts, database queries, chart counts/types, reuse and latency. Missing provider token telemetry is `null`, never zero or a character-derived estimate. Approval counts are scoped to approval (zero calls); proposal diagnostics retain the original planning cost separately.

Legacy round/cost fields remain compatible diagnostics but are not the primary UI. Step 2 shows business meaning and mandatory/optional work with omitted-support notice. A contract failure has a specific heading and an explicit manual retry button. Rendering or failure handling does not retry automatically; in-flight refs block duplicate requests. Refinement failure preserves the displayed report. Step 3 keeps validated dashboards, units, cohort warnings, evidence and tables.

## W–X. Files and added tests

New production services: `analyst_decision.py`, `one_shot_planner.py`, `provider_budget.py`, `semantic_manifest_service.py`, and shared `analyst_clarification.py`.

Modified API/orchestration: `common.py`, `routers/ai.py`, `agent_pipeline.py`, `agent_provider.py`, `analysis_pipeline.py`, `analytical_tool_contract.py`, and legacy `data_analyst_agent.py`. Modified frontend: `AnalyticsView.tsx`, `AnalystDashboardSummary.tsx`, `AnalysisClarification.tsx`, `analysisPresentation.mjs`, and `analystDashboard.test.mjs`. Configuration: Data Platform `.env.example` and `docker-compose.data.yml`.

`test_one_shot_v24.py` adds 42 tests spanning the one-call lifecycle, transport guards and both Gemini wire formats, bad mandatory contracts, isolated optional failures/budgets, clarification/unsupported, strict time/detail fields, manifest caching/privacy/sharding/generalization, all available subjects and operator families, four/seven-chart reports, compact refinement, session preservation, structured visual changes and HTTP diagnostics. Five new frontend cases cover one-shot proposals, manual retry, presentation controls, compact refinement wire and safe failure headings. Existing V2.1/V2.2/V2.3 tests explicitly retain legacy mode where their historical loop behavior is under test.

Tools: new `one_shot_matrix.py`; `analysis_matrix.py` now scripts V2.4 decisions for all 86 fixtures; `agent_matrix.py` explicitly remains legacy. Artifacts: [V24 qualification](V24_QUALIFICATION.json), [86-case matrix](V24_ANALYSIS_MATRIX.json), this report and [manual matrix](MANUAL_EVALUATION_V24.md). Earlier implementation documents remain historical; V2.3 and the earlier manual-evaluation document link to the current workflow.

## Y–Z. Exact qualification and build results

| Check | Result |
|---|---|
| Baseline backend discovery | 316 passed; 36.071 s |
| Initial V2.4 backend discovery | 358 passed; 42.779 s |
| Initial V2.4 qualification tool | 42/42 passed; 6.743 s |
| V2.4 analytical fixture matrix | 86/86 passed |
| Python AST/syntax across scoped Python projects | 67 files passed |
| Frontend `test:ai-charts` | 8 passed |
| Frontend `test:ai-understanding` | 2 passed |
| Frontend `test:ai-agent` | 29 passed |
| `npm run build` | Passed, Vite 5.4.21, 62 modules; 1.30 s |
| `npm run typecheck` | Exit 2; six existing TS2305 errors, identical to baseline |
| Docker builds: analytics-api and web-ui only | Both passed; no service started |
| Scoped Git whitespace check with `cr-at-eol` | Passed; original CRLF respected |

Backend commands used `AI_OFFLINE=1 PYTHONDONTWRITEBYTECODE=1 /private/tmp/data-platform-v24-venv/bin/python`; network/database guards prohibit live access. The existing TypeScript errors concern missing `PipelinesData`, `RealtimeEvent`, `SystemUser`, `SystemRole`, `SystemLog` exports in `usePlatformStore.ts`, plus `RealtimeEvent` in `StreamingView.tsx`. Build artifacts: HTML 1.41 kB, CSS 44.44 kB, JS 362.30 kB; gzip 0.80/7.72/98.20 kB. React static rendering/layout checks passed. Follow-up qualification/runtime activation is recorded below; browser visual QA is not claimed.

## AA–AC. Provider count evidence

Simple ranking: one scripted planning invocation, zero proposal SQL, zero approval/report provider calls. Complex: one scripted planning invocation, six validated fixture queries, seven charts, zero approval/report provider calls. The attempted second-call test records one actual mock invocation and one blocked invocation; the second never reaches the provider. Native transport variants also verify one HTTP mock call across failure classes and block reentry.

## AD–AE. External calls and mutations

**Qualification real provider calls: 0. Embedding calls: 0. Live database queries: 0. Live DB mutations: 0.** Package installation and scoped image builds accessed dependency/build infrastructure only. Initial implementation did not start/restart services. The follow-up recreated only the existing web-ui service with `--no-deps --build`; API code is bind-mounted with its existing reload mode. No manual API/database/chatbot restart, vector seeding, commit or push was performed.

## AF–AG. Limitations and manual evaluation

Live semantic quality, actual provider acceptance/cost and warehouse business truth remain unmeasured. The measured full catalog/schema context is 22,821–22,825 characters in current qualification; real token telemetry must be checked live. Large catalogs may use an incomplete deterministic subject shard and require clarification/configuration adjustment. There is no automatic recovery from a bad requested decision or failed transport; only an explicit new user action can retry. Chart richness depends on the complete single decision, valid data and distinct useful questions. No post-result model synthesis feature is implemented. Existing repository-wide TypeScript errors remain.

The exact A–J live prompts and expected one-call/zero-call behaviors are in [MANUAL_EVALUATION_V24.md](MANUAL_EVALUATION_V24.md). They were not run during implementation.

## 2026-10-06 follow-up: live time/filter rejections

The user supplied two successful one-attempt Gemini responses: first `time/invalid_time_shape` (5,645 input tokens), then `filters.value/filter_value_unresolved` (6,651 input tokens). Neither payload contained original decision arguments, so the exact malformed time object and selected filter value are not proven. The second trace's schema/context measurements match the new per-kind time declaration. Confirmed code issues were incomplete time shapes allowed by the old wire schema and a DB allowance check placed ahead of local alias resolution. Catalog-qualified names, numeric references and requested semantic clarification now have explicit coverage.

Final follow-up checks: **374/374 backend tests** (45.843 s), **58/58 V2.4 qualification tests** (9.247 s), **86/86 analytical matrix cases**, **39/39 frontend tests**, Vite build passed, scoped whitespace check passed. All test provider/warehouse access was mocked; no live inference was performed. A flaky legacy assertion was narrowed to analytical content because timestamps/latency could coincidentally contain the fabricated number it was searching for. Current artifacts contain the regenerated fixture results.

Runtime: existing API imports expose seven time branches and the local/DB lookup split through its bind-mounted source. Only `web-ui` was rebuilt/recreated with `--no-deps`; Nginx serves `/assets/index-v2VeSa-S.js`. Both Data Platform containers were verified healthy. These checks establish deployment and offline behavior; a live provider's semantic accuracy still needs the user's manual evaluation.

## 2026-10-06 follow-up: default deep analysis across domains

New analytical requests default to `analysis_depth=deep`, with a focused UI/API option. One provider decision plans 5–7 distinct operations for approximately 5–6 useful views when the scope and data permit it. Deep mode permits six supports per parent within eight total operations/eight charts; explicit scalar/table-only intent stays narrow. The server does not invent extra queries when the model returns a thin decision. Every operation still comes from that single response and appears in the proposal for approval.

The default same-population contract remains strict. A support can explicitly select `population_relation=related`, with a context purpose, physically checked child-to-parent relationship, identical user filters and period, and matching metric clocks. This permits separate order-count and promotion-subset context without claiming equality with revenue's population. Same-fact snapshots are permitted only for all_time; historical filtering/trends remain forbidden for snapshot metrics. Evidence now records metric population predicates and non-null requirements; related context and snapshot limitations are visible in the report. No cross-population shares, causal promotion uplift or registered-customer/buyer substitution is introduced.

The catalog adds `purchasing_customer_count` on order facts: COUNT(DISTINCT customer identifier), using the same order-status/time scope as revenue. It is non-additive across months/stores, physically checked and excluded if its source column is missing/sensitive. No PII is projected. The catalog's checked `context_subjects` links support generic planning across data domains; no natural-language phrase router or domain-specific production report template was added.

New proposals omit refinement-only operation fields in the wire schema. Rich refinement state gets room by pruning the global metadata index locally within the same 24,000-character allowance; query scope/results are never truncated. Discovery authorizes only the delivered manifest and fingerprint-checked state. Replacement parent references are remapped structurally. Unchanged compatible support results survive and reuse cache; changed parent scope requires model-planned support changes, otherwise conflicting support is omitted.

Final checks: **387/387 backend tests** (52.586 s), **68/68 V2.4 tests** (15.335 s; also 68/68 in the API container), **86/86 analytical matrix cases**, **41/41 frontend tests**, Vite build passed. TypeScript still reports the same six pre-existing TS2305 errors. SQL-grounded offline fixtures demonstrate **six distinct charts each** for sales (six queries), payments (five), inventory (four) and customers (six), with one planning invocation, zero proposal SQL and zero provider calls on approval. Monthly synthetic rows now match calendar bucket labels, and fixed grouping predicates produce a single valid grain rather than duplicate rows. These fixtures prove orchestration/contracts, not live Gemini decisions or warehouse data availability.

Runtime activation rebuilt/recreated only the existing Data Platform web-ui; Nginx serves /assets/index-BzeKTaKN.js and API/web are healthy. API source is bind-mounted and reloads through its existing development watcher. No manual API/database/chatbot restart or live provider/warehouse test was performed. Existing reports do not automatically gain new queries; a new deep proposal must be reviewed and approved.

## AH. Git audit

HEAD and branch remain the starting values. All task changes are confined to the authorized Data Platform paths and Data Platform Compose file. Existing chatbot user changes remain outside this diff. Files are unstaged; no `.env`, package manifest or lockfile change was made. Final scoped working tree:

```text
 M data-platform/.env.example
 M data-platform/analytics-api/common.py
 M data-platform/analytics-api/docs/AI_V23_IMPLEMENTATION.md
 M data-platform/analytics-api/docs/MANUAL_EVALUATION.md
 M data-platform/analytics-api/metadata/semantic_catalog.json
 M data-platform/analytics-api/routers/ai.py
 M data-platform/analytics-api/services/agent_pipeline.py
 M data-platform/analytics-api/services/agent_provider.py
 M data-platform/analytics-api/services/analysis_contract.py
 M data-platform/analytics-api/services/analysis_pipeline.py
 M data-platform/analytics-api/services/analyst_contract.py
 M data-platform/analytics-api/services/analytical_query_service.py
 M data-platform/analytics-api/services/analytical_tool_contract.py
 M data-platform/analytics-api/services/data_analyst_agent.py
 M data-platform/analytics-api/services/explanation_service.py
 M data-platform/analytics-api/services/insight_service.py
 M data-platform/analytics-api/services/semantic_tools.py
 M data-platform/analytics-api/services/session_service.py
 M data-platform/analytics-api/services/value_grounding_service.py
 M data-platform/analytics-api/tests/test_agent_v22.py
 M data-platform/analytics-api/tests/test_agent_v23.py
 M data-platform/analytics-api/tests/test_analysis_contract.py
 M data-platform/analytics-api/tests/test_understanding_v21.py
 M data-platform/analytics-api/tools/agent_matrix.py
 M data-platform/analytics-api/tools/analysis_matrix.py
 M data-platform/web-ui/src/components/AnalysisClarification.tsx
 M data-platform/web-ui/src/components/AnalystDashboardSummary.tsx
 M data-platform/web-ui/src/utils/analysisPresentation.mjs
 M data-platform/web-ui/src/utils/analystDashboard.test.mjs
 M data-platform/web-ui/src/views/AnalyticsView.tsx
 M docker-compose.data.yml
?? data-platform/analytics-api/docs/AI_V24_IMPLEMENTATION.md
?? data-platform/analytics-api/docs/MANUAL_EVALUATION_V24.md
?? data-platform/analytics-api/docs/V24_ANALYSIS_MATRIX.json
?? data-platform/analytics-api/docs/V24_QUALIFICATION.json
?? data-platform/analytics-api/services/analyst_clarification.py
?? data-platform/analytics-api/services/analyst_decision.py
?? data-platform/analytics-api/services/one_shot_planner.py
?? data-platform/analytics-api/services/provider_budget.py
?? data-platform/analytics-api/services/semantic_manifest_service.py
?? data-platform/analytics-api/tests/test_one_shot_v24.py
?? data-platform/analytics-api/tools/one_shot_matrix.py
```

**NO COMMIT PERFORMED. NO PUSH PERFORMED.**
