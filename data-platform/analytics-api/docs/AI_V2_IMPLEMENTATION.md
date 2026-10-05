# Data Platform AI V2 — implementation and evaluation report

## A. Starting branch, HEAD, working tree

- Branch: `branch_thaian`.
- HEAD: `8f969f9aea748a13b45f1973e72eb5721a247d9d`.
- No initial changes in either Data Platform directory.
- Existing excluded changes: modified `avengers-coffee-system/services/ai-service/src/agents/tool_policy.py`, modified `avengers-coffee-system/services/ai-service/tests/test_named_cart_toppings.py`, and untracked `avengers-coffee-system/services/ai-service/docs/TOPPING_MULTI_EDIT_FIX.md`. Only names/status were recorded. Their contents were not inspected or changed.
- All implementation, tests, and artifacts are under `data-platform/analytics-api/` or `data-platform/web-ui/`. No ordering chatbot was inspected, modified, tested, or reverted.

## B. Architecture findings and implemented pipeline

Before implementation:

- `routers/ai.py`: proposal, keyword intent/time parsing, domain SQL templates,
  combined interpretation/SQL/chart planner prompt, shape-only `_valid_plan`,
  SQL execution/repair, independent chart queries, forced 5–6 charts, KPI alias
  guesses, synthesis, and phrase-based refinement.
- `semantic_service.py`: keyword entity scoring, numeric/location hints,
  semantic JSON loading, lexical examples, compact schema context.
- `metadata_service.py`: physical warehouse/source introspection, PII filtering,
  TTL caches, recovered foreign keys; missing Silver views triggered DDL.
- `vector_rag_service.py`: provider embeddings, vector tables/seeding and search;
  failed embeddings selected arbitrary catalog rows with similarity 1.0.
- `sql_service.py`: read-only/single-statement/SELECT-star/scope/PII checks,
  transaction read-only, statement timeout, and capped fetch. It did not enforce
  requested analytical meaning or inspect columns in every SQL clause.
- `llm_service.py`: provider fallback/retries and JSON decoding.
- `session_service.py`: bounded in-memory conversation and SQL/result snapshots;
  no logical spec, grounded plan, result contract, or schema fingerprint.
- `semantic_catalog.json`: descriptive Silver overlay, joins, metric SQL,
  examples, enumerations, and sample vocabulary.
- `AnalyticsView.tsx`: proposal/report/refinement requests, saved reports, generic
  KPI fallbacks, chart rendering; execution did not reuse an approved proposal.
- `Charts.tsx`: presentation components with inferred currency and labels.

The active HTTP routes now use this pipeline:

```text
request + current physical metadata + semantic registry
  → explicit hints + small candidate retrieval
  → AnalysisSpec (metadata grammar or one structured understanding stage)
  → GroundedAnalysisSpec + authoritative calendar bounds
  → deterministic QueryPlans
  → independent plan/spec validation
  → PostgreSQL compilation + SQL AST/semantic/security validation
  → read-only execution
  → result contracts
  → row-backed VisualizationSpecs + grounded evidence
  → evidence selection + report + structured server session
refinement → constrained SpecPatch → same validation pipeline
```

Proposal validates the grounded plans and SQL without querying business data. Generation reuses the exact approved interpretation and frozen time bounds when the request signature and schema fingerprint match. There is no separate chart SQL planner. Legacy endpoint names and compatible response fields remain available.

## C. Root causes and corrections

| Failure | Previous cause | Correction |
| --- | --- | --- |
| Top 5 becomes Top 10 | Numeric hints were advisory; planner validation checked object shape; fallback/chart templates supplied their own limits | Required ranking Top N; explicit hint/spec agreement; plan reconstructed from grounded spec; SQL AST requires exact ranking limit/order; result row/rank checks |
| Deep question semantic drift | Interpretation, SQL, charts, and narrative were combined with template fallbacks; no authoritative structured meaning | Strict logical spec, explicit components/groups, small metadata candidates, metric/grain/join grounding, clarification on ambiguity |
| Chart scope drift | Charts ran independent queries and were padded to five or six | Charts select canonical result rows by query ID, scope reference, and explicit group row selector; no extra SQL |
| Refinement scope loss | A short feedback message rebuilt filters/time from scratch and trusted client report state | Server spec plus explicit patch paths; preserve unmodified fields, locks/revision checks, fresh fingerprint validation |
| Weak RAG fallback | Embedding failure returned arbitrary catalog entries with similarity 1.0; stale vectors and request-time seeding | Honest vector-unavailable status; lexical/business/column/relationship fallback; current physical column compatibility; no automatic vector writes |
| Phrase/template overfitting | Universal resolvers and keyword routes encoded populations, periods, units, and chart defaults | Logical operator pipeline; aliases, narrow grammar, metric definitions, and business rules in semantic metadata |

## D. Changed files

- `data-platform/analytics-api/common.py`
- `data-platform/analytics-api/docs/AI_V2_IMPLEMENTATION.md`
- `data-platform/analytics-api/docs/MANUAL_EVALUATION.md`
- `data-platform/analytics-api/docs/MANUAL_MATRIX_OFFLINE.json`
- `data-platform/analytics-api/metadata/semantic_catalog.json`
- `data-platform/analytics-api/requirements.txt`
- `data-platform/analytics-api/routers/ai.py`
- `data-platform/analytics-api/services/analysis_catalog.py`
- `data-platform/analytics-api/services/analysis_contract.py`
- `data-platform/analytics-api/services/analysis_pipeline.py`
- `data-platform/analytics-api/services/analysis_presentation.py`
- `data-platform/analytics-api/services/analysis_query.py`
- `data-platform/analytics-api/services/analysis_understanding.py`
- `data-platform/analytics-api/services/legacy_analysis_compat.py`
- `data-platform/analytics-api/services/llm_service.py`
- `data-platform/analytics-api/services/metadata_service.py`
- `data-platform/analytics-api/services/semantic_service.py`
- `data-platform/analytics-api/services/session_service.py`
- `data-platform/analytics-api/services/sql_service.py`
- `data-platform/analytics-api/services/vector_rag_service.py`
- `data-platform/analytics-api/services/verified_analysis_service.py`
- `data-platform/analytics-api/tests/analysis_fixtures.py`
- `data-platform/analytics-api/tests/fixtures/manual_analysis_cases.json`
- `data-platform/analytics-api/tests/test_ai_services.py`
- `data-platform/analytics-api/tests/test_analysis_contract.py`
- `data-platform/analytics-api/tools/analysis_matrix.py`
- `data-platform/web-ui/src/components/AnalysisMeaning.tsx`
- `data-platform/web-ui/src/components/Charts.tsx`
- `data-platform/web-ui/src/utils/aiChartConfig.d.ts`
- `data-platform/web-ui/src/utils/aiChartConfig.mjs`
- `data-platform/web-ui/src/utils/aiChartConfig.test.mjs`
- `data-platform/web-ui/src/views/AnalyticsView.tsx`

The new services separate contracts, catalog grounding, understanding/patching, query planning/validation, presentation, orchestration, and verified examples. `legacy_analysis_compat.py` contains deprecated helpers needed by existing compatibility tests; V2 HTTP routes never use their planners or phrase resolvers.

## E. AnalysisSpec

The models live in `services/analysis_contract.py`. Unknown fields are forbidden. Public meaning uses logical IDs rather than SQL/table names.

- `version=2`, `analysis_kind`, `subject`.
- `metrics`, `dimensions`, typed `filters` (dimension/operator/scalar or IN-list value).
- `time_range` (relative calendar mode, custom inclusive dates, timezone), `granularity`.
- `ranking` (metric, ASC/DESC, Top N 1–100, optional per-group dimensions).
- `comparison_groups` (name, filters, independent Top N).
- `components` (id, kind, metrics, dimensions, ranking/detail columns).
- Requested table/chart/report outputs, visualization preferences, detail level/columns.
- Assumptions, ambiguities, confidence, and at most two compatible verified-example IDs.

Example:

```json
{
  "version": 2,
  "analysis_kind": "ranking",
  "subject": "products",
  "metrics": ["quantity_sold"],
  "dimensions": ["product_name"],
  "time_range": {"mode": "current_month", "timezone": "Asia/Ho_Chi_Minh"},
  "ranking": {"metric": "quantity_sold", "direction": "DESC", "top_n": 5}
}
```

A narrow metadata-defined grammar handles fully understood simple ranking requests without an understanding provider call. Complex requests require a structured interpretation; missing/conflicting intent yields clarification rather than guessed SQL.

## F. GroundedAnalysisSpec

Contains the validated `analysis_spec`, structural `schema_fingerprint`, actual metric/dimension/subject definitions, validated relationships, resolved `period`, and retrieval provenance. Metric entries carry expression, source/grain, unit, business filters, additive behavior, and compatible dimensions. Physical column types, enum values, keys, sensitivity, and relationships take precedence over descriptive suggestions.

## G. QueryPlan

Explicit fields: id/kind/subject/source, metrics/dimensions/filters, metric expressions, grouping/output columns, ordering/CTEs, scope reference, joins, time column/period/granularity, ranking, row limit, comparison-group identity, and schema fingerprint. Separate facts require separate components. Entity detail uses its declared entity detail source rather than a transaction table. Product/store identity keys prevent identical display names from collapsing.

## H. VisualizationSpec

Fields: id, canonical query ID, scope reference, chart type/title, metric/unit, X/Y/series fields, sort, cardinality, row selector, and composition flag. Group-specific charts use subsets of the same validated result. The renderer does not generate SQL.

## I. Semantic validation

- Strict schema, duplicate detection, logical IDs, bounded filters and ranking, required composite components.
- Explicit Top N/time/filter hints must agree with interpretation; filter literals must originate in the request or declared enum aliases.
- Relative time resolves using the request reference date and timezone; weeks start Monday; quarter/year transitions and inclusive custom-date boundaries are explicit.
- Low-confidence/ambiguous meaning requires clarification with catalog labels/units. Generic “best” without a measure cannot silently become revenue.
- Source columns must exist in current physical metadata and be safe; enum values are authoritative.
- Aggregations and dimensions must match metric grain and source; only validated many-to-one paths are allowed. Composite foreign keys must be joined in full. Ambiguous equally authoritative joins require clarification.
- Business predicates are mandatory. Contradictory filters fail rather than broaden scope.
- Rebuild expected QueryPlans from the grounded spec and compare all fields, including time, grouping, ordering, joins, output projection, rank, and fingerprint.

## J. SQL semantic and security validation

SQL is compiled deterministically from grounded plans. SQLGlot parses PostgreSQL ASTs and compares the proposed SQL with a freshly compiled expected AST. Differences in LIMIT, predicates/OR, time, aggregates, grouping, ordering, joins, windows, or output columns are rejected before execution. This intentionally also rejects equivalent rewrites that cannot be proven identical by this validator.

The existing single-statement/read-only, allowed Silver scope, no SELECT-star, PII, transaction read-only, timeout, and capped-fetch safeguards remain. A second AST security check binds all references across SELECT, WHERE, GROUP BY, HAVING, ORDER BY, joins, and CTE scopes; functions use a restricted allowlist. Sensitive columns cannot be hidden inside predicates or functions. At most one repair stage is allowed after execution failure, with all validators applied again before another execution. Raw database error text/rows are not sent for repair.

`sqlglot==26.33.0` is pinned to make AST behavior reproducible. Parsing alone is not a semantic/security guarantee; the application performs those checks explicitly. See the [official SQLGlot project](https://github.com/tobymao/sqlglot).

## K. Result contracts

Require exact output columns, bounded row counts, finite numeric metrics, valid null handling, permitted nonnegative measures, ordering, per-group ranking, aggregate-grain uniqueness, projected time/filter consistency, and detail-date bounds. Nonranking/grouped queries fetch an overflow sentinel and reject incomplete cohorts instead of publishing a silently truncated analysis. Empty results remain empty. No invalid result reaches charts or synthesis. Zero is an observation; null or missing values are not manufactured as zero.

## L. Catalog, RAG, and verified feedback

- Structural fingerprint includes physical columns/types/nullability/sensitivity/enums, primary/unique/foreign keys and semantic overlay; row counts and refresh timestamps do not invalidate meaning. Fresh metadata failure cannot reuse a stale cached catalog for V2.
- Table context exposes safe columns, physical grain/key hints, inferred roles/aggregation permissions, business names/aliases and source relations. It does not expose actual sensitive samples.
- JSON registry contains logical subjects/metrics/dimensions, units, time roles, authoritative expressions/business filters, entity-detail sources, city/enum aliases, ambiguity terms, and generic time/ranking grammar. New supported business meaning can be added through metadata without a new phrase route; a synthetic new-domain test verifies that path.
- Request-time metadata self-healing DDL and vector creation/truncation/seeding were removed from these services.
- Optional vectors are disabled by default (`AI_VECTOR_RETRIEVAL`). Existing vectors are accepted only when physical columns match the current table. Failed/unavailable embeddings yield truthful lexical/business/column/relationship fallback, never invented similarity.
- Positive feedback creates an example only from an approved server session with passed result contracts and current fingerprint. Client SQL is ignored. Store compact sanitized logical structure, not raw prompts/rows/SQL/PII. Retrieval is small and fingerprint-compatible, scored against current subject/metric/dimension aliases. Selected IDs must match the interpreted analysis kind; current catalog grounding independently validates fields, sources and grain. Negative feedback removes the trusted example.
- Gemini uses a supported JSON-schema subset plus full server validation; Groq receives the schema explicitly. See [Gemini GenerationConfig](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig).

## M. SpecPatch and sessions

`SpecPatch` contains bounded `{path, value}` operations and ambiguities. Only explicitly supported paths can change, overlaps fail, and the complete merged spec is revalidated. Paths not patched retain previous filters/time/metrics/groups. Explicit hint checks prevent unexplained changes. Removing a filter requires an explicit removal request referencing that dimension. Adding a comparison city can preserve the old city as the first comparison group. Chart-only changes reuse saved validated canonical rows with zero data queries.

Server sessions contain logical/grounded specs, fingerprint, used relation graph, plans, result contracts/results, diagnostics, report, proposal signature, revision and lock. Expired sessions are cleaned before TTL refresh. Client SQL or tampered report rows cannot replace server state. Changed schemas require reinterpretation. Storage remains bounded and process-local (500 sessions, two-hour TTL).

## N. Chart selection before and after

| Before | After |
| --- | --- |
| Force five or six independent charts | Zero to four compatible charts; no required minimum |
| Independent chart SQL and generic domain defaults | Canonical validated rows and scope/group selectors |
| Infer currency from number size or field guesses | Catalog units, including count/quantity/rating/currency |
| Ranking rendered as misleading part-to-whole donut | Bar/horizontal bar for ranking |
| Any small aggregate could become a donut | Only true positive composition over additive metrics; not AVG/AOV/rating |
| Missing series/cells filled as zero | Gaps and missing markers retained |
| Generic heatmap axes and fallback grid | Actual validated axes; no invented grid |

Time trends choose line/area or bounded multi-series line (at most eight series). Heatmaps require two valid dimensions and bounded categories (30). Large/detailed/unsupported chart shapes retain the table. Negative/null metric shapes avoid renderers that cannot faithfully display them. UI displays the approved interpretation, all additional component/group tables, grounded metric labels/units, and honest empty/error states. V2 reports no longer use fabricated KPI or narrative fallbacks.

## O. Hardcoded branches retired

Seven old orchestration/planner/resolver functions were retired from the active router: `_planner_prompt`, `_get_domain_candidate_charts`, `_ensure_5_to_6_charts`, old `_sanitize_and_resolve_kpi_cards`, `_resolve_universal_entity_list`, `_resolve_universal_charts`, and old `refine_report`.

They contained **240 Python `if` nodes**, including **48 request-text-dependent conditions**: 36 in the entity resolver, 10 in chart resolution, and two in refinement. The latter count uses AST conditions with a string literal plus a prompt/feedback variable; it is a reproducible conservative measure, not a claim that every removed conditional was a phrase branch. The new active route does not use those resolvers. Compatibility helpers and older semantic utilities remain isolated for existing tests; this is not a claim that every legacy keyword utility was deleted. No new business phrase router was introduced; metadata grammar/aliases remain explicit and bounded.

## P. Provider calls made

**Real Gemini calls: 0. Real Groq calls: 0. Real embedding calls: 0. Live warehouse executions: 0.**

Tests/matrix use fake providers, synthetic metadata/rows, and network/DB denial. Fake logical stages are logged separately and are not billed provider calls. Offline token usage is null rather than invented. Dependency downloads/documentation retrieval were not AI provider calls.

In production, each logical stage attempts at most one configured primary and one fallback provider, with no retry loop. Normal complex analysis uses one understanding stage and one optional evidence-selection synthesis stage; an approved proposal avoids a second understanding stage. Planning/grounding/chart selection use no model. Repair is bounded to one stage. Diagnostics report actual provider attempts, models, latency/tokens when returned, embedding status, query counts, validation categories, fingerprint, and chart provenance. No hidden reasoning or credentials are logged.

## Q. Tests added

55 new offline contract tests in `tests/test_analysis_contract.py`, plus two unit-formatting tests in `aiChartConfig.test.mjs`. Existing metadata tests now use a synthetic schema rather than a live database. Existing KPI-placeholder expectations now require honest null values.

Coverage includes schema/calendar/hints/ambiguity; simple and complex interpretation; independent Top N groups and ranking-plus-trend components; physical metadata drift/enums/sensitivity/composite FKs; altered SQL limit/filter/time/order/join/window/aggregate; all-clause PII; result shape/count/order/grain/NaN/negative/null; chart scope/type/unit/composition/missing values; exact proposal reuse; bounded mocked fallback/repair; server-trusted patches/feedback; chart-only reuse; stale revisions; new metadata-only domain; empty/unsupported cases and query overflow rejection.

## R. Validation run and results

| Check | Result |
| --- | --- |
| `python -m unittest discover -s tests -q` | 92 passed, no skips |
| `python tools/analysis_matrix.py` | 39/39 passed offline |
| `npm run test:ai-charts` | 8 passed |
| `npm run build` | Passed (Vite production build) |
| Python syntax compilation | Passed using a writable temporary pycache prefix |
| Scoped whitespace diff check | Passed, preserving existing CRLF files |
| `tsc --noEmit` | Six pre-existing missing-export errors, identical on archived starting HEAD |
| Secret-pattern scan of all scoped additions | Zero credential/private-key pattern matches |

The six baseline TS2305 errors are `PipelinesData`, `RealtimeEvent`, `SystemUser`, `SystemRole`, and `SystemLog` imports in `usePlatformStore.ts`, plus `RealtimeEvent` in `StreamingView.tsx`. Those files were not modified. No new TypeScript diagnostics occur in modified files. Whole-project type checking is therefore not green, despite the production build passing.

Commands were run with `/private/tmp/data-platform-ai-v2-venv/bin/python` (Python 3.9). Compile command used `PYTHONPYCACHEPREFIX=/private/tmp/data-platform-ai-v2-pycache` after the default macOS cache location was blocked by the sandbox. CRLF-aware check: `git -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --check -- data-platform/analytics-api data-platform/web-ui`.

## S. Remaining known limitations

- Offline scripted interpretations do not prove real-provider understanding, real-schema completeness, warehouse numerical accuracy, or live latency/token cost. These need the separate manual live evaluation.
- Conservative whitelist/operators and many-to-one joins can reject valid advanced analyses; equivalent SQL rewrites are deliberately rejected. New business measures require declared authoritative semantics. Separate fact grains need separate components.
- Entity-detail questions needing historical transaction cohorts/city semijoins can require unsupported semantics; the system clarifies instead of substituting transaction rows for entity detail.
- Complete-query safety cap is 100 rows; overflow rejects the report rather than silently presenting a partial population. Chart caps can leave some valid components as tables.
- Sessions and verified examples are process-local, not durable or shared across replicas. Multi-instance production needs a durable state store.
- Curated relationships for warehouse views still rely on declared business keys being valid in real warehouse data; no live uniqueness/cardinality audit was performed.
- Narrative selects validated evidence only. It does not generate unsupported causal claims or open-ended strategic recommendations. Current signed-value chart support is conservative.
- Vector retrieval needs an existing compatible index and provider configuration; no automatic migration/seeding occurs. Lexical fallback remains available.
- Six unrelated baseline TypeScript errors remain as described above.

## T. Manual natural-language evaluation

See [MANUAL_EVALUATION.md](MANUAL_EVALUATION.md) for all 39 prompts, expected outcomes, follow-ups, and commands. [MANUAL_MATRIX_OFFLINE.json](MANUAL_MATRIX_OFFLINE.json) records specs, grounding, plans/SQL, validation, row counts, chart contracts, final evidence, mock stages, zero real call counts, and fixture timings.

The matrix includes Vietnamese, English, mixed wording, Telex/typos, different domains/metrics, group-specific Top N, per-group rankings, detail, weekly comparison components, time scopes, chart preferences, refinement, ambiguity, privacy rejection, empty results, and adversarial overflow. Live mode exists only for later explicit user-authorized evaluation and was not run in this task.

## U. Final git state

Branch and HEAD remain the starting values. There are 16 tracked Data Platform modifications and 16 untracked Data Platform files, all listed in D. The three pre-existing excluded ordering-service status entries remain present. No excluded file was touched. Dependencies/build output are ignored; no generated dependency tree is included. Changes remain uncommitted for review.

## V. Git actions

**NO COMMIT PERFORMED.**

**NO PUSH PERFORMED.**
