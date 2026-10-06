# Data Platform AI V2.1 implementation and verification

## A. Starting state

Branch: `branch_thaian`. Starting HEAD: `b96b2a96c14b3aef313745e751a662404f59e9fa`.
The working tree was clean at this task's start. HEAD remains unchanged.
All edits are inside `data-platform/analytics-api/` and `data-platform/web-ui/`.
The customer ordering system was not inspected, modified, tested, or reverted.

## B. Files inspected and baseline behavior

Inspected the Data Platform contract, understanding, catalog, pipeline, query,
presentation, metadata, vector RAG, LLM, session and verified-example services;
`routers/ai.py`, `common.py`, `sql_service.py`, the semantic catalog, contract tests,
synthetic fixtures and matrix harness; `AnalyticsView.tsx`, `AnalysisMeaning.tsx`,
`Charts.tsx`, UI configuration and chart tests.

Baseline hints recognized explicit calendar periods with a year, relative aliases,
rolling days, ISO bounds, enum aliases and `top N`. The small fast path required a
complete ranking grammar with exact metadata aliases. Other requests went to one
structured understanding stage. Candidate retrieval scored overlapping tokens and
relationships, selected up to five subjects in the pipeline and exposed all available
dimensions. Invalid/unavailable model output could fall into the generic
subject/metric/scope clarification. The UI rendered legacy options as strings,
allowing semantic IDs to appear.

## C. Root cause of the reported month-9 failure

**PROVEN from starting-HEAD code and an offline replay:** the yearless month produced
no calendar hint; the fast grammar failed to resolve the city when the month suffix
remained in its slot. The request therefore required model understanding. Pydantic
failure on unusable model output was mapped to generic user clarification, whose
options could contain raw metric IDs. The UI displayed those legacy strings.

**LIKELY contributor:** broad candidates made the fallback interpretation harder.
For the reported request, the baseline candidates included customer/favorite domains.
This is a prompt-quality inference, not measured live accuracy.

**NOT PROVEN:** which production provider response caused the original rejection
(HTTP, timeout, invalid JSON, incompatible schema or a semantically incomplete
response). No original transport trace was supplied and no live provider was called.

See [before/after evidence](UNDERSTANDING_V21_BEFORE_AFTER.json).

## D. Changes

- `common.py`: optional request reference date.
- `analysis_contract.py`: intermediate `TimeSpec`, structured clarification, optional
  component subjects/filters/group scopes. Existing version-2 specs remain valid.
- New `time_resolution_service.py`: generic date parsing and canonical resolution.
- New `value_grounding_service.py`: bounded safe values, metadata aliases, conservative
  fuzzy matching and explicit entity lookup.
- `analysis_catalog.py`: staged candidates, metric/dimension compatibility, physical
  sensitivity checks retained, model confidence removed as a gate. Composite FK
  introspection now recognizes both constraint-name keys.
- `analysis_understanding.py`: compact prompt, partial meaning, focused clarification,
  deterministic constraints, group-limit associations and refinement guards.
- `analysis_pipeline.py`, `routers/ai.py`: reference-date continuity, provider failure
  separation, diagnostic evidence, public business labels and table column labels.
- `metadata_service.py`: bounded parameterized read-only entity lookup.
- `llm_service.py`: transport error classification; provider/model configuration unchanged.
- `session_service.py`: removes raw prompt text from session creation logs.
- `vector_rag_service.py`: honors physical sensitive flags in table details.
- `verified_analysis_service.py`: sanitizes new component/group filters and names.
- `semantic_catalog.json`: metric descriptions, concept aliases, generic time/Top N/
  granularity metadata and per-dimension value policy.
- `analysis_query.py`: **only `build_plans` changed** to honor component subject/filter/
  group scope and metric compatibility. SQL compilation and all independent validators
  are unchanged by AST comparison. `sql_service.py`, `analysis_presentation.py` and
  `Charts.tsx` are byte-identical to starting HEAD.
- UI: new `AnalysisClarification.tsx`, business-labelled `AnalysisMeaning.tsx`, focused
  `AnalyticsView.tsx` integration, preserved refinement feedback when answering a
  clarification, distinct system errors and labels for additional result tables.
- Tests/tools: new understanding and UI tests, expanded matrix fixtures/harness,
  new coverage tool and these documentation artifacts.

## E. Time understanding before/after

At reference date `2026-10-06`, the original request now resolves to products,
quantity sold, Top 5 descending, Hồ Chí Minh and **2026-09-01 through 2026-09-30**.
The generic existing ranking grammar succeeds after parsed time spans are removed;
no understanding provider call is needed. An assumption naming inferred year 2026
is shown. This exact sentence appears only in tests/evidence/documentation.

At reference date `2026-02-10`, month 9 resolves to September 2025. Explicit
`tháng 9 năm 2025` stays September 2025. Local/ISO dates, ordered ranges,
quarter/year expressions, relative periods and rolling days/months resolve before
planning. Weekly/monthly/quarterly aggregation remains a separate granularity field.

## F. Partial-date policy

Use the request reference date in the configured timezone. If omitted, use the
current date in that timezone. Pick the most recent calendar occurrence whose
**start is not future**; record the inferred year as a visible assumption. A current
month/quarter may be ongoing; its canonical scope is the whole named calendar period,
not an invented forecast. Explicit years are honored exactly, including explicit
future dates. Forecast language is classified as unsupported.

Conflicting periods, invalid dates and conflicting granularities require focused
clarification. Partial leap day selects the most recent valid leap day. SQL sees only
canonical `TimeScope`; inclusive end dates keep the existing next-day SQL boundary.
Rolling N days includes the reference day; rolling N months starts one day after the
same calendar date N months earlier, clipping invalid month days.

The date is retained through approval and repeated refinement. Unchanged relative
scopes reuse the originally grounded period.

## G. Candidate narrowing

Subject phrase/concept evidence → subject-compatible metric definitions → physically
available, safe, fanout-compatible dimensions → bounded values/time/join endpoints.
Zero-evidence domains are excluded. Subject selection is bounded to four candidates;
refinement also carries current subject context. Vector scores are used only when
actually available; lexical fallback remains explicit.

Same offline metadata/request, `top_k=5`: **5 → 3 subjects, 9 → 6 metrics,
26 → 20 dimensions**. Favorites/customer subjects disappear. The compact candidate
payload is 9,296 characters, not a token/cost measurement. No live quality improvement
percentage is claimed.

## H. Value grounding

Physical enum/bounded safe values precede overlay values. Values must come from a safe
physical column and fit a maximum 64-value catalog; prompt options are capped at 32.
Canonical aliases normalize Unicode accents, punctuation and case. Generic fuzzy
matching requires score ≥0.94, aliases at least six characters, and a clear margin;
short aliases require exact matching. Competing matches clarify.

Entity names are never fetched with an unbounded DISTINCT dump. A quoted, specifically
labelled reference or an explicitly selected literal can trigger a parameterized
lookup: Silver identifiers only, at most eight results, 1.5-second statement timeout,
read-only transaction, escaped wildcard text, rollback and close. No live lookup ran.
Unknown enums cannot become arbitrary SQL filters. Numeric/free scalars still require
explicit user evidence. PII columns and physical sensitivity flags remain blocked.

## I. Clarification contract

`ClarificationRequest` carries reason, known business-labelled interpretation,
missing/ambiguous fields, bounded labelled choices and a concise Vietnamese message.
Known subject, city, time and limit survive a missing metric. Partial year can resolve
deterministically without discarding known fields. UI choice buttons append answers
to the original question/refinement; editing remains available.

## J. Provider failure versus ambiguity

Unavailable/HTTP/timeout, invalid JSON, schema-incompatible transport and malformed
AnalysisSpec are system errors, with a safe Vietnamese retry message. They do not ask
users to restate subject/metric/scope. Failed understanding executes no SQL. Valid
structured ambiguity yields focused clarification instead. Attempts retain actual
provider/model/status/error/latency/token diagnostics without response prose, keys or
hidden reasoning. HTTP 400 with a submitted schema is classified as schema failure;
its exact underlying transport cause still requires a live trace.

## K. Public labels

Public interpretation is reconstructed from trusted business names, including
metrics, dimensions, filters, rankings, component subjects and groups. Clarification
choices are labelled objects. Legacy raw-ID strings are excluded from normal UI.
Additional table headers and heatmap axes use metadata labels. Technical IDs remain
in contracts/diagnostics. React rendering tests verify business labels and known scope.

## L. Prompt and confidence

One logical understanding stage requests only AnalysisSpec or structured clarification.
It sends the current request/context, compact compatible candidates, resolved time,
bounded value evidence, small verified structure examples and preservation rules.
No full physical schema, SQL formulas or reasoning instructions are sent. Examples
cannot add scope, override metadata, or cross analysis kinds.

Configured primary/fallback transport remains at most one attempt per provider.
There is no stronger-model substitution or extra understanding round. The auditable
server evidence score combines subject, metric, grounded filters, complete time and
contract validity; it is an **uncalibrated diagnostic**, not proof of NLP accuracy.
Model self-confidence is diagnostic only. Grounding and independent validators decide
whether execution is allowed.

## M. Semantic/operator coverage

[Inventory](SEMANTIC_COVERAGE_V21.json): **16 subjects, 32 metrics, 26 dimensions**,
with units, grains, compatible dimensions and value policies. Supported operators:
ranking, aggregate, trend, distribution, comparison, detail, composite and heatmap.
Time kinds: relative, month, quarter, year, day, range and rolling; canonical relative
modes and chart/granularity enums are included in the inventory.

Composite components can inherit shared comparison groups (`null`), explicitly opt
out (`[]`) or declare their own. The Hà Nội-only ranking plus Hà Nội/TP.HCM revenue
comparison and weekly trends yields five separate validated plans. Clearly associated
Top 5/Top 3 group limits cannot swap. Uncertain lexical association is left to structured
understanding/clarification. Multiple analytical subjects use separate component plans.

The system supports questions expressible through the current catalog/operators;
unknown concepts need metadata extension or clarification. New physically valid
business definitions and safe categorical values require no Python phrase branch.

## N. Tests and checks

- Python syntax compilation: passed.
- Backend suite: **118/118 passed**, including 26 new understanding tests and existing
  SQL/security/result/presentation/session/provider regressions.
- UI clarification tests: **2/2 passed**; existing chart tests: **8/8 passed**.
- Vite production build: passed.
- `tsc --noEmit`: six pre-existing TS2305 missing exports in `usePlatformStore.ts` and
  `StreamingView.tsx`; independently reproduced in a temporary archive of starting
  HEAD. No new TypeScript errors appeared.
- CRLF-aware diff check, secret-pattern scan and changed-production phrase audit: passed.

New tests cover yearless dates before/after current month, exact years, leap/local/
ISO/range/rolling dates, granularity, language/value variants, physical enum/sensitivity,
bounded read-only lookup, new metadata-only subject/metric, malformed providers with
zero execution, clarification labels, approval clock changes, component scopes,
limit swaps/shared limits, filter preservation and repeated relative refinement.

Reproduce from `analytics-api` in a requirements-installed environment:

```sh
python -m compileall -q common.py routers services tests tools
python -m unittest discover -s tests -q
python tools/analysis_matrix.py
python tools/analysis_coverage.py
```

From `web-ui`: `npm run test:ai-understanding`, `npm run test:ai-charts`, `npm run build`.

## O. Offline matrix

[Detailed results](MANUAL_MATRIX_V21_OFFLINE.json): **86/86 passed (100%)**, expanded
from 39 cases. It evaluates structured fields, independent contracts, SQL, row counts,
chart scope/cardinality, expected clarification/error and execution counts. It covers
Vietnamese, English/mixed language, accents/case/typos, partial/rolling time, groups,
multi-component requests, new values, unsupported concepts, provider failures and
refinements. Network and database connection entry points are blocked.

Complex AnalysisSpecs/patches use scripted providers and fixture rows. This proves
contract handling and deterministic guards, **not live LLM language accuracy**.
Per-case latency is local offline processing time. Recorded mock stage calls are not
actual provider usage; live token/cost measurements are unavailable.

## P. Real provider calls

**0 Gemini, 0 Groq, 0 embedding API calls.** Package installation was tooling setup,
not an AI call. All provider responses in verification were scripted/mocked.

## Q. Database effects

**0 database mutations; 0 live warehouse queries.** SQL was compiled and validated
against synthetic metadata/results. The lookup adapter was tested with a fake connection.
No application startup, view initialization or live integration test was run.

## R. Limitations

Live provider/schema acceptance, real language quality, warehouse contents and entity
lookup performance are unverified. Fuzzy matching is deliberately conservative;
arbitrary transliteration, named English calendar months and unrestricted free-text
entities are not guaranteed. The current contract shares one time scope/granularity
across components; incompatible scopes require clarification. Candidate sets are
bounded. Metric definitions still need explicit business metadata. Lookup ILIKE may
need warehouse indexes and can time out. Sessions/verified examples remain process-local.
The optional metadata-cache redesign was deferred: existing `force=True` refresh is
retained to avoid unrelated schema/session invalidation changes. The six baseline
TypeScript errors remain. No universal natural-language coverage claim is made.

## S. Small manual live evaluation — NOT EXECUTED

Use the existing Data Analyst proposal → approval → report flow with the real configured
warehouse/providers later. Record AnalysisSpec, SQL, row counts, chart scope/labels,
clarification, actual provider attempts and latency for each:

1. `top 5 món bán chạy nhất tại thành phố hồ chí minh tháng 9`
2. `5 món được mua nhiều nhất ở HCM trong tháng 9`
3. `top 3 chi nhánh có doanh thu cao nhất quý trước`
4. `chi nhánh nào tốt nhất?`
5. `so sánh doanh thu Hà Nội và TP.HCM trong 30 ngày gần nhất`
6. `top 5 sản phẩm ở Hà Nội và top 3 ở Cần Thơ quý trước, kèm doanh thu và xu hướng theo tuần`
7. `Show top 5 products theo số lượng ở Sài Gòn tháng 9 and a weekly revenue trend.`
8. `Phân tích độ co giãn nhu cầu theo độ ẩm.`

For 1/2 inspect the inferred year assumption against the actual reference date.
For 4 expect business-labelled metric clarification; for 8 expect unsupported metric/
dimension clarification and no SQL. For 6 confirm separate 5/3 populations and common
previous-quarter period, with no extra ranked rows. Actual language/model behavior
may differ from scripted fixtures; inspect rather than assume passing live results.

## T. Git state

Changes are uncommitted and confined to the two authorized roots. The accompanying
[status snapshot](GIT_STATUS_V21.txt) lists modified and new files. Starting HEAD was
not moved. No excluded files were changed. Temporary validation environments and the
baseline archive are outside the repository under `/private/tmp`.

## U. Commit/push

**NO COMMIT PERFORMED. NO PUSH PERFORMED.** No reset, checkout, stash, merge or rebase
was performed.
