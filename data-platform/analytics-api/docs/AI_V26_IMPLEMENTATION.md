# Data Platform AI V2.6 implementation report

Date: 2026-10-06. Qualification is offline. HTTP and real PostgreSQL connections
are globally forbidden in the qualification runner. Scripted provider decisions,
synthetic metadata and fixture rows establish contracts, not live language accuracy.

## A. Starting branch / HEAD / status

Branch `branch_thaian`; HEAD `b66982a550b42c31b3c47bf2025356fe3100688f`.
Data Platform and compose diffs were empty at the start. Three chatbot files were
already modified: product_option_scope.py, shopping_language.py, tool_policy.py.
Other chatbot edits appeared during work. Those are concurrent user work: no task
write touched the chatbot, review seed backups or attachments. No Git mutation.
Baseline: 428 backend tests passed in 71.208 seconds.

## B. V2.5.1 behavior discovered

Five conceptual UI inputs configured question/domain/time/scope/depth. Production
already used one decision, local filter normalization, atomic requested preflight,
optional support omission, validated dashboard/evidence and approved sessions.
Missing model grouping reached the strict canonical boundary before lens defaults
existed. Report persistence used existing PostgreSQL; server had no account-auth
context. Existing public saved reports are preserved for compatibility.

## C. New four-field design

Required question, Auto/preset/custom time, optional analysis_context textarea and
optional analysis_expectation textarea. The secondary module panel is separate.
The model selects domains, lenses, metrics, comparisons and analysis_breadth.
Structured time/scope overrides are hard constraints. No question regex chooses
breadth, metrics, groups or business routing.

## D. Optional fields

Time defaults Auto; context, expectation and module selection can be absent. Empty
optional text is omitted from the provider body. Question-only input is tested.

## E. Compatibility

Accept question/prompt and time/time_range aliases; reject contradictory aliases.
Legacy domain, scope, depth, branch and date_range continue through the old path.
Legacy reports remain viewable. Canonical session contract version remains 2.5;
new module approved-plan version and deployment diagnostics are 2.6.

## F. Blueprint schema

Strict AnalyticalBlueprint declares subject; default/allowed operations;
required/default/allowed metric references; required/default/allowed groups;
cross-tab grouping references; historical/granularity capabilities; metadata
ranking direction/Top N; complete-population requirements; metric-defined
population semantics; related domains and caveats. References are validated
against the current registry and physical availability.

## G. Materializer

Normalize local filter shape, resolve one delivered and physically available lens,
fill only unambiguous metadata defaults, then enter the existing strict query /
SQL / result validators. Explicit structures are preserved and validated. A
ranking object can select a permitted ranking operation; missing ranking metric
still follows the existing unambiguous single-metric canonicalizer. Ambiguous
store performance asks for real metric labels instead of guessing.

## H. Generic grouping fix

Required/default groups are populated before DecisionOperation/canonical query
validation for every selected lens. Product ranking/revenue, category mix and
trend all validate without model-authored grouping boilerplate. A synthetic new
lens with required category grouping proves the path does not depend on a fixed
business phrase or hardcoded product ID. Model-specified contradictions reject.

## I. Metadata

All 38 lenses in all 16 existing domains have typed blueprints. Existing aliases,
metric semantics, caveats, health rules and relationships remain available. New
natural context carries compact global lens identity/labels and detailed/default
blueprints for candidate packs. Optional global lens rows are deduplicated against
packs on the actual wire. Lens defaults are authorized narrowly after a delivered,
validated lens is chosen; explicit model IDs still require delivered references.

## J. One-shot guarantees

Natural planning/refinement: at most one provider attempt/call. Zero automatic
repair, fallback, escalation, embeddings and post-result generation. Proposals
execute zero analytical SQL. Approval executes stored validated canonical work
with zero more AI calls. Structured module rerun and visual changes use zero AI.
Optional support failure never silently removes requested work.

## K. Context measurements

Both actual Gemini body builders are serialized with wrappers and escaping. Hard
allowance is 24,000 characters and cannot be raised by the context environment
setting. Natural packing targets 23,000 for working headroom, preserving mandatory
knowledge even when the soft target cannot be reached. Blank optional text is
omitted; state contains canonical queries without full reports or conversation.
Actual token counts are null because scripted providers do not report them.

| Case | Native chars | Compat chars | Hard headroom | Charts |
|---|---:|---:|---:|---:|
| A | 22925 | 22874 | 1075 | 1 |
| B | 22261 | 22210 | 1739 | 3 |
| C | 22809 | 22758 | 1191 | 4 |
| D | 22605 | 22554 | 1395 | 5 |
| E | 22710 | 22659 | 1290 | 7 |
| I | 22474 | 22423 | 1526 | proposal |
| J | 22954 | 22903 | 1046 | 7 |

Natural wire decision schema: 5,504 characters (V2.5.1: 6,139). Focused V2.5
qualification body was 21,420; new question-only A is 22,925 (7.0% higher), including
the global reusable lens directory. No 48k limit or full raw catalog is used.

## L. Actionable issue model

Safe category/title/what_is_known/what_is_missing/suggested_actions are returned
alongside compatibility status/message/clarification. Categories distinguish
clarification, unsupported, insufficient data, scope/time/metric/history issues,
large scope, plan failure and system availability. Real catalog choices use
business labels. Raw provider prose, Pydantic traces and SQL never enter the card.
Selected period survives error presentation; old diagnostics categories remain
compatible while business_category preserves the actual scope/time failure.
Snapshot reduction requires an explicit button and another reviewable question.

## M. Visual-result policy

New natural approved reports require data for every requested component. Every
non-detail plottable requested result has a meaningful chart, otherwise an
insufficient-data issue prevents table-only success. Pure scalars produce KPI
cards, not filler charts. Detail compatibility allows tables. ID-only aggregate
axes are valid where result checks permit them. First eligible requested views
receive budget before additional multi-metric views; semantic duplicates reject.

## N. Dashboard breadth/story

AI chooses focused/deep/comprehensive, with 1–3 / 4–6 / 6–8 targets, not quotas.
Existing metadata domain/lens/story grouping and requested priority remain.
Offline C/D/J have 4/5/7 charts; B has 3 charts plus scalar evidence and reports
limited coverage transparently. No cosmetic bar/donut variants pad the count.
Top N, unit, cohort, non-additive, complete-population and snapshot rules remain.

## O. Analysis Module model

Reuse PostgreSQL analytics schema, with owner-keyed module rows, name/description,
original input metadata, breadth, domains/lenses, canonical templates with roles,
fixed/parameterizable safe scope, dynamic/fixed time strategy, dashboard preferences,
approved-plan version/fingerprint, timestamps, last report and bounded run refs.
Module definition stores no SQL, result rows, provider transcript or secrets.
Only a current approved owned server session can be saved. Historical previews
are linked to the existing transient server reports, not reused for reruns.

## P. APIs

GET/POST /api/ai/modules; GET/PATCH/DELETE /api/ai/modules/{id};
POST /api/ai/modules/{id}/rerun; GET /api/ai/modules/{id}/runs/{report_id}.
Search is bounded owner-filtered name/domain text search. DELETE archives.
Explicit ID or exact analysis_module_name resolves locally; ambiguous names
return owned choices. No arbitrary client SQL/canonical plan is accepted.

## Q. Rerun

Load owned template; check version/fingerprint; refresh catalog reference clock;
apply permitted structured time/scope; validate/recompile all requested plans
before read-only execution. Optional supporting failure is disclosed. Every run
gets new result timestamps/report provenance and appends a bounded run reference.
No previous results or SQL are executable truth.

## R. Zero-AI cases

Unchanged templates, changed structured period, dynamic relative period rollover,
and permitted existing safe city parameter changes are deterministic. Fixed scope
changes reject before AI/SQL. Old rows are neither injected nor reused.

## S. Natural module refinement

Explicit selected module seeds freshly prepared canonical artifacts with null
results; one new model decision sees compact state plus new four-section input.
Unreplaced requested work survives. Approval adds zero calls. There is no full
history, full report, or automatic injection of unrelated saved modules.

## T. Version/fingerprint

Fingerprint includes physical metadata and the semantic overlay. Any module
version/fingerprint mismatch returns needs_review before provider or analytical
SQL. Update clears the old reference, prefills original inputs for a new proposal
and approval, and saves a new variant. No silent migration of analytical meaning.

## U. Module UI

Secondary search/recent list; use chip/removal without clearing question; rerun
using current time; rename; archive; save as new after approved success; previous
run preview with provenance/date; stale update with input prefill. Async mutation
locks prevent duplicate save/rerun clicks. No module is a required main input.

## V. Security

Each repository read/write has owner predicates and parameterized SQL. No arbitrary
user-id headers. Opaque 256-bit HttpOnly SameSite browser cookie is hashed for
ownership; Secure under HTTPS. Origin checks protect owned reads/mutations. Nginx
and Vite preserve the browser Host including port; exact allowed origins can be
configured for TLS/proxy deployments. Existing account auth is absent: this is
browser-profile isolation, not account SSO. Clearing cookies loses that profile's
access. Do not interpret it as role-based authorization.

Persistent scopes accept only catalog low-cardinality aggregate values. Detail
plans and raw personal/entity filters are rejected; recognized email/phone/address
literals in module text are blocked. Free-text PII classification is conservative,
not exhaustive. SQL compilation/security/result validation always rerun. Modules
never bypass the provider policy or current schema checks.

## W. Files changed

- `data-platform/analytics-api/common.py`
- `data-platform/analytics-api/docs/AI_V26_IMPLEMENTATION.md`
- `data-platform/analytics-api/docs/MANUAL_EVALUATION_V26.md`
- `data-platform/analytics-api/docs/V26_QUALIFICATION.json`
- `data-platform/analytics-api/metadata/semantic_catalog.json`
- `data-platform/analytics-api/migrations/026_analysis_modules.sql`
- `data-platform/analytics-api/routers/ai.py`
- `data-platform/analytics-api/routers/analysis_modules.py`
- `data-platform/analytics-api/server.py`
- `data-platform/analytics-api/services/agent_pipeline.py`
- `data-platform/analytics-api/services/analysis_issue_service.py`
- `data-platform/analytics-api/services/analysis_module_repository.py`
- `data-platform/analytics-api/services/analysis_module_service.py`
- `data-platform/analytics-api/services/analysis_pipeline.py`
- `data-platform/analytics-api/services/analyst_decision.py`
- `data-platform/analytics-api/services/analytical_blueprint_service.py`
- `data-platform/analytics-api/services/browser_owner.py`
- `data-platform/analytics-api/services/dashboard_planner_service.py`
- `data-platform/analytics-api/services/domain_intelligence_service.py`
- `data-platform/analytics-api/services/one_shot_context.py`
- `data-platform/analytics-api/services/one_shot_planner.py`
- `data-platform/analytics-api/services/session_service.py`
- `data-platform/analytics-api/tests/test_natural_v26.py`
- `data-platform/analytics-api/tools/natural_matrix_v26.py`
- `data-platform/analytics-api/tools/qualify_v26.py`
- `data-platform/web-ui/nginx.conf`
- `data-platform/web-ui/src/components/AnalysisClarification.tsx`
- `data-platform/web-ui/src/components/AnalysisInputForm.tsx`
- `data-platform/web-ui/src/components/AnalysisMeaning.tsx`
- `data-platform/web-ui/src/components/AnalysisModules.tsx`
- `data-platform/web-ui/src/utils/analysisInput.d.ts`
- `data-platform/web-ui/src/utils/analysisInput.mjs`
- `data-platform/web-ui/src/utils/analysisInput.test.mjs`
- `data-platform/web-ui/src/utils/analystDashboard.test.mjs`
- `data-platform/web-ui/src/views/AnalyticsView.tsx`
- `data-platform/web-ui/vite.config.ts`
- `docker-compose.data.yml`

## X. Tests added

24 backend methods cover four-input boundaries, breadth choice, blueprint defaults,
all 38 lenses, a synthetic lens, time conflicts, history/snapshot choices, empty /
scalar visuals, fresh rerun, scope parameters, relative rollover, owner isolation,
previous run ownership, stale versions/fingerprints, privacy, exact/ambiguous names,
HTTP schemas, repository owner SQL, cookie/Origin policy and both adapter budgets.
Frontend render/payload tests cover four fields, optional text, time presets,
compatibility serialization, module save/chip/provenance and actionable cards.
The A–J matrix validates orchestration with synthetic rows.

## Y. Exact backend results

`tools/qualify_v26.py`: 452 passed, 0 failures/errors, 97.215 seconds.
Global HTTP and PostgreSQL guards active. Baseline 428 + 24 new tests.

## Z. Exact frontend results

`node --test src/utils/*.test.mjs`: 55 passed, 0 failed, 456.226375 ms.

## AA. TypeScript/build

`npm run typecheck`: passed. `npm run build`: passed, Vite 5.4.21, 65 transformed
modules, 1.39 seconds. Python AST parsed 77 files. `git diff --check`: passed.

## AB. Docker

`docker compose -f docker-compose.data.yml build analytics-api web-ui`: both
images built successfully. No service started/restarted and no chatbot image built.

## AC. Real provider calls

0. All model outputs during qualification were scripted/mocked.

## AD. External embedding calls

0. Local metadata/text lookup only.

## AE. Live DB mutations

0; live analytical queries also 0. Migration written, three DDL statements parsed in PostgreSQL grammar, repository locally mocked,
not applied. Module tests use an in-memory test repository; production uses Postgres.

## AF. Manual live matrix

See MANUAL_EVALUATION_V26.md, cases A–J. Ten offline scenarios passed in
V26_QUALIFICATION.json. No live provider/database language retest was performed.

## AG. Remaining limitations / deployment

Apply migrations/026_analysis_modules.sql through normal deployment before using
persistent modules. Existing server reports are transient (two-hour TTL / bounded
cache); module definitions and run references persist, but an expired preview
requires a fresh rerun. No cross-run number comparison is manufactured. Exact-name
reference is supported through analysis_module_name / explicit module UI selection;
plain business questions do not silently retrieve similarly named old modules.
Browser identity is not account auth. Only existing catalog safe aggregate scope
parameters are supported. Provider language accuracy and real tokens require the
manual live matrix. Some requests may legitimately need clarification or exceed
the hard context limit; no fallback call or automatic requested-scope reduction.

## AH. Git status

Final status recorded below; external chatbot changes are concurrent user edits.

```text
 M avengers-coffee-system/services/ai-service/src/agents/customer_flow_presentation.py
 M avengers-coffee-system/services/ai-service/src/agents/product_option_scope.py
 M avengers-coffee-system/services/ai-service/src/agents/shopping_language.py
 M avengers-coffee-system/services/ai-service/src/agents/shopping_turn_control.py
 M avengers-coffee-system/services/ai-service/src/agents/tool_artifacts.py
 M avengers-coffee-system/services/ai-service/src/agents/tool_capabilities.py
 M avengers-coffee-system/services/ai-service/src/agents/tool_policy.py
 M data-platform/analytics-api/common.py
 M data-platform/analytics-api/metadata/semantic_catalog.json
 M data-platform/analytics-api/routers/ai.py
 M data-platform/analytics-api/server.py
 M data-platform/analytics-api/services/agent_pipeline.py
 M data-platform/analytics-api/services/analysis_pipeline.py
 M data-platform/analytics-api/services/analyst_decision.py
 M data-platform/analytics-api/services/dashboard_planner_service.py
 M data-platform/analytics-api/services/domain_intelligence_service.py
 M data-platform/analytics-api/services/one_shot_context.py
 M data-platform/analytics-api/services/one_shot_planner.py
 M data-platform/analytics-api/services/session_service.py
 M data-platform/web-ui/nginx.conf
 M data-platform/web-ui/src/components/AnalysisClarification.tsx
 M data-platform/web-ui/src/components/AnalysisInputForm.tsx
 M data-platform/web-ui/src/components/AnalysisMeaning.tsx
 M data-platform/web-ui/src/utils/analysisInput.d.ts
 M data-platform/web-ui/src/utils/analysisInput.mjs
 M data-platform/web-ui/src/utils/analysisInput.test.mjs
 M data-platform/web-ui/src/utils/analystDashboard.test.mjs
 M data-platform/web-ui/src/views/AnalyticsView.tsx
 M data-platform/web-ui/vite.config.ts
 M docker-compose.data.yml
?? avengers-coffee-system/services/ai-service/tests/test_branch_selection_flow.py
?? data-platform/analytics-api/docs/AI_V26_IMPLEMENTATION.md
?? data-platform/analytics-api/docs/MANUAL_EVALUATION_V26.md
?? data-platform/analytics-api/docs/V26_QUALIFICATION.json
?? data-platform/analytics-api/migrations/
?? data-platform/analytics-api/routers/analysis_modules.py
?? data-platform/analytics-api/services/analysis_issue_service.py
?? data-platform/analytics-api/services/analysis_module_repository.py
?? data-platform/analytics-api/services/analysis_module_service.py
?? data-platform/analytics-api/services/analytical_blueprint_service.py
?? data-platform/analytics-api/services/browser_owner.py
?? data-platform/analytics-api/tests/test_natural_v26.py
?? data-platform/analytics-api/tools/natural_matrix_v26.py
?? data-platform/analytics-api/tools/qualify_v26.py
?? data-platform/web-ui/src/components/AnalysisModules.tsx
```

NO COMMIT PERFORMED.
NO PUSH PERFORMED.
