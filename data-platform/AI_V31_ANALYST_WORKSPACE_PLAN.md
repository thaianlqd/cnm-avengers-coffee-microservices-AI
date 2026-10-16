# =====================================================================
# MASTER EXECUTION PROMPT
#
# AVENGERS COFFEE DATA PLATFORM AI V3.1
# "ANALYST WORKSPACE"
#
# FULL IMPLEMENTATION + HARDENING + VERIFICATION
#
# Date: 2026-10-16
# Working branch: branch_thaian
# Scope: data-platform/
#
# IMPORTANT:
# V3.0 IS ALREADY IMPLEMENTED.
# DO NOT REWRITE V3.0.
# THIS PHASE BUILDS V3.1 ON TOP OF IT.
# =====================================================================

You are continuing the Avengers Coffee Data Platform AI project.

This is a NEW Claude Code session,
but it is NOT a new implementation.

Data Platform AI V3.0 has already been implemented and is currently
present in the working tree.

V3.0 introduced, among other things:

- semantic truth improvements
- fail-fast behavior
- typed analytical errors
- provider-call budgeting
- progress-aware semantic repair
- deterministic forecasting
- silver.giao_hang
- delivery_success_rate
- registry validation
- source-scope semantics
- live/offline evaluation improvements

DO NOT redesign or replace that architecture.

Your task is to implement:

DATA PLATFORM AI V3.1 — ANALYST WORKSPACE

The main problem is now PRODUCT USABILITY and ANALYTICAL DISCOVERABILITY,
not another rewrite of the semantic engine.

The system already understands analytics better than before,
but users still do not know:

- what they can ask
- which metrics exist
- which dimensions exist
- which forecasts are possible
- what the data date range is
- what is unsupported
- what analytical problem type to choose
- why a request is invalid before spending an AI call

V3.1 must solve that.

=====================================================================
0. ABSOLUTE GIT / WORKING-TREE RULES
=====================================================================

Expected branch:

branch_thaian

This is NOT a Kubernetes task.

DO NOT work on:

features_k8s

Before modifying anything, run:

pwd
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v

Read the Git state carefully.

There may be many uncommitted V3.0 changes already present.

DO NOT:

git reset
git reset --hard
git clean
git stash
git checkout over user changes
git restore unrelated files
git rebase
git commit
git push
git merge
git force push

Do not revert existing V3.0 changes.

The user will commit and push manually.

If current branch is not branch_thaian and changing branch would risk
working-tree changes:

STOP and explain the Git state.

Do not destroy or move user work.

=====================================================================
1. DO NOT READ SECRETS
=====================================================================

Do NOT read:

.env

Do not print:

provider API keys
database passwords
tokens
private URLs with credentials
private cookies
credentials from container environment

Use existing application commands and abstractions.

=====================================================================
2. REQUIRED RESPONSE LANGUAGE
=====================================================================

Your implementation reasoning/code may use English.

Your status updates and final report to the user must be in Vietnamese.

=====================================================================
3. REQUIRED SKILLS / WORKFLOW
=====================================================================

Read:

CLAUDE.md
.claude/rules/data-platform.md
data-platform/AI_V30_SEMANTIC_TRUTH.md
data-platform/AI_V31_ANALYST_WORKSPACE_PLAN.md if already present

Use the repository's planning/verification skills where available:

/execute-plan

then:

/verify-changes

Do not stop after describing a plan.

Execute the implementation.

=====================================================================
4. PRODUCT CONTEXT
=====================================================================

After V3.0, the AI is more correct but still difficult to use.

Current usability problems include:

1. Users do not know what questions are supported.

2. The system has roughly:
   - dozens of metrics
   - many business domains
   - many analytical operations

   but UI suggestions are too generic.

3. The fields:

   "Ngữ cảnh phân tích"
   "Mong muốn phân tích"

   overlap with the main question.

   The planner already prioritizes the question.

   These fields create contradictions and are commonly left blank.

4. Unsupported or impossible requests are discovered too late.

Examples:

- forecasting 12 months when maximum is lower
- grouped forecast by branch when grouped forecasting is unsupported
- asking for profit when no COGS exists
- asking for 2024 when the dataset does not contain 2024
- asking for sensitive customer information

Currently some of these can consume Gemini/provider calls before being
rejected.

5. Results appear as isolated charts instead of a coherent analytical
"mission".

6. Metadata is still missing some practical analytical concepts.

Examples include:

- order cancellation rate
- order completion rate
- weekday
- region
- promotion redemption count
- possibly new/returning customer metrics

7. Dashboard presentation has several visible semantic/UI issues.

The V3.1 objective is:

USER OPENS ANALYST WORKSPACE
        ↓
immediately sees available data coverage
        ↓
sees supported analytical missions
        ↓
can browse "what can I ask?"
        ↓
chooses a mission OR writes freely
        ↓
deterministic preflight runs
        ↓
0 provider calls for preflight
        ↓
warnings/fixes appear immediately
        ↓
valid request proceeds
        ↓
AI interprets language
        ↓
V3.0 semantic truth resolves capability
        ↓
secure query execution
        ↓
mission-aware analytical dashboard
        ↓
KPIs + charts + grounded insights + next questions

=====================================================================
5. V3.0 INVARIANTS — DO NOT BREAK
=====================================================================

Preserve all of these.

A. LLM interprets language only.

B. SQL remains generated by server-side compiler:

analysis_query.compile_sql

C. GenBI remains READ ONLY.

D. statement_timeout remains enforced.

E. GenBI remains limited to governed silver sources for executable
analytics unless existing V3.0 architecture explicitly provides another
safe source.

F. Semantic truth remains owned by the server/registry.

G. Do not allow LLM-generated arbitrary SQL.

H. Do not weaken:

- metric validation
- dimension validation
- join validation
- source-scope validation
- sensitive data checks
- forecast validation
- result validation
- typed error taxonomy
- provider-call budgeting

I. Do not add retry-until-success behavior.

J. Do not solve semantic problems with phrase-specific regex.

K. Do not hard-code UI capability lists.

Capabilities, metrics, dimensions, limits, example questions and
unsupported features must originate from the governed registry.

=====================================================================
6. BASELINE EXPECTATIONS
=====================================================================

Before implementing, run the current baseline.

Expected historical state:

analytics-api tools.run_tests_v29:
810 tests
4 pre-existing failures/errors

web-ui node tests:
124 tests
1 pre-existing failure related to the previous
"question-only submission" behavior

offline V3.0 evaluation:
must not regress

These counts are historical expectations.

Record the ACTUAL current baseline.

Do not assume numbers if repository state differs.

Do NOT classify a new failure as "pre-existing" unless it was observed in
the baseline before V3.1 changes.

=====================================================================
7. ARCHITECTURAL PRINCIPLE OF V3.1
=====================================================================

V3.1 introduces:

ANALYSIS MISSION

as a UX/analytical-structure layer ABOVE V3.0 semantic intent.

An Analysis Mission is NOT a new query language.

It is NOT a replacement for the user's question.

It is NOT an LLM mode.

It is a governed analytical template that organizes existing operations.

Mission should affect:

- question template
- visual layout
- KPI emphasis
- result organization
- recommended next questions

Mission must NOT override semantic truth.

=====================================================================
8. REQUIRED ANALYSIS MISSIONS
=====================================================================

Implement the mission registry under governed metadata.

Suggested structure:

analysis_registry.analysis_missions

Required missions:

overview
compare
ranking
trend
composition
forecast
risk_watch
relationship

Semantics:

overview
- answers: "Tình hình X thế nào?"
- scalar KPIs
- trend
- top breakdown
- 3–4 KPI cards
- line chart
- bar/donut

compare
- compares A vs B
- dimension/time-period comparisons
- change
- change_pct
- group_gap
- KPI A vs B
- grouped bar
- difference table

ranking
- Top/Bottom N
- contribution_share
- top_gap
- horizontal bar
- ranking table

trend
- day/week/month
- line/area
- incomplete-period markers

composition
- distribution
- concentration
- donut / stacked-100

forecast
- use V3.0 forecast capability only
- historical line
- forecast line
- 80% uncertainty range
- compact table
- backtest quality

risk_watch
- deterministic risk indicators
- NO invented composite score
- server compares governed metrics against governed thresholds
- traffic-light table
- chart of threshold breaches

relationship
- observational relationship only
- scatter
- explicit "correlation is not causation" caveat

=====================================================================
9. MISSION VALIDATION
=====================================================================

Registry validator must reject invalid missions.

Validate:

mission ID unique

mission references valid metrics

mission references valid operations

mission dimensions are compatible

mission uses supported chart/result forms

risk mission threshold references valid governed metrics

forecast mission references only forecastable metrics

No mission should expose unavailable capabilities.

If a mission lacks sufficient data:

capabilities API must mark it unavailable or partially available with a
reason.

=====================================================================
10. MISSION IS A UX HINT, NOT SEMANTIC AUTHORITY
=====================================================================

When the user selects a mission:

UI may build a Vietnamese question template.

Example:

[Doanh thu]
theo
[Thành phố]
trong
[Tháng 9/2026]

Then populate the actual question field.

Also send optional:

analysis_mission

to the backend.

But the real question still goes through V3.0 semantic interpretation and
validation.

If the mission and actual question conflict:

the actual semantic request wins.

Mission mainly influences:

dashboard organization
visual preference
question-building UX

Do not make mission bypass semantic validation.

=====================================================================
11. PRE-FLIGHT POLICY — IMPORTANT CLARIFICATION
=====================================================================

The original V3.1 draft contained a blocking-policy inconsistency.

Resolve it using this final policy.

Preflight findings have:

block
warn
info

HARD BLOCK is allowed only for requests that are unsafe or structurally
impossible to submit correctly.

Examples:

privacy_blocked
question_too_long
structurally_invalid_input

WARN should normally be used for capability/data limitations that have a
possible correction or that the backend should still authoritatively
validate.

Examples:

forecast_horizon_exceeded
forecast_metric_unsupported
forecast_grouped_unsupported
time_outside_data
snapshot_metric_trend
unsupported_concept
too_many_goals

INFO examples:

no_metric_detected
AI_may_need_interpretation

Do not use preflight to create a second semantic engine.

Preflight is advisory.

V3.0 backend remains authoritative.

=====================================================================
12. PREFLIGHT MUST USE ZERO PROVIDER CALLS
=====================================================================

Implement:

POST /api/ai/preflight

Input conceptually:

question
time
analysis_scope
analysis_mission?

Use deterministic existing metadata/services only.

Allowed:

request anchors
registry aliases
forecast validation
privacy rules
known data coverage
known limits

Forbidden:

Gemini
HTTP provider calls
agent provider
semantic repair
LLM calls

Tests must prove provider call count stays unchanged.

=====================================================================
13. PREFLIGHT HOT PATH MUST NOT QUERY WAREHOUSE
=====================================================================

This is mandatory.

`/api/ai/preflight` must NEVER synchronously query the warehouse.

The UI will call preflight while the user types.

Therefore the path must read only from:

in-memory registry
capability metadata
cached DataCoverageSnapshot
cached freshness metadata

Warehouse coverage/freshness may be refreshed separately.

Never do:

user typing
→ preflight
→ SELECT MIN/MAX ...
→ warehouse

That would create latency and database load.

Target:

<= 50 ms p95 offline

for normal preflight execution.

=====================================================================
14. DATA COVERAGE CACHE
=====================================================================

Capabilities should expose a cached snapshot similar to:

data_coverage:
  overall:
    min_date
    max_date

  facts:
    orders
    deliveries
    ...

  freshness:
    mode: batch
    last_sync

Use existing:

readiness_service
public.sync_history
catalog cache

where appropriate.

Refresh coverage outside the preflight hot path.

A reasonable cache TTL may reuse existing ~60-second patterns.

Do not advertise "real time" if data is batch-updated.

=====================================================================
15. CAPABILITY API EXPANSION
=====================================================================

Extend:

DomainIntelligence.capabilities()

Preserve all existing fields.

Add conceptually:

missions[]

limits{}

data_coverage{}

unsupported[]

metric capability metadata

Each metric should expose enough metadata for UI:

id
label
domain
dimensions
historical
forecastable
unit
semantic type
examples if available

Do not leak internal sensitive fields.

=====================================================================
16. LIMITS
=====================================================================

Expose server-owned limits.

Examples:

max_requirements = 6

forecast:
max horizon by cadence
minimum history by cadence

question maximum length

maximum supported dimensions

Any value that UI uses to warn the user should come from server
capability metadata where possible.

Do not duplicate constants in frontend.

=====================================================================
17. UNSUPPORTED CAPABILITIES
=====================================================================

Expose governed unsupported concepts.

Examples may include only those verified against actual data:

profit
COGS
ROI
sentiment if unavailable
sensitive personal data

Each unsupported capability may include:

concept
reason
nearest supported metric(s)

Do not invent unsupported entries without repository evidence.

=====================================================================
18. PHASE P0 — PREPARATION
=====================================================================

Before modifying code:

1. Read repository instructions.

2. Read V3.0 documentation.

3. Read current semantic_catalog.json.

4. Read V3.0 forecast implementation.

5. Read current UI architecture.

6. Run baseline tests.

7. Record baseline in V3.1 plan documentation.

8. Inspect current uncommitted V3.0 work.

Do not modify code during P0.

=====================================================================
19. PHASE P1 — MISSING GOVERNED METADATA
=====================================================================

Add only data capabilities that can be proven correct.

For every new metric:

registry definition
oracle test
real warehouse read comparison once where safe

Do not add a metric just because it would look useful.

=====================================================================
20. ORDER CANCELLATION RATE
=====================================================================

Add:

order_cancellation_rate

Requirements:

ratio
0..100
non-additive
correct unit = percent
governed business definition
verified actual order status enum
oracle test

Do not assume status values.

Inspect actual order-service/data schema first.

=====================================================================
21. ORDER COMPLETION RATE
=====================================================================

Add:

order_completion_rate

Requirements same as above.

Remove from unsupported_capabilities only after it is genuinely supported.

=====================================================================
22. WEEKDAY DIMENSION
=====================================================================

Add governed:

weekday

Preferred semantics:

ISO weekday from order creation date.

If compiler safely supports:

EXTRACT(ISODOW ...)

through governed expression support,
use it.

If it does NOT:

add the column to the existing silver view in:

data-platform/data-sync/sync.py

Do not add arbitrary SQL escape hatches to compiler.

=====================================================================
23. REGION DIMENSION
=====================================================================

Support region through governed join:

silver.chi_nhanh
→ silver.khu_vuc

Validate:

join path
join cardinality
grain safety
compatible metrics

Do not enable an unsafe join merely to satisfy UI.

=====================================================================
24. PROMOTION REDEMPTION
=====================================================================

If operational data exists:

identity.khuyen_mai_su_dung

create safe silver analytical view:

silver.khuyen_mai_su_dung

Do NOT expose personal customer fields.

Add governed metric:

promotion_redemption_count

and valid promotion dimensions.

Update sync tests.

=====================================================================
25. NEW / RETURNING CUSTOMERS
=====================================================================

Consider:

returning_customer_rate
new_customer_count

ONLY if the current deterministic compiler can express the correct
business definition without arbitrary SQL.

Definition requires knowledge of customer orders before the requested
period.

If the current compiler cannot safely express it:

DO NOT hack around it.

Record:

DEFERRED

with reason.

=====================================================================
26. GOLD MART SCOPE METADATA
=====================================================================

Declare source_scope for remaining Gold marts including, if present:

branch_taste_profile
customer_segments
menu_overview
order_status_distribution
payment_methods_distribution
stores_overview

Classify accurately:

FULL_AGGREGATE
FILTERED_MART
TOP_N_MART
SNAPSHOT
PRESENTATION_ONLY

Do not claim global completeness if the mart is filtered/truncated.

=====================================================================
27. RISK WATCH — GOVERNED ONLY
=====================================================================

Risk Watch must NEVER create an invented aggregate "risk score".

Each signal is:

governed metric
dimension
threshold
bad direction

The server calculates the status.

LLM must not calculate the status.

=====================================================================
28. REQUIRED RISK SIGNALS
=====================================================================

Only retain signals whose data actually exists.

Target signals:

order cancellation high
delivery success low
cash discrepancy high
late shift rate high
low stock exists
store rating low

Proposed default thresholds:

order_cancellation_rate > 8%

delivery_success_rate < 90%

absolute total_cash_difference > 500000 VND per shift

late_shift_rate > 15%

low_stock_count > 0

avg_store_rating < 3.5

These are SYSTEM DEFAULT THRESHOLDS,
not universal business truths.

Metadata must clearly say they are configurable defaults.

=====================================================================
29. IMPORTANT — LATE SHIFT RATE MUST BE CANONICAL
=====================================================================

Do NOT implement this in workspace/dashboard code as:

late_count / shift_count

Create or reuse a governed canonical ratio metric:

late_shift_rate

It must define:

numerator
denominator
eligible population
unit = percent
range = 0..100
grain
valid dimensions

Risk Watch then uses:

late_shift_rate > 15%

The workspace layer must not invent formulas.

=====================================================================
30. DELIVERY SUCCESS RATE MUST REMAIN CANONICAL
=====================================================================

V3.0 introduced a governed:

delivery_success_rate

with a full-population definition based on the delivery fact.

Preserve that definition.

Do NOT calculate system-wide delivery success from:

gold.shipper_performance

if that mart remains Top-N or uses different denominator semantics.

=====================================================================
31. GOLD SHIPPER PERFORMANCE MISMATCH
=====================================================================

V3.0 identified that:

gold.shipper_performance

may:

- keep only Top-N shippers
- use old success-rate semantics
- count FAILED differently
- include/exclude states differently

V3.1 must NOT expose this Gold metric as if it were the same canonical
system-wide delivery_success_rate.

For this phase:

PREFERRED SAFE ACTION:

A. Keep canonical AI/risk metric backed by governed complete Silver fact.

B. If dashboard still uses the Gold mart:
   make its scope/caveat/label explicit so users cannot confuse it with
   the system-wide canonical metric.

C. Do not silently show two different values under the same business
   definition.

D. Do not rewrite Spark Gold jobs unless necessary and safe within scope.

If a Spark change would be required for correctness beyond this scope:

document it rather than expanding the phase recklessly.

=====================================================================
32. REGISTRY VALIDATOR EXTENSIONS
=====================================================================

Extend semantic_catalog_validation.py.

Validate:

mission metric references

mission operation references

risk threshold metric references

threshold unit

threshold range

ratio non-additivity

forecast compatibility

source_scope presence where required

Top-N mart cannot be marked globally complete

no historical semantics on snapshot-only source

time dimension belongs to valid source/join

new dimensions are physically valid

=====================================================================
33. EVALUATION DATASET EXPANSION
=====================================================================

Add at least ~25 meaningful semantic cases for thin domains.

Target areas may include:

promotions
inventory
reviews
shifts
cash reconciliation
surveys
favorites
delivery
new metrics

Do not create near-duplicate trivial paraphrases simply to increase count.

Prefer natural Vietnamese questions.

=====================================================================
34. PHASE P2 — PREFLIGHT + CAPABILITIES BACKEND
=====================================================================

Implement:

services/preflight_service.py

and:

POST /api/ai/preflight

Keep existing API contracts compatible.

Add optional:

analysis_mission

to AiTextToReportRequest or equivalent request model.

Propagate to:

diagnostics
dashboard planner

Do not require it.

Free-form questions must continue to work.

=====================================================================
35. PREFLIGHT OUTPUT
=====================================================================

Return conceptually:

{
  "understood": {
    "metrics": [...],
    "dimensions": [...],
    "time": ...,
    "forecast": ...,
    "mission": ...
  },

  "findings": [
    {
      "level": "block|warn|info",
      "code": "...",
      "message": "...",
      "fixes": [...]
    }
  ]
}

Fixes should be deterministic.

Example:

requested:
12-month forecast

supported:
6 months

quick fix:
"Đổi thành 6 tháng"

Do not ask Gemini to produce fixes.

=====================================================================
36. PREFLIGHT FINDING CODES
=====================================================================

Implement appropriate codes including:

privacy_blocked

question_too_long

forecast_horizon_exceeded

forecast_metric_unsupported

forecast_grouped_unsupported

time_outside_data

snapshot_metric_trend

unsupported_concept

too_many_goals

no_metric_detected

Add others only when justified.

=====================================================================
37. PREFLIGHT RATE LIMIT
=====================================================================

Because UI calls this frequently:

add lightweight rate limiting or reuse existing safe rate controls.

Do not make typing generate provider calls.

Do not make typing generate database queries.

=====================================================================
38. PREFLIGHT TESTS
=====================================================================

Create:

tests/test_workspace_v31.py

Test:

capabilities missions

limits

coverage shape

unsupported capabilities

metric dimensions

forecast metadata

each preflight code

privacy block

question length block

forecast warnings

time coverage warning

unsupported concept warning

too-many-goals

no-metric info

mission propagation

mission dashboard layout

NO provider calls

NO synchronous warehouse call in preflight hot path

latency logic where reasonably testable

=====================================================================
39. PHASE P3 — ANALYST WORKSPACE UI
=====================================================================

Use existing Data Platform design language.

Reference the current:

"Báo cáo & Phân tích"

visual style.

Desired style:

rounded tabs
clean white cards
soft shadows
muted helper text
clear KPI cards
compact filters
good spacing
existing Tailwind theme

Do NOT redesign the entire product.

Do NOT add a new chart library.

=====================================================================
40. DATA COVERAGE BAR
=====================================================================

At top of AI workspace show:

Dữ liệu:
<min date> → <max date>

Cập nhật:
Theo đợt

Đồng bộ gần nhất:
<last sync>

Source from capabilities/data coverage.

Replace misleading static:

"Dữ liệu thời gian thực"

where relevant with:

"Cập nhật theo đợt"

and real sync metadata.

=====================================================================
41. MISSION PICKER
=====================================================================

Display eight mission cards/tabs:

Tổng quan
So sánh
Xếp hạng
Xu hướng
Cơ cấu
Dự báo
Rủi ro & cảnh báo
Tương quan

Unavailable mission:

disabled/muted

show reason.

Mission availability comes from server capability metadata.

=====================================================================
42. QUESTION TEMPLATE BUILDER
=====================================================================

Selecting a mission shows a guided builder such as:

[Metric ▼]
theo
[Dimension ▼]
trong
[Time ▼]

Only show compatible combinations.

Metric-dimension compatibility comes from backend registry.

Button:

"Điền vào câu hỏi"

generates a Vietnamese question.

Do not bypass the real question field.

=====================================================================
43. "HỎI ĐƯỢC GÌ?" CAPABILITY DRAWER
=====================================================================

Create searchable/collapsible capability browser.

Show business domains.

For each metric show badges equivalent to:

Hiện tại

Có xu hướng

Dự báo được

Show:

valid dimensions

example questions

unsupported items

nearest supported capabilities

All data must come from capability API.

No duplicated hard-coded frontend catalog.

=====================================================================
44. QUESTION INPUT
=====================================================================

Improve the question area.

Add:

character count

preflight status

"Hệ thống hiểu:" chips

warnings

quick fixes

Debounce preflight:

~400ms

Cancel stale requests.

Do not let old preflight results overwrite newer user input.

=====================================================================
45. REMOVE REDUNDANT FIELDS
=====================================================================

Remove from active UI:

Ngữ cảnh phân tích

Mong muốn phân tích

Backend fields may remain for compatibility.

Frontend should stop sending them for normal V3.1 workflow.

Update payload tests intentionally.

Do not delete server compatibility without need.

=====================================================================
46. REPLACE WITH THREE PRACTICAL CONTROLS
=====================================================================

Use:

TIME

SCOPE

DEPTH

Time label:

"Theo câu hỏi"

with clear fallback meaning.

Scope:

reuse existing:

scope_types

/api/ai/scope-values

Support multi-select where existing architecture allows:

city
branch
store type

Depth:

Tập trung
Phân tích sâu
Toàn diện

using existing:

analysis_depths

Do not invent disconnected frontend-only depth IDs.

=====================================================================
47. QUICK SUGGESTION CHIPS
=====================================================================

Suggestion chips should become real example questions.

Not domain names.

Rotate/filter based on selected mission.

Source examples from:

mission templates
lens example_intents
governed registry metadata

=====================================================================
48. DO NOT GROW AnalyticsView.tsx
=====================================================================

The current file:

data-platform/web-ui/src/views/AnalyticsView.tsx

is already very large.

Do not implement V3.1 directly inside it.

New logic must live in new components/utils.

AnalyticsView should mostly compose components.

Do not use dead:

AiAssistantView.tsx

unless repository review proves it has become active.

=====================================================================
49. RECOMMENDED NEW COMPONENTS
=====================================================================

Create focused components such as:

components/workspace/MissionPicker.tsx

components/workspace/CapabilityDrawer.tsx

components/workspace/QuestionPreflight.tsx

components/workspace/ScopeDepthBar.tsx

components/workspace/DataCoverageBar.tsx

components/workspace/KpiStrip.tsx

components/workspace/RiskSignalTable.tsx

components/workspace/FollowUpChips.tsx

Names may vary slightly if project conventions justify it.

Keep components focused.

=====================================================================
50. SMALL SHARED UI PRIMITIVES
=====================================================================

It is acceptable to add small local primitives for new V3.1 UI:

Card
Tabs
Badge
KpiCard

Do NOT refactor the entire existing application into them.

Use them only where useful for this phase.

=====================================================================
51. TESTABLE PRESENTATION LOGIC
=====================================================================

Move non-React presentation logic into pure `.mjs` utilities where
consistent with current project tests.

Examples:

workspacePresentation.mjs

preflightPresentation.mjs

Add:

.test.mjs

and `.d.ts` where needed.

Do not bury critical business formatting in JSX.

=====================================================================
52. PHASE P4 — MISSION-AWARE RESULT DASHBOARD
=====================================================================

Results should become a coherent analytical dashboard.

Top section:

normalized question

mission

scope

time

source/provenance

Then:

3–4 KPI cards when appropriate

Then:

grounded findings

Then:

mission-specific charts

Then:

follow-up questions

=====================================================================
53. KPI CARDS
=====================================================================

KPI card must include:

label

value

unit

comparison if available

comparison direction

period/scope context

Use deterministic formatting.

Do not let LLM invent KPI numbers.

=====================================================================
54. GROUNDED NARRATIVE
=====================================================================

Use existing grounded narrative/result artifacts.

Show around 3 concise analytical findings.

Every numerical statement must come from verified result data.

Do not create new unrestricted LLM narrative path.

=====================================================================
55. MISSION-BASED CHART LAYOUT
=====================================================================

Retain current result tabs such as:

Tất cả
Diễn biến
Cơ cấu
So sánh

Add when relevant:

Dự báo
Rủi ro

Mission determines layout priority.

It must not alter underlying numerical result.

=====================================================================
56. BAR COMPARISONS
=====================================================================

For two-group comparison:

show values

show deterministic difference

Example:

"HCM cao hơn 69,6%"

Format large numbers in vi-VN.

Avoid truncated axis labels such as:

"777,4 triệu"

Ensure adequate axis/layout spacing.

=====================================================================
57. LINE CHART INCOMPLETE PERIODS
=====================================================================

Use existing trend bucket coverage information.

Incomplete period:

lighter

or dashed

or otherwise clearly marked.

Do not silently show incomplete current period as equivalent to full
historical periods.

=====================================================================
58. DONUT
=====================================================================

Keep current good behavior where available:

total in center

percentage legend

actual values

Correct units.

Do not use donut where the semantic result is not part-to-whole.

=====================================================================
59. FORECAST VISUAL
=====================================================================

Upgrade ForecastPanel.

Show:

history

forecast

80% interval band

current/incomplete period marker if relevant

compact table

method/backtest quality

Do not change V3.0 forecasting numerical engine unless a verified defect
requires it.

=====================================================================
60. RISK VISUAL
=====================================================================

Display deterministic risk table:

metric
value
threshold
status

Traffic-light state:

green
yellow
red

Server calculates state.

Frontend only renders.

Include metric definition.

No invented combined score.

=====================================================================
61. FOLLOW-UP QUESTIONS
=====================================================================

Generate 2–4 deterministic follow-up chips from:

result
mission
registry

Examples:

drill down by another valid dimension

show trend

compare previous period

forecast if metric is forecastable

Do not spend provider calls simply to generate follow-up chips.

=====================================================================
62. CHART HELP
=====================================================================

Every chart should provide:

"Cách đọc biểu đồ"

"Xem dữ liệu"

"Định nghĩa chỉ số"

Metric definition comes from governed metadata.

=====================================================================
63. PHASE P5 — SMALL DASHBOARD FIXES
=====================================================================

Keep this phase narrow.

Do not redesign the whole analytics dashboard.

Fix only verified visible issues.

=====================================================================
64. REVENUE KPI SCOPE
=====================================================================

Current dashboard revenue KPI may use a limited Gold mart.

If it represents:

last 30 days

label it explicitly:

"30 ngày gần nhất"

Do not visually compare it to a full-history AI result without scope
context.

=====================================================================
65. SALES CHANNEL UNIT
=====================================================================

If a donut/value is order count:

unit must be:

"đơn"

not currency.

Fix deterministic unit formatting.

=====================================================================
66. INCOMPLETE REVENUE PERIOD
=====================================================================

If latest time bucket is incomplete or unsynced:

mark as incomplete

or exclude according to existing product semantics.

Do not visually imply revenue collapsed to zero when data is simply not
complete.

=====================================================================
67. ASK AI ABOUT THIS CHART
=====================================================================

Add:

"Hỏi trợ lý AI về biểu đồ này"

to appropriate analytics cards.

Click:

open AI workspace

populate a relevant governed question

retain appropriate metric/scope/time context

Do not directly trigger hidden provider call without user action.

=====================================================================
68. DO NOT CHANGE SPARK/GOLD JOB IN P5
=====================================================================

Dashboard visual fixes must not trigger an unrelated Spark rewrite.

If a deeper Gold semantic issue remains:

document it separately.

Exception:

only fix a Gold job if correctness absolutely requires it,
scope is clear,
tests exist,
and the change does not destabilize this phase.

Prefer metadata/caveat isolation for V3.1.

=====================================================================
69. V3.0 REMAINING HARDENING ITEMS
=====================================================================

Where practical in this phase, close the remaining V3.0 items.

A. "Chỉ số hạnh phúc của khách hàng"

Should deterministically become unsupported when there is no governed
metric.

Do not ask arbitrary clarification if the capability clearly does not
exist.

B. Full live suite:
only with user permission.

C. Invalid auxiliary forecast requirement:
make UI preflight clearly explain the fail-fast behavior.

D. not_analytical_request:
consider distinct out_of_scope state if low-risk.

E. Invalid DATA_ANALYST_MAX_SEMANTIC_REPAIRS env:
validate during readiness/startup rather than only when semantic error
occurs.

F. Forecast sync lag:
make freshness semantics explicit.

G. assess_report:
ensure forecast artifacts are covered appropriately if missing.

H. Gold shipper performance:
do not silently equate old mart semantics with canonical delivery success.

I. Manual V3.0 error cards/ForecastPanel browser check.

Do not let these items derail P0→P6.

If an item requires major redesign:

record it as remaining work.

=====================================================================
70. IMPORTANT FORECAST FRESHNESS RULE
=====================================================================

V3.0 forecast is deterministic.

Do not let stale batch data appear as recent zero activity.

Capabilities must expose:

last_sync
max_data_timestamp
batch freshness

When forecast input is materially stale:

UI/report must clearly warn about data freshness.

Do not manufacture zero-filled recent periods outside the justified
complete-history rules of V3.0.

If a new typed stale-data status is already consistent with V3.0
architecture, use it.

Otherwise at minimum expose a strong deterministic warning.

=====================================================================
71. PHASE P6 — EVALUATION + DOCUMENTATION
=====================================================================

Run full offline qualification.

Update documentation.

Fill V3.1 acceptance checklist.

Do not claim completion before browser-level acceptance.

=====================================================================
72. ANALYTICS API TESTS
=====================================================================

Run:

docker compose -f docker-compose.data.yml exec -T analytics-api \
  python -m tools.run_tests_v29

Pass criterion:

current baseline + new tests

No new failures.

If the original four failures remain:

list exact test names

prove they existed in P0 baseline

do not simply say "known failures".

=====================================================================
73. NEW MODULE TEST
=====================================================================

Run V3.1 workspace test suite with safe in-memory stores.

Equivalent command:

docker compose -f docker-compose.data.yml exec -T \
  -e DATA_ANALYST_SESSION_STORE=memory \
  -e DATA_ANALYST_ARTIFACT_STORE=memory \
  -e DATA_ANALYST_ENV=development \
  analytics-api \
  python -m unittest tests.test_workspace_v31

Must pass.

=====================================================================
74. OFFLINE SEMANTIC EVALUATION
=====================================================================

Run:

python -m evals.semantic_eval_v30 --mode offline

inside the correct analytics-api environment.

Add V3.1 cases.

Acceptance:

no regression from V3.0

new required cases pass

Record:

case count

domain retrieval

metric retrieval

compilation

unsupported handling

forecast rejection handling

=====================================================================
75. DATA SYNC TESTS
=====================================================================

Run repository-prescribed data-sync test command.

At minimum ensure:

new silver views

promotion usage view

weekday column if added

remain safe and deterministic.

Do not run destructive sync logic against unknown databases.

Use repository test fixture/container commands.

=====================================================================
76. WEB UI TESTS
=====================================================================

Run:

npm run typecheck

node --test src/utils/*.test.mjs

npm run build

Record actual baseline and final counts.

If the previous question-only test intentionally changes because V3.1
removes context/expectation fields:

update the test for the new intended behavior.

Explain why.

Do not preserve an obsolete failing assertion just because it used to be
a "known failure".

=====================================================================
77. DOCKER DEPLOY VALIDATION
=====================================================================

Only after relevant analytics-api tests are no longer running:

docker compose -f docker-compose.data.yml up -d --build web-ui

Be aware that this Compose operation may recreate/restart analytics-api.

Do not run it while long backend tests are executing.

Verify container health.

=====================================================================
78. LIVE PROVIDER POLICY
=====================================================================

Do NOT run large Gemini/live evaluation automatically.

Live smoke is allowed only if the user explicitly approves it during the
session.

Maximum:

<= 30 provider calls

Record actual call count.

Historical free quota may be limited.

Do not waste quota.

Offline tests first.

=====================================================================
79. REQUIRED MANUAL / BROWSER ACCEPTANCE
=====================================================================

V3.1 is NOT complete until the real UI behavior is checked.

If browser automation/Computer tooling is unavailable:

state that manual UI verification remains.

Do not fake browser PASS from unit tests.

Required scenarios follow.

=====================================================================
80. ACCEPTANCE SCENARIO 1
=====================================================================

Open AI Assistant.

Expected:

Data Coverage Bar visible.

Shows:

date range

batch update status

last sync

Eight missions visible.

The old:

Ngữ cảnh phân tích

Mong muốn phân tích

fields are gone from normal UI.

=====================================================================
81. ACCEPTANCE SCENARIO 2
=====================================================================

Open:

"Hỏi được gì?"

Expected:

16+ actual data groups if current registry contains them

current/trend/forecast badges

supported dimensions

natural example questions

unsupported section

nearest alternatives

search capability

All server-driven.

=====================================================================
82. ACCEPTANCE SCENARIO 3
=====================================================================

Type:

"Dự báo doanh thu 12 tháng tới theo từng chi nhánh"

Expected BEFORE provider call:

forecast horizon warning

grouped forecast warning

quick fixes

provider_call_count unchanged

No Gemini/provider call.

Do NOT hard block solely because these are fixable capability limits.

=====================================================================
83. ACCEPTANCE SCENARIO 4
=====================================================================

Type:

"số điện thoại khách hàng mua nhiều nhất"

Expected:

privacy_blocked

red/critical card

submit/plan action disabled

No provider call.

=====================================================================
84. ACCEPTANCE SCENARIO 5
=====================================================================

Type:

"doanh thu năm 2024"

Expected:

time_outside_data warning

using cached data coverage

No provider call merely to discover the data range.

=====================================================================
85. ACCEPTANCE SCENARIO 6
=====================================================================

Mission:

Compare

Build:

Doanh thu
by Thành phố
HCM vs Hà Nội
September 2026

Expected final report:

A vs B KPIs

grouped bar

deterministic percentage difference

grounded findings

follow-up questions

correct units

correct time scope

=====================================================================
86. ACCEPTANCE SCENARIO 7
=====================================================================

Mission:

Forecast

Question:

"Dự báo doanh thu 3 tháng tới"

Expected:

historical line

forecast line

80% band

backtest quality

data-freshness information

no LLM-generated numerical forecast

=====================================================================
87. ACCEPTANCE SCENARIO 8
=====================================================================

Mission:

Risk Watch

Question:

"Rủi ro các kiosk tháng 9"

Expected:

governed risk signals

kiosk filter

traffic-light table

threshold definitions

no composite invented score

canonical delivery_success_rate

canonical late_shift_rate

=====================================================================
88. ACCEPTANCE SCENARIO 9
=====================================================================

Run:

"Tỷ lệ hủy đơn theo chi nhánh"

and:

"Doanh thu theo thứ trong tuần"

Expected:

successful execution

results match deterministic oracle

safe compiler path

correct units

=====================================================================
89. ACCEPTANCE SCENARIO 10
=====================================================================

Open:

Báo cáo & Phân tích

Verify:

Revenue KPI explicitly says its period such as:

30 ngày gần nhất

Sales-channel donut uses:

đơn

not currency

Latest incomplete revenue period is visually distinguished

"Hỏi trợ lý AI về biểu đồ này"

works and populates the AI workspace.

=====================================================================
90. NO REGRESSION TO V3.0 SHIPPER CASE
=====================================================================

Re-test:

"Tỷ lệ giao hàng thành công của shipper ở trong hệ thống"

Expected:

canonical delivery_success_rate

full governed source

correct population

no Gold Top-N contamination

no semantic retry loop

no provider connection misclassification

correct verified result

=====================================================================
91. NO REGRESSION TO FAIL-FAST
=====================================================================

Re-test unsupported/insufficient cases.

Examples:

unsupported metric

insufficient forecast history

provider timeout

semantic resolution failure

Expected:

correct typed UI state

retry shown only when truly retryable

No retry-until-lucky UX.

=====================================================================
92. NO REGRESSION TO PROVIDER BUDGET
=====================================================================

Normal supported questions should remain approximately:

1 provider call

Do not let V3.1 missions/preflight introduce new provider calls.

Preflight:

0 calls

Capability discovery:

0 calls

Follow-up suggestions:

0 calls

Chart selection:

0 calls

=====================================================================
93. NO REGRESSION TO SECURITY
=====================================================================

After V3.1:

LLM still cannot execute arbitrary SQL.

No new user-controlled free-form SQL.

No sensitive customer fields in capability UI.

No sensitive fields in promotion Silver view.

No warehouse mutation.

No write endpoints introduced.

=====================================================================
94. SOURCE-OF-TRUTH RULE
=====================================================================

Frontend MUST NOT become another semantic catalog.

Frontend receives:

missions
metrics
dimensions
limits
data coverage
unsupported concepts
risk thresholds

from backend capabilities.

If backend metadata changes:

UI should adapt without editing multiple hard-coded arrays.

=====================================================================
95. DATA CORRECTNESS RULE
=====================================================================

Never optimize for "make the dashboard look populated".

If a requested combination is unsupported:

show unavailable.

If data is stale:

show stale.

If the period is incomplete:

show incomplete.

If the metric is not forecastable:

show not forecastable.

If data does not exist:

show unsupported/insufficient.

Do not create fake UI values.

=====================================================================
96. UX PRINCIPLE
=====================================================================

The workspace should answer these questions before the user spends an AI
call:

"What can I analyze?"

"What data exists?"

"How fresh is it?"

"What can be forecast?"

"Which dimensions are valid?"

"What is not supported?"

"Is this question obviously impossible?"

But it must NOT attempt to replace the V3.0 semantic engine.

=====================================================================
97. ANALYTICS VIEW SIZE RULE
=====================================================================

Do not increase AnalyticsView.tsx substantially.

If new behavior requires significant code:

extract it.

Keep orchestration thin.

=====================================================================
98. CHART LIBRARY RULE
=====================================================================

Current project uses custom SVG charts.

Do NOT add:

Recharts
Chart.js
ECharts
Highcharts
another chart framework

for V3.1.

Extend existing Charts.tsx/components.

=====================================================================
99. UI STYLE RULE
=====================================================================

Reuse project visual language:

Tailwind
primary emerald
soft shadows
rounded cards
Plus Jakarta Sans / Be Vietnam Pro
existing spacing

Avoid making the AI page look like a separate product.

=====================================================================
100. DOCUMENTATION
=====================================================================

Update:

data-platform/AI_V31_ANALYST_WORKSPACE_PLAN.md

and:

docs/SYSTEM_OVERVIEW.md

where appropriate.

The V3.1 plan file becomes the execution record.

Fill its acceptance section with:

implemented
deferred
not applicable
failed
verified

Do not silently delete uncompleted checklist items.

=====================================================================
101. BASELINE DOCUMENTATION
=====================================================================

If CLAUDE.md or Data Platform rule files maintain test baselines,
update them only after final verification.

Do not write incorrect "all tests pass" claims when baseline includes
known unrelated failures.

=====================================================================
102. FINAL CODE REVIEW
=====================================================================

Before reporting completion run:

git status --short

git diff --check

Review all changed files.

Search for accidental:

API keys

passwords

tokens

.env content

private connection strings

huge generated files

temporary screenshots

test databases

cache files

build output

Do not commit or push.

=====================================================================
103. DO NOT COMMIT / PUSH
=====================================================================

This is mandatory.

At the end:

DO NOT:

git add
git commit
git push
git merge

Instead provide a suggested commit message.

User will commit manually.

=====================================================================
104. EXECUTION ORDER
=====================================================================

Execute in this exact high-level order:

P0
Preparation and baseline

P1
Governed metadata expansion

P2
Capabilities API + cached data coverage + zero-call preflight

P3
Analyst Workspace UI

P4
Mission-aware dashboard

P5
Small existing analytics dashboard corrections

P6
Evaluation + documentation + acceptance

After EACH phase:

run targeted tests

record result

continue only if there is no new unexplained regression.

=====================================================================
105. STOP CONDITIONS
=====================================================================

STOP and ask the user before:

modifying original DB schema in:

init-db/*
migrations/*

performing destructive database operations

changing Kubernetes

changing AWS

changing unrelated application services

requiring more than 30 live provider calls

reading .env

changing secrets

rewriting Gold/Spark architecture substantially

merging branches

committing/pushing

A new safe Silver VIEW inside data-sync/sync.py is allowed by this plan.

=====================================================================
106. DO NOT STOP FOR NORMAL ENGINEERING DECISIONS
=====================================================================

Do NOT interrupt the user for:

normal component creation

safe tests

registry metadata

new non-sensitive Silver views

frontend refactor within scope

preflight implementation

capability API changes

mission metadata

deterministic UI formatting

oracle test creation

documentation updates

Make reasonable evidence-backed decisions.

=====================================================================
107. REQUIRED FINAL REPORT
=====================================================================

When complete, report in Vietnamese using this structure:

BRANCH:
<branch>

STARTING HEAD:
<sha>

WORKING TREE:
<summary>

V3.0 BASELINE:
analytics-api:
web-ui:
offline eval:

P1 METADATA:
PASS / PARTIAL / FAIL

New metrics:
<list>

New dimensions:
<list>

Deferred metrics:
<list + reason>

RISK WATCH:
PASS / PARTIAL / FAIL

Canonical risk metrics:
<list>

P2 CAPABILITIES:
PASS / PARTIAL / FAIL

Capabilities API:
<summary>

Data coverage cache:
<summary>

PREFLIGHT:
PASS / PARTIAL / FAIL

Provider calls during preflight:
0 expected

Preflight p95:
<value if measured>

Hard blocks:
<list>

Warnings:
<list>

P3 ANALYST WORKSPACE:
PASS / PARTIAL / FAIL

Mission picker:
Capability drawer:
Question template:
Preflight UI:
Scope/depth:
Removed redundant fields:
Suggestion chips:

P4 RESULT DASHBOARD:
PASS / PARTIAL / FAIL

Mission layouts:
KPI strip:
Grounded narrative:
Comparison charts:
Forecast chart:
Risk table:
Follow-up chips:

P5 EXISTING DASHBOARD:
PASS / PARTIAL / FAIL

Revenue scope:
Sales-channel unit:
Incomplete period:
Ask-AI bridge:

V3.0 REGRESSION:
PASS / FAIL

Shipper success regression:
<result>

Fail-fast regression:
<result>

Provider-call regression:
<result>

ANALYTICS API TESTS:
<count/pass/fail>

New failures:
<number>

WEB UI TESTS:
<count/pass/fail>

TYPECHECK:
PASS / FAIL

BUILD:
PASS / FAIL

DATA-SYNC TESTS:
<result>

OFFLINE SEMANTIC EVAL:
<result>

LIVE PROVIDER EVAL:
NOT RUN / result

LIVE PROVIDER CALLS:
<number>

BROWSER ACCEPTANCE:
<10 cases, each PASS/FAIL/NOT RUN>

KNOWN REMAINING LIMITATIONS:
<list>

DEFERRED ITEMS:
<list>

FILES CHANGED:
<summary>

GIT DIFF CHECK:
PASS / FAIL

COMMIT:
NOT PERFORMED

PUSH:
NOT PERFORMED

SUGGESTED COMMIT MESSAGE:
<message>

=====================================================================
108. FINAL SUCCESS DEFINITION
=====================================================================

Do NOT declare V3.1 complete merely because code builds.

V3.1 is complete when:

1. V3.0 semantic truth remains intact.

2. User can discover supported analytical capabilities.

3. User can select one of the eight missions.

4. Mission templates only expose valid metric/dimension combinations.

5. Preflight performs zero provider calls.

6. Preflight does not synchronously query the warehouse.

7. Data coverage is visible.

8. Batch freshness is visible.

9. Unsupported requests are warned deterministically.

10. Sensitive requests are blocked before AI calls.

11. The old Context/Expectation fields are removed from normal UI.

12. Mission-aware result dashboards work.

13. Risk Watch uses canonical metrics only.

14. Forecast visualization uses deterministic V3.0 forecast outputs.

15. Existing dashboard scope/unit issues are corrected.

16. Existing V3.0 shipper success case still passes.

17. No new unexplained test regression exists.

18. All mandatory offline tests have run.

19. UI acceptance is verified or explicitly marked NOT RUN.

20. Documentation is updated.

21. No secrets were exposed.

22. No Git commit/push was performed.

=====================================================================
109. FINAL PRODUCT PRINCIPLE
=====================================================================

Do NOT optimize V3.1 for:

"show more AI features".

Optimize for:

"make the analytical system understandable before the AI is called."

The ideal product flow is:

DATA COVERAGE
      ↓
ANALYTICAL CAPABILITIES
      ↓
ANALYSIS MISSION
      ↓
QUESTION / GUIDED TEMPLATE
      ↓
DETERMINISTIC PREFLIGHT
      ↓
VALIDATED USER REQUEST
      ↓
V3.0 SEMANTIC INTERPRETATION
      ↓
CANONICAL CAPABILITY RESOLUTION
      ↓
SECURE READ-ONLY EXECUTION
      ↓
VERIFIED RESULT
      ↓
MISSION-AWARE DASHBOARD
      ↓
DETERMINISTIC FOLLOW-UP OPTIONS

The LLM interprets language.

The registry owns business meaning.

The warehouse owns numerical truth.

The compiler owns SQL.

The server owns validation.

The workspace makes all of that understandable to the user.

=====================================================================
110. BEGIN EXECUTION
=====================================================================

Begin now.

First:

1. inspect Git state
2. confirm branch_thaian
3. preserve all existing V3.0 uncommitted changes
4. read repository rules and V3.0 docs
5. run P0 baseline
6. update/normalize AI_V31_ANALYST_WORKSPACE_PLAN.md with the clarified
   rules from this prompt
7. then execute P1 → P6

Do not stop after producing another plan.

Continue implementing phase by phase.

Only stop for one of the explicit STOP conditions above.

After implementation:

run /verify-changes

and produce the required Vietnamese final report.
=====================================================================
EXECUTION RECORD — V3.1 (16/10/2026, branch_thaian, HEAD 9ab6d638)
=====================================================================

## Quy tắc đã chuẩn hoá khi thực thi
- Preflight chỉ chặn cứng: privacy_blocked, question_too_long, structurally_invalid_input. Giới hạn có thể sửa (dự báo, thời gian,
  khái niệm chưa hỗ trợ, quá nhiều mục tiêu) là WARN; INFO: no_metric_detected, ambiguous_metric, mission_hint_only, mission_caveat,
  time_partially_covered. Backend V3.0 vẫn là nơi quyết định cuối.
- Preflight: 0 lượt provider, 0 truy vấn kho (registry trong bộ nhớ + layout đã cache + DataCoverageSnapshot do luồng nền làm mới 60s).
- Mission là gợi ý UX (bố cục, tab, câu hỏi tiếp theo), không vào ngữ cảnh LLM, không đổi số liệu.

## P0 — Baseline (đo thực tế trước khi sửa)
| Hạng mục | Kết quả |
|---|---|
| analytics-api `tools.run_tests_v29` | 810 test, 3 fail + 1 error: test_default_native_budget_blocks_reentry_without_reset, test_distribution_and_correlation_observational, test_native_provider_gemini_signature_and_groq_fallback, test_native_transport_failure_never_retries_or_falls_back |
| web-ui node test | 124 test, 1 fail ("question-only submission has auto constraints and deep default"); typecheck + build đạt |
| Eval offline V3.0 | 113 ca; domain 86/88, metric 85/88, hồi quy shipper 6/6, biên dịch 83/83, từ chối dự báo 3/3 |
| data-sync | 3/3 |

## Bảng nghiệm thu (implemented / deferred / not applicable / failed / verified)
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| order_cancellation_rate, order_completion_rate (mẫu số = đơn đã kết thúc HOAN_THANH+DA_HUY theo vòng đời order-service) | implemented + verified | oracle sqlite + kho thật khớp (theo loại điểm bán; hoàn thành 96,00%) |
| weekday (EXTRACT(ISODOW) qua expression có quản trị, không sửa sync.py) | implemented + verified | doanh thu theo thứ khớp oracle trên kho thật; không dùng enum số (tránh "top 5" thành thứ 5) |
| region (chi_nhanh → khu_vuc) | DEFERRED | chỉ 1/1215 chi nhánh có khu_vuc_id; view silver không lộ khóa — thêm sẽ cho kết quả gần như toàn NULL |
| silver.khuyen_mai_su_dung + promotion_redemption_count | implemented + verified | view mới (không mã khách, không mã đơn); 4013 lượt khớp oracle; data-sync 5/5 |
| new_customer_count / returning_customer_rate | DEFERRED | cần lịch sử đơn trước kỳ (cohort) — compiler không biểu diễn được nếu không thêm SQL tùy ý |
| source_scope 6 mart gold còn lại | implemented | FULL_AGGREGATE + caveat (payment_methods doanh thu gồm đơn hủy; menu/stores có giá trị mặc định trình bày) |
| late_shift_rate (DI_TRE / DUNG_GIO+DI_TRE+VE_SOM; NGHI_PHEP thêm vào enum) | implemented + verified | 8,98% = oracle kho thật |
| large_cash_discrepancy_shift_count (\|chênh lệch\| > 500.000đ, ngưỡng mặc định) | implemented | 0 ca trên kho thật = oracle |
| Risk Watch 6 tín hiệu, không điểm tổng hợp, server tính trạng thái | implemented + verified | /api/ai/risk-watch, 0 lượt AI; breakdown luôn chạy để không bị số tổng che |
| Gold shipper_performance | not applicable (giữ cách ly V3.0) | metric chuẩn vẫn từ silver.giao_hang (95,73% = oracle V3.0); mart Top-N chỉ dashboard |
| Validator mở rộng (mission, risk, ngưỡng, hướng, khoảng, dimension phái sinh, snapshot + lịch sử join) | implemented | test_workspace_v31 |
| Eval: +33 ca V3.1 (semantic_cases_v31.json) | implemented | tập V3.0 không đổi; V3.1 truy hồi 24/25, biên dịch 25/25, preflight 17/17 |
| Capabilities: missions/limits/data_coverage/unsupported/risk_signals/metric metadata | implemented | giữ nguyên trường cũ; coverage đọc snapshot cache |
| POST /api/ai/preflight (rate limit 40/10s theo browser) | implemented + verified | p95 < 50ms (đo ~10ms), test chặn HTTP/psycopg2/introspection |
| analysis_mission (request → diagnostics → dashboard_plan → mission_layout, follow_up_questions) | implemented | test không đổi số liệu |
| UI: coverage bar, 8 mission, mẫu câu hỏi, "Hỏi được gì?", preflight debounce 400ms + huỷ request cũ, Thời gian/Phạm vi/Độ sâu, bỏ Ngữ cảnh/Mong muốn | implemented + verified (trình duyệt headless) | |
| Dashboard theo mission: bối cảnh, KPI strip, 3 điểm nổi bật, tab Dự báo, chênh lệch A/B, "Định nghĩa chỉ số"/"Xem dữ liệu", câu hỏi tiếp theo | implemented | báo cáo thật cần gọi AI → chưa kiểm trên trình duyệt |
| ForecastPanel: lịch sử + dự báo + dải 80% + backtest + độ mới | implemented | trước đây không hiển thị ở báo cáo V3 (chỉ nhánh legacy) — đã sửa |
| P5: nhãn kỳ KPI, đơn vị "đơn", ngày chưa trọn + khoảng trống dữ liệu, bỏ chuỗi "kỳ trước" giả (revenue×0,88), bỏ câu bịa "Liên tục 100%", sửa phép chia doanh thu TB ngày, "Hỏi trợ lý AI về biểu đồ này", header "Cập nhật theo đợt" | implemented + verified (trình duyệt) | |
| V3.0-A "Chỉ số hạnh phúc" | implemented ở preflight (unsupported_concept + gần nhất) | không đưa vào unsupported_capabilities của LLM vì làm đổi luồng V3.0 (test hồi quy) |
| V3.0-E env DATA_ANALYST_MAX_SEMANTIC_REPAIRS sai → readiness | implemented | test |
| V3.0-F/70 độ mới dự báo | implemented | forecast_data_stale (preflight) + ForecastPanel ghi chú |
| V3.0-B live suite, V3.0-I kiểm thủ công thẻ lỗi | NOT RUN | cần lượt AI thật / quyền người dùng |
| V3.0-C, D, G | deferred | không thuộc đường đi V3.1; giữ ghi nhận V3.0 |

## Nghiệm thu trình duyệt (Chrome headless, 0 lượt AI)
1 PASS · 2 PASS (16 nhóm, badge, tìm kiếm, mục chưa hỗ trợ) · 3 PASS (2 cảnh báo + quick fix, không chặn) · 4 PASS (chặn, nút tắt) ·
5 PASS · 6 PARTIAL (bộ dựng câu hỏi PASS; báo cáo cần LLM → NOT RUN) · 7 NOT RUN (cần LLM) · 8 PASS (Risk Watch kiosk tháng 9) ·
9 NOT RUN trên trình duyệt (cần LLM) — đã kiểm oracle compiler trên kho thật · 10 PASS (nhãn kỳ, đơn vị đơn, ngày chưa trọn, cầu nối hỏi AI).

## Quyết định đã tự đưa ra
- Ngân sách planner one-shot cũ (chỉ test lưu trữ): manifest 12.000→14.000 (mặc định + test), context test 32.000→34.000; biên trước đó chỉ còn 357 ký tự.
- Cập nhật số kiểm kê ghim trong test (43 metric, 44 lens, 18 subject) và 4 test form web-ui theo hành vi V3.1; test "deep default" nay đạt vì mặc định khớp server.
- Kết quả eval V3.1 ghi vào evaluation/v31/ (lần chạy baseline đã ghi lại evaluation/v30/semantic_offline.json với số liệu không đổi).
- Dùng lại playwright-core có sẵn trên máy (không cài) để nghiệm thu headless.

## Kiểm chứng cuối
| Hạng mục | Kết quả |
|---|---|
| analytics-api `tools.run_tests_v29` | 875 test; 3 fail + 1 error — đúng 4 lỗi baseline P0; 0 lỗi mới |
| `tests.test_workspace_v31` (store memory) | 50/50 |
| web-ui | typecheck đạt; node test 136/136; build đạt |
| Eval offline | 146 ca; tập V3.0 giữ nguyên baseline; V3.1: truy hồi 24/25, biên dịch 25/25, từ chối dự báo 3/3, preflight 17/17 |
| data-sync | 5/5 |
| Live provider | NOT RUN (0 lượt gọi) |
| Review độc lập (code-reviewer) | không có lỗi chặn; đã sửa: rate limit risk-watch, khoá rate limit theo browser_owner, breakdown luôn chạy, kết quả rủi ro cũ/không đồng bộ ở UI, 422 cho thời gian sai, bỏ COUNT(*) trong coverage, forecast null an toàn |
| Rủi ro còn lại | mission dính theo phiên khi refine (chỉ bố cục); nhãn đơn vị dự báo trong preflightPresentation cố định (server đã có phrases.cadence); "Món nào được đánh giá cao nhất?" vẫn hụt truy hồi (lỗi V3.0) |

## Live provider (được người dùng cho phép, trần ≤30 lượt) — đã dùng 16 lượt (Gemini gemini-3.5-flash-lite)
| Kịch bản | Lượt | Kết quả |
|---|---|---|
| 6 So sánh (câu từ template, lần 1: "…giữa HCM và Hà Nội…") | 3 | FAIL → template thiếu "theo {chiều}" như PLAN mô tả; đã sửa template governed |
| 6 So sánh (lần 2: "…theo thành phố giữa…") | 1 | PASS — mission So sánh, phạm vi HCM/HN, 09/2026, "Hồ Chí Minh cao hơn 60,7%" (đã tự đối chiếu số), KPI, điểm nổi bật, câu tiếp theo |
| 7 Dự báo doanh thu 3 tháng | 1+1 | PASS — panel dự báo (lịch sử, dải 80%, backtest); phát hiện KPI "biến động −96,7%" so tháng 10 chưa trọn → đã sửa (as_of) |
| 9 Tỷ lệ hủy đơn theo chi nhánh | 1+1 | PASS — đơn vị %, điều kiện Hoàn thành/Đã hủy, đường compiler |
| 9 Doanh thu theo thứ | 1+1 | PASS — EXTRACT(ISODOW); phát hiện bảng hiện 1…7 → đã sửa hiển thị nhãn; LLM chọn thêm 5 biến thể "doanh thu" (mơ hồ có sẵn) |
| 90 Shipper (hồi quy V3.0) | 1+2+2 | FAIL live 3/3 (hỏi lại; ID requirement 41 ký tự > 40; timeout nhà cung cấp) — gói ngữ cảnh giống hệt V3.0, oracle offline 6/6 và kho thật 95,73% vẫn đạt |
| 91 "Chỉ số hạnh phúc" | 1 | metric_ambiguous (đúng mục V3.0-A còn mở; preflight V3.1 đã cảnh báo unsupported_concept trước khi gọi) |
| Live smoke eval | 0 | NOT RUN: tự từ chối vì ước tính xấu nhất 24 > trần còn lại 14 |

Sửa sau live (có test): template so sánh; `analytical_features(as_of)` đóng khoảng thời gian mở tại ngày tham chiếu (pipeline, verifier, response cùng dùng);
UI đánh dấu kỳ đang diễn ra khi khoảng mở; bảng kết quả hiển thị nhãn có quản trị (Thứ Hai…Chủ nhật).
Đề xuất (chưa làm, ngoài phạm vi V3.1): chuẩn hoá ID requirement quá dài phía server thay vì tốn lượt sửa; alias "tỷ lệ giao hàng thành công" để anchor tất định cho câu shipper.

## Kiểm chứng cuối (sau sửa từ live)
analytics-api 876 test, đúng 4 lỗi baseline, 0 lỗi mới · test_workspace_v31 51/51 · web-ui 138/138, typecheck + build đạt · git diff --check đạt (CRLF).
