# =====================================================================
# MASTER IMPLEMENTATION PROMPT
#
# AVENGERS COFFEE DATA PLATFORM AI V3.2
# "MISSION-DRIVEN RELIABLE ANALYST"
#
# RELIABLE INPUT → GOVERNED PLAN → RELEVANT ANALYSIS → MEASURABLE TRUST
#
# Date: 2026-10-16
# Branch: branch_thaian
# Scope: data-platform/
#
# IMPORTANT:
# V3.0 and V3.1 ALREADY EXIST.
# DO NOT REWRITE THEM.
# THIS PHASE HARDENS THE PRODUCT BEHAVIOR OBSERVED DURING REAL MANUAL UI TESTING.
# =====================================================================


=====================================================================
0. CONTEXT — READ THIS FIRST
=====================================================================

You are continuing an existing Avengers Coffee Data Platform AI system.

This is a NEW Claude Code session.

Do NOT start from scratch.

The current branch already contains:

V3.0:
- governed semantic truth
- server-owned metric definitions
- typed failure taxonomy
- bounded semantic repair
- provider-call budgeting
- source_scope semantics
- registry drift validation
- deterministic forecasting
- delivery success canonical metric
- fail-fast behavior

V3.1:
- Analyst Workspace
- eight Analysis Missions
- capability discovery
- deterministic preflight
- Data Coverage
- Risk Watch
- guided question templates
- mission-aware dashboard foundations
- workspace components
- additional governed metrics and dimensions

The current production branch to work on is:

branch_thaian

The current remote commit at the beginning of this task may be near:

36827fa16e4f08a1d3da6e5fb6784e17c43e685e

but DO NOT assume this SHA if the working tree has moved.

Verify actual Git state first.


=====================================================================
1. ABSOLUTE GIT SAFETY
=====================================================================

Run first:

pwd
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline --decorate -8

Expected branch:

branch_thaian

DO NOT work on:

features_k8s
main

DO NOT:

git reset
git reset --hard
git clean
git stash user changes
git rebase
git merge
git checkout over local work
git force push

Do not commit or push unless the user explicitly asks in this session.

Preserve all current V3.0/V3.1 work.


=====================================================================
2. SECRET SAFETY
=====================================================================

Do NOT read:

.env

Do NOT print:

API keys
database passwords
tokens
cookies
AWS credentials
private connection strings

You may inspect:

.env.example
docker-compose configuration
provider configuration CODE
environment VARIABLE NAMES

but never secret values.


=====================================================================
3. REQUIRED STARTING REVIEW
=====================================================================

Before editing code, read at minimum:

CLAUDE.md
.claude/rules/data-platform.md

data-platform/AI_V30_SEMANTIC_TRUTH.md
data-platform/AI_V31_ANALYST_WORKSPACE_PLAN.md

data-platform/analytics-api/services/preflight_service.py
data-platform/analytics-api/services/workspace_service.py
data-platform/analytics-api/services/hybrid_analyst_planner.py
data-platform/analytics-api/services/semantic_candidate_service.py
data-platform/analytics-api/services/request_anchors.py
data-platform/analytics-api/services/analysis_intent.py
data-platform/analytics-api/services/analytical_resolver.py
data-platform/analytics-api/services/analysis_catalog.py
data-platform/analytics-api/services/analysis_query.py
data-platform/analytics-api/services/dashboard_planner_service.py
data-platform/analytics-api/services/derived_chart_service.py
data-platform/analytics-api/services/analysis_quality_service.py
data-platform/analytics-api/services/verification_score.py
data-platform/analytics-api/services/error_taxonomy.py
data-platform/analytics-api/services/provider_budget.py
data-platform/analytics-api/services/agent_provider.py

data-platform/web-ui/src/components/workspace/**
data-platform/web-ui/src/components/Charts.tsx
data-platform/web-ui/src/views/AnalyticsView.tsx
data-platform/web-ui/src/utils/*.mjs

Read current tests relevant to those files.

Do not modify anything during the initial review.


=====================================================================
4. INCIDENTS OBSERVED DURING REAL MANUAL UI TESTING
=====================================================================

The user tested the deployed V3.1 UI manually.

These are REAL PRODUCT INCIDENTS.
They are not hypothetical.

You must reproduce them with tests before fixing them where practical.


---------------------------------------------------------------------
INCIDENT A — GIBBERISH IS DISPLAYED AS VALID
---------------------------------------------------------------------

Example input:

"dsdasds"

Current UI can display:

"Câu hỏi hợp lệ để lập kế hoạch"

even though no analytical concept has been recognized.

This is misleading.

A deterministic preflight is NOT allowed to claim a question is
semantically valid merely because it did not hit a privacy or forecast
block.

Fix the product semantics.


---------------------------------------------------------------------
INCIDENT B — MISSION SWITCH RETAINS OLD QUESTION
---------------------------------------------------------------------

Observed flow:

1. user selects "So sánh"
2. enters:
   "So sánh doanh thu theo thành phố giữa Hồ Chí Minh và Hà Nội..."
3. user changes tab to:
   "Xếp hạng"
4. the old comparison question remains
5. preflight displays:
   mission = ranking

This creates a contradictory state:

selected mission = ranking
question meaning = comparison

Mission switching must create a mission-consistent workspace.

Do not silently relabel the old question as belonging to another mission.


---------------------------------------------------------------------
INCIDENT C — GENERIC SCOPE CONTROLS DO NOT MATCH EACH MISSION
---------------------------------------------------------------------

The current generic Time / Scope / Depth controls are shown across
missions.

Example:

Risk Watch can still show a generic "Sản phẩm" scope.

But each mission has a different analytical contract.

Examples:

Compare requires:
- metric
- dimension
- A
- B
- time

Ranking requires:
- metric
- dimension
- Top/Bottom N
- time

Trend requires:
- metric
- cadence
- period
- optional compatible scope

Forecast requires:
- forecastable metric
- horizon
- cadence
- optional supported single scope
- no grouped forecast if unsupported

Risk requires:
- risk population/scope
- time
- governed risk signals

Relationship requires:
- metric A
- metric B
- shared grain/dimension
- time

The UI must reflect mission-specific analytical scope.


---------------------------------------------------------------------
INCIDENT D — PREFLIGHT PASSES BUT PLANNER FAILS TO RESOLVE
---------------------------------------------------------------------

Observed example:

"Phân tích xu hướng doanh thu theo tuần trong tháng 9 năm 2026"

Preflight identifies:

Doanh thu
time range
mission = trend

but planner later reports that it could not put a requested metric into
the executable plan and lists several revenue-like metrics.

This means the preflight semantic interpretation and planner semantic
interpretation disagree.

That is unacceptable when the preflight has already resolved a
high-confidence canonical metric.


---------------------------------------------------------------------
INCIDENT E — GENERIC REVENUE ALIAS COLLISION
---------------------------------------------------------------------

Current UI can display behavior similar to:

"Doanh thu · +5 chỉ số cùng tên"

For an unqualified request such as:

"doanh thu"

the governed semantic layer needs a stable primary canonical meaning.

Specialized metrics such as:

product revenue
branch revenue
promotion-order revenue
payment-related revenue

must not all compete equally with the generic business concept
"doanh thu".

The system needs explicit alias priority / canonical anchors.


---------------------------------------------------------------------
INCIDENT F — FORECAST MAY FAIL THEN SUCCEED ON RETRY
---------------------------------------------------------------------

Observed:

"Dự báo doanh thu 3 tháng tới"

One attempt may fail during AI interpretation/provider behavior,
while retry can later succeed.

This creates "retry until lucky" UX.

V3.0 explicitly tried to remove that behavior.

A structured forecast request generated by the mission builder should
not require an LLM to rediscover information the UI already knows.


---------------------------------------------------------------------
INCIDENT G — RISK WATCH PRODUCES IRRELEVANT CHARTS
---------------------------------------------------------------------

Observed Risk Watch execution produced charts such as:

- product revenue by week
- product revenue by category
- product revenue by city
- product composition

These are not inherently risk signals.

A chart that is not connected to the user's risk question must not be
shown merely because it is analytically available.

Risk Watch needs mission-enforced evidence relevance.


---------------------------------------------------------------------
INCIDENT H — CHARTS DO NOT EXPLAIN WHY THEY MATTER
---------------------------------------------------------------------

The user sees charts but cannot easily answer:

- Why is this chart here?
- Which part of my question does it answer?
- What is the key finding?
- What should I pay attention to?
- What caveat applies?

Every chart must become an analytical evidence block,
not just a visualization.


---------------------------------------------------------------------
INCIDENT I — INTERNAL VERIFICATION SCORE LOOKS LIKE AI ACCURACY
---------------------------------------------------------------------

The UI can display a value such as:

86.8 / 100

under verification/accuracy language.

The current weighted score is an INTERNAL COMPLETENESS /
VERIFICATION-COVERAGE score.

It is NOT a calibrated probability that the AI answer is correct.

Do not present it as "accuracy".

We need real, independently measured accuracy where possible.


---------------------------------------------------------------------
INCIDENT J — VERIFICATION UI CLUTTERS THE REPORT
---------------------------------------------------------------------

The user wants the normal analytical report to remain clean.

Verification, provenance, SQL, reconciliation and accuracy methodology
should live in a separate dedicated area/tab.

The main report should focus on:

- business answer
- KPIs
- relevant charts
- analysis
- caveats
- recommendations / next questions

Technical trust details should be accessible but separated.


---------------------------------------------------------------------
INCIDENT K — PROVIDER QUOTA / KEY RELIABILITY
---------------------------------------------------------------------

There are multiple Gemini credentials in the overall project.

If the dedicated Data Platform Gemini credential is exhausted or rate
limited, the user authorizes using the existing Chatbot Gemini credential
AS A SECONDARY CREDENTIAL ONLY.

IMPORTANT:

DO NOT modify Chatbot business logic.

DO NOT route Data Platform requests through the Chatbot service.

DO NOT expose or hard-code the Chatbot key.

Use only environment/secret injection.

This is credential failover, NOT semantic/model failover.


=====================================================================
5. PRIMARY PRODUCT GOAL
=====================================================================

Transform V3.1 into:

MISSION-DRIVEN RELIABLE ANALYST

The system should behave like a professional governed BI / Data Analyst
workspace.

The desired experience is:

USER CHOOSES ANALYTICAL MISSION
        ↓
MISSION DEFINES VALID ANALYTICAL SHAPE
        ↓
USER CHOOSES GOVERNED FIELDS OR TYPES NATURAL LANGUAGE
        ↓
PREFLIGHT CLASSIFIES INPUT HONESTLY
        ↓
GUIDED REQUEST:
DETERMINISTIC CONTRACT, NO LLM REQUIRED
        ↓
FREE TEXT:
LLM INTERPRETS ONLY WHAT REMAINS UNKNOWN
        ↓
SERVER VALIDATES CANONICAL CONTRACT
        ↓
READ-ONLY QUERY EXECUTION
        ↓
MISSION-RELEVANT EVIDENCE ONLY
        ↓
EACH CHART EXPLAINS ITS RELEVANCE
        ↓
BUSINESS REPORT
        ↓
SEPARATE VERIFICATION / PROVENANCE TAB


=====================================================================
6. PRODUCT INSPIRATION / DESIGN PRINCIPLES
=====================================================================

Apply proven patterns commonly used by governed BI / analytics tools
such as semantic-layer-based Explore workflows and assisted analytics.

Do NOT clone another product.

Use these principles:

1. GOVERNED SEMANTIC LAYER
   Users explore metrics/dimensions defined by the server.

2. GUIDED ANALYSIS FIRST
   Common analytical tasks should not require free-form AI interpretation.

3. NATURAL LANGUAGE AS AN ASSISTANT
   LLM interprets language where needed;
   it does not own metric truth.

4. QUERY / METRIC TRANSPARENCY
   Users can inspect definitions and provenance.

5. MISSION-SPECIFIC VISUAL GRAMMAR
   Chart type comes from analytical purpose.

6. EVIDENCE-BASED STORYTELLING
   Every visible chart must support a question requirement.

7. TRUST SEPARATION
   Business report and technical verification are separate views.

8. NO FAKE PRECISION
   Never label an internal weighted score as factual AI accuracy.


=====================================================================
7. NON-NEGOTIABLE V3.0/V3.1 INVARIANTS
=====================================================================

Preserve:

- server-owned semantic truth
- server-side SQL compiler
- read-only analytical execution
- allowlisted Silver analytical sources
- governed joins
- source scope checks
- statement timeout
- typed errors
- bounded repairs
- deterministic forecasting
- provider-call budget
- sensitive-data blocking
- no arbitrary LLM SQL
- no retry-until-success
- no phrase-specific patchwork regex

Do not regress:

delivery_success_rate
order_cancellation_rate
order_completion_rate
late_shift_rate
Risk Watch governance
Data Coverage cache
preflight 0-call behavior


=====================================================================
8. NEW V3.2 CORE CONCEPT — TWO INPUT MODES
=====================================================================

V3.2 must explicitly support TWO input modes.


---------------------------------------------------------------------
MODE A — GUIDED CONTRACT
---------------------------------------------------------------------

When the user uses mission UI controls:

metric
dimension
group A/B
ranking N
time
forecast horizon
scope
etc.

the frontend ALREADY KNOWS canonical IDs.

Do NOT convert those canonical IDs to Vietnamese text,
send them to Gemini,
and ask Gemini to rediscover them.

Instead submit a structured object.

Conceptually:

{
  "input_mode": "guided",
  "question": "...human-readable question...",
  "analysis_mission": "forecast",
  "guided_contract": {
    "metric_id": "revenue",
    "cadence": "month",
    "horizon": 3,
    "time": {...},
    "scope": {...}
  }
}

The server MUST validate every field against the governed registry.

Then construct the analytical intent deterministically.

Provider calls:

0

for a fully guided request.


---------------------------------------------------------------------
MODE B — FREE TEXT
---------------------------------------------------------------------

When the user types an original natural-language question:

input_mode = free_text

Use:

preflight
canonical anchors
candidate packet
LLM interpretation
server semantic validation

Provider call normally:

1 logical semantic call

with bounded repair only where existing V3.0 policy allows.


=====================================================================
9. GUIDED CONTRACT SECURITY
=====================================================================

Never trust frontend canonical IDs.

Server validates:

mission exists

metric exists

metric allowed for mission

dimension compatible with metric

group values valid

time valid

scope valid

forecast allowed

risk signal valid

ranking bounds valid

relationship metrics share a valid grain

No frontend-generated SQL.

No compiler bypass.


=====================================================================
10. GUIDED QUESTION EDIT INVALIDATION
=====================================================================

If the user fills a question using the structured builder:

guided_contract is active.

If the user then manually edits the generated question text:

invalidate the guided contract.

Switch to:

free_text

or explicitly ask:

"Bạn đã chỉnh sửa câu hỏi. Dùng câu hỏi tự do hay giữ cấu hình đã chọn?"

Do not silently execute a structured contract that no longer matches the
visible question.


=====================================================================
11. MISSION SWITCH MUST RESET MISSION STATE
=====================================================================

Current behavior is wrong.

When changing from one mission to another:

CLEAR:

question draft for the old mission
preflight result
risk result
approved plan
stale report state
mission-specific scope
mission-specific selectors

Then initialize the new mission with its own defaults.

Preferred implementation:

maintain independent draft state per mission OR create a new clean draft.

But NEVER automatically reuse the old mission's question under the new
mission.

Example:

Compare → Ranking

must NOT result in:

mission = ranking
question = "So sánh ..."

unless the user intentionally re-enters it.


=====================================================================
12. OPTIONAL FREE-TEXT MODE
=====================================================================

If useful for UX, add a neutral option:

"Câu hỏi tự do"

outside the eight governed missions.

This mode may preserve arbitrary user questions.

The eight mission tabs themselves should remain mission-scoped.

Do not let mission selection become a meaningless visual decoration.


=====================================================================
13. MISSION INPUT CONTRACTS
=====================================================================

Create a server-governed MissionInputContract.

The frontend must render controls from it.

Do not use one generic ScopeDepthBar for all missions.

Each mission declares:

required slots
optional slots
compatible metrics
compatible dimensions
valid scopes
valid time controls
valid depth
valid chart roles
required evidence roles


=====================================================================
14. OVERVIEW CONTRACT
=====================================================================

Required:

metric or governed business topic
time

Optional:

scope
depth

Output priority:

KPIs
trend
one meaningful breakdown
one meaningful ranking

Avoid excessive composition charts.


=====================================================================
15. COMPARE CONTRACT
=====================================================================

Required:

metric
comparison dimension
group A
group B
time

Optional:

scope

Must not submit until A and B are valid and different.

Outputs:

A KPI
B KPI
absolute gap
percentage gap where valid
comparison chart
supporting table


=====================================================================
16. RANKING CONTRACT
=====================================================================

Required:

metric
dimension
N
direction
time

Optional:

scope

Outputs:

ordered ranking
horizontal bar
rank table
contribution only if semantically valid


=====================================================================
17. TREND CONTRACT
=====================================================================

Required:

metric
granularity
time range

Optional:

scope

Outputs:

time series
period-over-period changes where valid
partial-period markers

Do not add unrelated compositions unless explicitly requested.


=====================================================================
18. COMPOSITION CONTRACT
=====================================================================

Required:

additive or valid ratio-compatible metric
dimension
time

Output:

part-to-whole chart ONLY when mathematically valid.

If cardinality is high:

top groups + Other
or horizontal bar

Do not force donut for dozens of categories.


=====================================================================
19. FORECAST CONTRACT
=====================================================================

Required:

forecastable metric
cadence
horizon

Optional:

one supported scope filter

No grouped forecast unless server capability explicitly supports it.

A fully structured forecast must execute with:

0 LLM calls.

The deterministic V3.0 forecasting engine owns values.


=====================================================================
20. RISK WATCH CONTRACT
=====================================================================

Required:

risk population/scope
time

Optional:

selected governed risk signals

Allowed metrics:

ONLY metrics referenced by governed risk signal definitions
or directly necessary supporting denominators/evidence.

Risk Watch MUST NOT automatically produce:

product revenue
product category composition
general sales charts

unless the user explicitly asks a separate sales-risk relationship and
the registry supports that analysis.


=====================================================================
21. RELATIONSHIP CONTRACT
=====================================================================

Required:

metric A
metric B
shared grain/dimension
time

Output:

scatter
descriptive relationship statistics

No causal claims.

Always disclose:

"Correlation does not imply causation."


=====================================================================
22. PREFLIGHT STATUS MODEL MUST CHANGE
=====================================================================

The current binary idea:

"valid / invalid"

is insufficient.

Implement explicit states:

READY_GUIDED
READY_FOR_AI
NEEDS_INPUT
BLOCKED
CHECKING


---------------------------------------------------------------------
READY_GUIDED
---------------------------------------------------------------------

All required canonical fields are known.

No provider needed.

UI label:

"Đã đủ thông tin để phân tích"


---------------------------------------------------------------------
READY_FOR_AI
---------------------------------------------------------------------

Request is business-analytical and safe,
but natural language still needs AI interpretation.

UI label:

"Có thể gửi để AI diễn giải"

DO NOT label this:

"Câu hỏi hợp lệ"

because the semantic plan does not exist yet.


---------------------------------------------------------------------
NEEDS_INPUT
---------------------------------------------------------------------

The request is plausibly analytical but lacks a required target.

Examples:

"so sánh giúp tôi"
"cửa hàng nào tốt nhất?"

UI must explain what is missing.


---------------------------------------------------------------------
BLOCKED
---------------------------------------------------------------------

Examples:

gibberish
privacy violation
structurally impossible request
question too long


=====================================================================
23. FIX GIBBERISH ACCEPTANCE
=====================================================================

Input:

"dsdasds"

must NOT produce:

"Câu hỏi hợp lệ để lập kế hoạch"

Create deterministic recognition confidence based on governed signals.

Use:

registry aliases
mission intent vocabulary
business subject anchors
dimensions
time anchors
known analytical operators

Do NOT create phrase-specific hard-coded sentence patches.

A free-text request should require at least meaningful analytical/business
signal before READY_FOR_AI.

If there is effectively no recognized business/analytical signal:

finding code:

unrecognized_question

state:

BLOCKED

message:

"Chưa nhận ra nội dung phân tích dữ liệu trong câu hỏi."

No provider call.


=====================================================================
24. DO NOT OVER-BLOCK NATURAL LANGUAGE
=====================================================================

Examples such as:

"hôm nay bán được bao nhiêu?"
"món nào bán chạy?"
"chi nhánh nào đang kém?"
"tháng này tình hình sao?"

may be valid natural language.

Use governed aliases and business vocabulary.

Do not require formal BI terminology.

Tests must include casual Vietnamese.


=====================================================================
25. MISSION MISMATCH DETECTION
=====================================================================

If selected mission and high-confidence question intent disagree:

Example:

selected = ranking

question =
"So sánh doanh thu Hồ Chí Minh và Hà Nội"

return:

mission_mismatch

with quick actions:

"Chuyển sang So sánh"
"Viết lại câu hỏi cho Xếp hạng"

Do not silently set:

Nhiệm vụ: Xếp hạng

and proceed.


=====================================================================
26. MISSION MISMATCH POLICY
=====================================================================

For mission tabs:

mission mismatch should block guided execution until resolved.

For free-text mode:

the server may infer the appropriate mission.

Selected mission must have real semantics,
not merely presentation metadata.


=====================================================================
27. CANONICAL ALIAS PRIORITY
=====================================================================

Fix generic metric ambiguity.

Introduce explicit alias classes where appropriate:

canonical_aliases
qualified_aliases
non_anchor_aliases

or equivalent server-owned mechanism.

Example:

generic exact phrase:

"doanh thu"

should strongly anchor:

revenue

Specialized metrics require qualifiers such as:

"doanh thu sản phẩm"
"doanh thu chi nhánh"
etc.

Do not display:

"Doanh thu +5 chỉ số cùng tên"

as though all candidates have equal meaning.


=====================================================================
28. ALIAS COLLISION VALIDATOR
=====================================================================

Registry validation must detect:

multiple metrics claiming the same exclusive canonical alias

Ambiguous non-exclusive aliases are allowed only when explicitly marked.

Add tests.

Generic canonical anchors should be deterministic.


=====================================================================
29. PREFLIGHT CONTRACT MUST FLOW INTO PLANNER
=====================================================================

Current problem:

preflight recognizes one meaning,
planner can later start from scratch and choose another meaning.

Fix that.

Preflight should produce a protected SemanticPreflightContract:

canonical metric candidates
selected high-confidence metric
dimensions
time
mission
scope
forecast
explicit user constraints
confidence
unresolved ambiguity

The planner receives this contract.

High-confidence explicit facts must be LOCKED.

LLM may fill only unresolved fields.


=====================================================================
30. SEMANTIC LOCK RULE
=====================================================================

If preflight confidently resolves:

metric = revenue

because the user explicitly said generic canonical "doanh thu",

the LLM must not replace it with:

product_revenue
branch_revenue
promotion_revenue

unless the user explicitly supplied that qualifier.

Server rejects such drift.


=====================================================================
31. PLAN CONSISTENCY VALIDATOR
=====================================================================

Before query compilation, compare:

user question
selected mission
preflight contract
LLM intent
resolved analytical spec

Validate:

metric coverage
dimension coverage
time coverage
scope coverage
mission compatibility
forecast compatibility

If planner drops an explicit requested metric:

do not waste repeated repair rounds.

Use typed:

semantic_contract_drift

and show the actual conflict.


=====================================================================
32. PROVIDER SHOULD NOT BE REQUIRED AFTER APPROVED PLAN
=====================================================================

Once a validated executable analytical contract exists:

data query execution
result validation
chart selection
chart explanations
verification
report rendering

should be deterministic.

No additional LLM call should be required merely to render a report.

If current code contains post-plan provider dependence,
remove it where safely possible.

An already-approved valid plan must not fail because Gemini later becomes
unavailable during presentation.


=====================================================================
33. CREDENTIAL FAILOVER — SECONDARY GEMINI KEY
=====================================================================

The user authorizes secondary Gemini credential fallback.

Implement this as a PROVIDER CREDENTIAL POOL,
not model fallback.

Primary:

Data Platform Gemini credential

Secondary:

existing Chatbot Gemini credential,
injected into the Data Platform process through environment/secret
configuration.


=====================================================================
34. DO NOT TOUCH CHATBOT LOGIC
=====================================================================

Do NOT:

modify chatbot prompts
modify chatbot tools
route requests through chatbot service
import chatbot business modules
share conversation state
read chatbot key value
log chatbot key

Only reuse the credential through secure environment injection.


=====================================================================
35. DISCOVER ENVIRONMENT VARIABLE NAMES SAFELY
=====================================================================

Inspect:

.env.example
docker-compose files
provider config code

DO NOT inspect `.env`.

Determine variable names.

If necessary introduce something like:

DATA_ANALYST_GEMINI_SECONDARY_KEY

and map it in deployment configuration to the already-managed secret.

Never put secret values in code.


=====================================================================
36. FAILOVER POLICY
=====================================================================

Credential fallback is allowed only for credential/transport failures
where repeating the SAME semantic request against the same model is
reasonable.

Allowed examples:

provider_rate_limited
provider_daily_quota
provider_timeout
provider_connection
provider_unavailable / retryable 5xx

Do NOT fallback for:

semantic_resolution_failed
provider_invalid_json caused by contract semantics
unsupported_metric
unsupported_dimension
privacy
invalid analysis contract caused by meaning
query compilation
result validation


=====================================================================
37. FAILOVER BUDGET
=====================================================================

Maximum per logical semantic request:

primary credential attempt
+
one secondary credential attempt

No infinite rotation.

Record separately:

logical_provider_calls
provider_http_attempts
credential_failover_used
credential_slot

Do not expose key identifiers or values.


=====================================================================
38. FAILOVER AND SEMANTIC REPAIR ARE DIFFERENT
=====================================================================

A primary 429 followed by successful secondary-key response is:

ONE logical semantic interpretation
TWO HTTP attempts
ZERO semantic repairs

Do not count transport credential failover as a semantic repair round.


=====================================================================
39. BOTH KEYS FAIL
=====================================================================

If both credentials fail:

return typed provider error immediately.

UI must say:

AI provider unavailable / quota limited

Do not say:

"không thể diễn giải"

if no semantic interpretation actually occurred.


=====================================================================
40. RETRY UX
=====================================================================

Retry button appears only for a genuinely transient provider condition.

Never show "Thử lại" for:

unsupported capability
semantic contract mismatch
missing input
privacy block
deterministic validation failure

No retry-until-lucky behavior.


=====================================================================
41. MISSION-RELEVANT EVIDENCE CONTRACT
=====================================================================

Create an explicit MissionEvidenceContract.

Every report artifact must trace back to:

user requirement
or
governed supporting requirement

Each artifact carries:

requirement_id
mission
metric_ids
dimension_ids
query_id
scope_ref
purpose
evidence_refs
relevance_role


=====================================================================
42. CHART RELEVANCE IS A HARD GATE
=====================================================================

A chart is admitted only when it answers:

"What part of the user's analytical question does this chart support?"

If no requirement/evidence mapping exists:

DROP THE CHART.

Do not show charts merely because data exists.


=====================================================================
43. RISK WATCH CHART RULE
=====================================================================

Risk Watch primary visualizations may only use:

governed risk metrics
risk threshold status
risk entity breakdown
risk metric trend
risk breach concentration

Valid examples:

cancellation rate by kiosk
delivery success rate by branch
late shift rate by store
cash discrepancy by kiosk
low-stock count by store
rating below threshold

Invalid default examples:

product revenue composition
revenue by product
category sales donut

unless the user explicitly asks for a relationship involving those
metrics.


=====================================================================
44. CHART BUDGET
=====================================================================

Prefer:

2–4 primary charts

not "as many charts as possible".

Supporting charts:

maximum 2

and only when analysis depth warrants it.

A broad report is not better merely because it contains more charts.


=====================================================================
45. CHART SELECTION GRAMMAR
=====================================================================

Use mission-appropriate chart types.

Overview:
- KPI strip
- trend
- one ranking/breakdown

Compare:
- grouped bar
- dumbbell / slope-like comparison where implementation supports it
- difference table

Ranking:
- horizontal bar

Trend:
- line / area

Composition:
- donut only for small, valid part-to-whole cardinality
- otherwise horizontal bar

Forecast:
- history line
- forecast line
- uncertainty band

Risk:
- threshold/bullet visualization
- traffic-light table
- sparkline / trend where relevant

Relationship:
- scatter
- descriptive trend line only if mathematically justified

Do not use donut as a generic fallback.


=====================================================================
46. VISUAL QUALITY UPGRADE
=====================================================================

Make charts feel more polished while preserving current lightweight
custom-SVG architecture.

Do NOT add a heavy chart library unless absolutely necessary.

Improve:

responsive sizing
hover tooltips
focus/keyboard accessibility
highlight active series
clear legends
consistent semantic colors
axis spacing
compact Vietnamese number formatting
empty/loading/error states
partial-period styling
forecast confidence bands
risk threshold markers

Use subtle transitions.

Respect:

prefers-reduced-motion

Do not add distracting animation.


=====================================================================
47. EVERY CHART NEEDS AN ANALYTICAL EXPLANATION
=====================================================================

Under each chart show a compact section:

"Nhận định từ biểu đồ"

It must contain:

1. WHY THIS CHART IS HERE
   Which requirement it answers.

2. WHAT IT SHOWS
   The direct factual pattern.

3. KEY FACT
   Important verified number(s).

4. BUSINESS INTERPRETATION
   Descriptive, not causal unless evidence supports causality.

5. CAVEAT
   Partial period, Top-N, sample limits, stale data, etc.


=====================================================================
48. CHART EXPLANATIONS SHOULD BE DETERMINISTIC
=====================================================================

Do not spend another provider call for each chart.

Create something like:

chart_insight_service.py

Generate evidence-backed statements from:

validated chart rows
metric metadata
dimension metadata
mission
thresholds
period coverage

Examples:

Comparison:

"Hồ Chí Minh đạt 162,9 triệu VND, cao hơn Hà Nội 61,4 triệu VND
(+60,5%) trong phạm vi đã chọn."

Trend:

"Doanh thu tăng từ tuần 1 đến tuần 3 và giảm ở kỳ cuối.
Kỳ cuối chưa đủ ngày nên chưa nên so trực tiếp với kỳ đầy đủ."

Risk:

"2/14 kiosk vượt ngưỡng tỷ lệ hủy đơn 8%."

No hallucinated recommendations.


=====================================================================
49. OPTIONAL BUSINESS ACTION TEXT
=====================================================================

If recommendations are shown:

they must be clearly labeled as:

"Điểm nên kiểm tra tiếp"

not as causal conclusions.

Example:

"Kiểm tra nguyên nhân tỷ lệ hủy cao tại Kiosk A"

is acceptable.

"Do thiếu nhân viên nên Kiosk A hủy đơn cao"

is NOT acceptable without causal evidence.


=====================================================================
50. REPORT STRUCTURE
=====================================================================

The default report should become cleaner.

PRIMARY REPORT:

Question
Mission
Scope
Period

Executive KPI strip

3 grounded findings

2–4 primary evidence charts

chart-specific insight blocks

important limitations

next analytical questions


=====================================================================
51. MOVE VERIFICATION OUT OF MAIN REPORT
=====================================================================

Do not show the large technical verification block directly in the
primary report flow.

Create dedicated report sub-navigation:

BÁO CÁO

KIỂM CHỨNG & NGUỒN

DỮ LIỆU / SQL

LƯU & XUẤT

Exact wording may adapt to project design.


=====================================================================
52. VERIFICATION TAB CONTENT
=====================================================================

"Kiểm chứng & nguồn" should contain:

semantic contract verification
source provenance
registry fingerprint
query evidence
scope/population checks
numeric reconciliation
ranking reconciliation
grounding coverage
forecast backtest quality
limitations
independent accuracy if available


=====================================================================
53. STOP CALLING INTERNAL SCORE "ACCURACY"
=====================================================================

Current internal verification score may remain internally.

Rename it in UI to something accurate, such as:

"Độ bao phủ kiểm chứng"

or:

"Mức hoàn tất kiểm chứng"

It is NOT:

"Độ chính xác AI"

It is NOT:

"Xác suất trả lời đúng"


=====================================================================
54. REAL ACCURACY FRAMEWORK
=====================================================================

Implement a measurable verification framework.

Do NOT use an LLM judge as the primary accuracy measure.

Use deterministic independent checks.


=====================================================================
55. NUMERIC RECONCILIATION
=====================================================================

For scalar/aggregate values where an independent oracle can be generated:

compute:

expected_value
reported_value
absolute_error
relative_error
within_tolerance

Tolerance must be metric-specific.

Counts:
exact unless documented otherwise.

Currency aggregates:
exact or tiny numeric tolerance.

Percentages:
bounded absolute tolerance.

Do not hide mismatch behind a weighted average.


=====================================================================
56. INDEPENDENT ORACLE
=====================================================================

Where feasible, build an independent reconciliation path.

It should NOT simply re-read the same rendered value.

Use:

governed metric definition
independent aggregate query/reconciliation path
warehouse facts

Keep it read-only.

If a genuinely independent oracle is not available:

independent_accuracy = null

Display:

"Chưa đo đối chiếu độc lập"

Never infer accuracy from internal checks.


=====================================================================
57. BREAKDOWN RECONCILIATION
=====================================================================

For complete additive breakdowns verify:

sum(groups) == total

within appropriate tolerance.

For ratios:

reconcile using numerator and denominator,
not by averaging percentages.


=====================================================================
58. RANKING ACCURACY
=====================================================================

For ranking reports compute where applicable:

Top-K exact set match
Top-K precision/recall
Jaccard overlap
order agreement

Kendall tau or Spearman correlation may be used when enough ranked
entities exist.

Do not force ranking statistics for tiny invalid samples.


=====================================================================
59. TREND VERIFICATION
=====================================================================

Verify:

time buckets
bucket ordering
period coverage
point values
partial period markers

For independent oracle trend points:

pointwise absolute/relative error

Do not average away one wrong period.


=====================================================================
60. FORECAST ACCURACY
=====================================================================

Forecast cannot be "verified" against the future.

Use backtesting.

Keep / extend:

MAE
RMSE
sMAPE

Consider MASE where enough history exists.

Report:

backtest window
baseline model
selected model
error metrics
80% interval
interval empirical coverage when enough backtest points exist

Do NOT call a forecast "95% accurate" from these metrics.


=====================================================================
61. NARRATIVE GROUNDING COVERAGE
=====================================================================

Narrative factual claims should be structured.

Track:

total factual claims
claims with evidence refs
numeric claims matched to evidence
unsupported claims

Report:

grounding coverage

A report with unsupported numeric claims fails verification.


=====================================================================
62. CHART RELEVANCE VERIFICATION
=====================================================================

Verification must check:

every primary chart maps to a requested requirement

risk charts use risk metrics

forecast charts use forecast artifacts

comparison charts represent requested groups

ranking charts preserve rank criterion

relationship charts use requested metric pair

An irrelevant but mathematically correct chart should FAIL relevance.


=====================================================================
63. NO SINGLE FAKE "AI ACCURACY %" FOR ONE REPORT
=====================================================================

For a single report show separate evidence metrics.

Example:

Numeric reconciliation:
12 / 12 matched

Requirement coverage:
3 / 3

Grounded factual claims:
8 / 8

Chart relevance:
4 / 4

Independent oracle:
100% on 12 eligible numeric checks

Forecast backtest:
sMAPE 8.4%

Do not collapse all of this into:

"AI accuracy = 92.7%"


=====================================================================
64. EVALUATION-SUITE ACCURACY
=====================================================================

For offline/live benchmark suites,
overall pass rates are meaningful.

Report:

n
success count
semantic accuracy
execution success
chart relevance pass
grounding pass
provider failure rate

Use Wilson 95% confidence interval for proportions where useful.

Do not call a 6-case sample a precise production accuracy estimate.


=====================================================================
65. SAVE VERIFICATION SNAPSHOT
=====================================================================

Saved reports should retain:

registry fingerprint
source fingerprint
verification version
metric definitions used
scope
period
oracle result where measured
backtest metadata
chart-requirement mappings

This makes later review reproducible.


=====================================================================
66. PROVIDER FAILURE MUST NOT LOOK LIKE SEMANTIC FAILURE
=====================================================================

Improve failure-stage labeling.

Distinguish:

PRECHECK_FAILURE
PROVIDER_TRANSPORT_FAILURE
PROVIDER_QUOTA_FAILURE
SEMANTIC_INTERPRETATION_FAILURE
SEMANTIC_CONTRACT_FAILURE
QUERY_COMPILATION_FAILURE
QUERY_EXECUTION_FAILURE
RESULT_VALIDATION_FAILURE
FORECAST_FAILURE

UI text must match the actual stage.


=====================================================================
67. "CANNOT INTERPRET" MUST BE HONEST
=====================================================================

If Gemini timed out before returning intent:

do not say:

"AI không hiểu câu hỏi"

Say:

"Dịch vụ AI chưa phản hồi kịp."

If provider returned a contract but server rejected it:

say:

"Diễn giải chưa khớp danh mục dữ liệu."

If user input is gibberish:

say:

"Chưa nhận ra nội dung phân tích dữ liệu."

These are different problems.


=====================================================================
68. DO NOT REPAIR NON-PROGRESS FOREVER
=====================================================================

Keep V3.0 bounded repair.

If exact same semantic issue fingerprint repeats:

stop.

Credential fallback is allowed,
but semantic retry is not reset by using a different key.


=====================================================================
69. PRE-FLIGHT / FINAL PLAN CONSISTENCY
=====================================================================

Add regression assertion:

If preflight reports:

metric = revenue
mission = trend
time = Sep 2026
granularity = week

a successful final plan must contain:

revenue
trend-compatible operation
same time scope
weekly granularity

or explicitly return a typed conflict.

It must not silently become product_revenue.


=====================================================================
70. RISK WATCH SHOULD NOT REQUIRE AI FOR DEFAULT MODE
=====================================================================

The existing:

"Kiểm tra rủi ro (0 lượt AI)"

should become the PRIMARY Risk Watch execution.

Default risk mission:

0 provider calls.

Natural-language risk refinement may use AI only if the user asks for
something beyond the governed deterministic signal set.


=====================================================================
71. RISK REPORT DESIGN
=====================================================================

Risk report should prioritize:

Overall status summary

Breached signals count

Highest-risk entities

Signal table:
metric
entity
value
threshold
status
period

Risk metric trend where useful

Why each signal matters

Suggested next drill-down questions

Do not mix generic revenue dashboards into it.


=====================================================================
72. FORECAST BUILDER SHOULD BE PROVIDER-INDEPENDENT
=====================================================================

When using the Forecast tab controls:

Metric = Revenue
Horizon = 3
Cadence = month

execution must not require Gemini interpretation.

This directly addresses the observed:

first attempt fails
retry succeeds

behavior.


=====================================================================
73. NATURAL FORECAST FREE TEXT
=====================================================================

Free text:

"Dự báo doanh thu 3 tháng tới"

should preflight-anchor:

revenue
forecast
3 months

strongly enough that the LLM cannot invent a different revenue metric.

If all required fields are deterministically known,
the server MAY upgrade the request to guided execution automatically.


=====================================================================
74. AUTO-UPGRADE TO DETERMINISTIC CONTRACT
=====================================================================

Implement carefully:

If free-text preflight reaches high confidence for ALL required fields:

mission
canonical metric
time/horizon
scope

and no genuine ambiguity remains,

the server may create the guided canonical contract directly.

Provider calls:

0

This is optional but strongly preferred if architecture supports it
cleanly.

Do not auto-upgrade uncertain requests.


=====================================================================
75. QUESTION SUGGESTIONS
=====================================================================

Suggestion chips must be guaranteed executable against current registry.

Generate them from mission contracts.

Tests should execute/compile every displayed example question offline.

Never display a suggestion that the backend itself cannot interpret.


=====================================================================
76. "HỎI ĐƯỢC GÌ?" QUALITY
=====================================================================

Capability drawer should clearly distinguish:

Supported now

Historical analysis

Forecastable

Risk signal

Unavailable

Needs a dimension

Needs a time field

Do not expose misleading capabilities.


=====================================================================
77. MISSION BUILDER UX
=====================================================================

Make mission tabs behave like a guided analyst.

When user chooses one mission:

show only the controls that matter.

Avoid irrelevant generic controls.

Examples:

Compare:
[Metric] [Dimension] [A] [B] [Period]

Ranking:
[Top/Bottom] [N] [Metric] [Dimension] [Period]

Trend:
[Metric] [Day/Week/Month] [Period] [Scope]

Forecast:
[Metric] [Horizon] [Cadence] [Scope]

Risk:
[Population] [Period] [Signals optional]

Relationship:
[Metric A] [Metric B] [Grain] [Period]


=====================================================================
78. DEPTH CONTROL
=====================================================================

Depth should control SUPPORTING analytical evidence,
not alter the user's primary semantics.

Focused:
1–2 primary views

Deep:
2–4 primary + limited support

Comprehensive:
up to governed budget

Do not use depth to add unrelated domains.


=====================================================================
79. CHART CARD DESIGN
=====================================================================

Each chart card should contain:

Title

Metric / dimension / unit

Chart

"Nhận định từ biểu đồ"

Expandable:

"Cách đọc biểu đồ"
"Định nghĩa chỉ số"
"Xem dữ liệu"
"Nguồn & phạm vi"

Do not overload the default card header.


=====================================================================
80. VISUAL INTERACTION
=====================================================================

Where practical implement:

tooltip
hover highlighting
legend interaction
series focus
accessible keyboard focus
responsive chart sizing

Keep implementation light.

No flashy 3D charts.

Data visualization clarity > decoration.


=====================================================================
81. COLORS
=====================================================================

Use stable semantic colors.

Examples:

normal categories:
existing categorical palette

risk:
green / amber / red

forecast:
history vs forecast visibly distinct

comparison:
A/B stable colors

Do not change the same entity color between charts within one report.


=====================================================================
82. PARTIAL PERIODS
=====================================================================

Current trend chart correctly marks partial periods in some cases.

Preserve and improve this.

Use:

dashed segment
lighter point
asterisk
clear textual caveat

Do not let partial current period imply a collapse.


=====================================================================
83. UNIT CORRECTNESS
=====================================================================

Audit:

VND
orders
customers
deliveries
percentages
ratings
minutes

No chart should show wrong units.

Add tests.


=====================================================================
84. MAIN REPORT MUST ANSWER THE QUESTION FIRST
=====================================================================

At the top of report show:

"Trả lời ngắn"

1–3 factual sentences

based entirely on verified result artifacts.

Then show:

evidence.

Do not make the user scroll through many charts before seeing the answer.


=====================================================================
85. EXECUTIVE SUMMARY IS NOT AN EXTRA LLM CALL
=====================================================================

Generate from deterministic grounded findings.

If current grounded narrative service safely does this,
reuse it.

Do not add provider cost merely for prettier prose.


=====================================================================
86. FOLLOW-UP QUESTIONS
=====================================================================

Use mission + verified result + registry.

Examples:

Compare:
"Xem xu hướng chênh lệch theo tuần"

Risk:
"Chi nhánh nào đóng góp nhiều nhất vào tỷ lệ hủy?"

Forecast:
"So sánh dự báo với cùng kỳ"

0 provider calls.


=====================================================================
87. ARCHITECTURAL OBJECTIVE
=====================================================================

After V3.2:

LLM should be OPTIONAL for guided analytics.

This is a major reliability principle.

Guided BI path:

registry
→ contract
→ compiler
→ warehouse
→ deterministic analysis

Free-text path:

language
→ LLM
→ validated canonical contract
→ same deterministic backend

Both paths converge BEFORE SQL execution.


=====================================================================
88. TESTING — CREATE INCIDENT REGRESSION SUITE
=====================================================================

Create a dedicated test module such as:

tests/test_v32_mission_reliability.py

and frontend tests.

Must include the real incidents below.


=====================================================================
89. REGRESSION CASE — GIBBERISH
=====================================================================

Input:

"dsdasds"

Expected:

BLOCKED

code:

unrecognized_question

provider calls:

0

UI must NOT contain:

"Câu hỏi hợp lệ"


=====================================================================
90. REGRESSION CASE — MISSION SWITCH
=====================================================================

Start Compare with comparison question.

Switch to Ranking.

Expected:

old question is not automatically reused as Ranking.

preflight/result/plan state reset.

No stale mission metadata.


=====================================================================
91. REGRESSION CASE — MISSION MISMATCH
=====================================================================

Selected:

Ranking

Question:

"So sánh doanh thu Hồ Chí Minh và Hà Nội tháng 9 năm 2026"

Expected:

mission_mismatch

quick fix:

switch to Compare

No provider call before resolution.


=====================================================================
92. REGRESSION CASE — TREND REVENUE
=====================================================================

Question:

"Phân tích xu hướng doanh thu theo tuần trong tháng 9 năm 2026"

Expected canonical:

metric = revenue
mission = trend
granularity = week
period = 2026-09-01..2026-09-30

No revenue alias drift.

No missing metric failure.


=====================================================================
93. REGRESSION CASE — GUIDED FORECAST
=====================================================================

Use Forecast controls:

Revenue
3 months

Expected:

0 LLM calls

deterministic plan

forecast execution

correct ForecastPanel


=====================================================================
94. REGRESSION CASE — FREE TEXT FORECAST
=====================================================================

"Dự báo doanh thu 3 tháng tới"

Expected:

canonical revenue anchor

no product/branch revenue drift

normally one or zero logical provider calls

never retry until lucky


=====================================================================
95. REGRESSION CASE — RISK WATCH
=====================================================================

"Kiểm tra các rủi ro vận hành trong tháng 9 năm 2026"

Expected default path:

0 provider calls

charts/evidence only from governed risk signals

No generic product revenue composition.


=====================================================================
96. REGRESSION CASE — RELATIONSHIP
=====================================================================

"Phân tích mối quan hệ giữa tổng chuyến giao và điểm đánh giá shipper"

Expected:

relationship mission

shared shipper grain

scatter

correlation caveat

no causal statement


=====================================================================
97. REGRESSION CASE — UNKNOWN BUSINESS METRIC
=====================================================================

"Phân tích lợi nhuận tháng 9"

If profit is not governed:

unsupported_concept

nearest supported metrics

0 provider calls if deterministic unsupported concept is recognized.


=====================================================================
98. REGRESSION CASE — PRIVACY
=====================================================================

"số điện thoại khách hàng mua nhiều nhất"

Expected:

BLOCKED
privacy
0 provider calls


=====================================================================
99. REGRESSION CASE — CASUAL NATURAL LANGUAGE
=====================================================================

Examples:

"hôm nay bán được bao nhiêu?"
"món nào bán chạy nhất?"
"chi nhánh nào đang có tỷ lệ hủy cao?"

These must NOT be rejected merely because they are informal.


=====================================================================
100. CHART RELEVANCE TESTS
=====================================================================

For each mission fixture assert:

all visible charts have requirement_id

all primary charts map to user requirement

risk charts use only governed risk signal metrics

forecast charts use forecast artifacts

comparison chart contains requested groups

ranking chart uses requested ranking metric

trend chart uses time dimension

relationship chart uses requested pair


=====================================================================
101. CHART INSIGHT TESTS
=====================================================================

Verify:

every chart has why_relevant

every numeric statement refers to evidence

no unsupported causal language

partial-period caveat is present where applicable

Top-N caveat present where applicable


=====================================================================
102. VERIFICATION TESTS
=====================================================================

Add deterministic tests for:

numeric exact match

numeric mismatch

ratio reconciliation

breakdown total reconciliation

Top-K agreement

ranking order mismatch

grounding claim coverage

chart relevance failure

forecast backtest metrics

no independent oracle → null, not fake 100%


=====================================================================
103. PROVIDER FAILOVER TESTS
=====================================================================

Mock:

primary 429
secondary success

Expected:

logical_calls = 1
http_attempts = 2
credential_failover_used = true
semantic_repairs = 0

Mock:

primary quota
secondary quota

Expected:

typed quota/provider failure
no third attempt

Mock:

semantic invalid contract

Expected:

do NOT rotate credentials merely because semantics are invalid.


=====================================================================
104. SUGGESTION COMPILATION TEST
=====================================================================

Every question displayed in mission suggestion chips should:

preflight successfully

resolve/compile offline where deterministic

or be explicitly marked as needing AI interpretation

Do not ship broken example questions.


=====================================================================
105. BASELINE TESTS
=====================================================================

Record current baseline BEFORE changes.

Current historical state may include known failures.

Do not invent a clean baseline.

Run repository-prescribed backend tests.

Run frontend node tests.

Run typecheck.

Run build.

Run data-sync tests if changed.

Record exact failures before and after.


=====================================================================
106. NO NEW UNEXPLAINED REGRESSION
=====================================================================

Final:

no new backend failures

no new frontend failures

typecheck PASS

build PASS

semantic offline evaluation no regression


=====================================================================
107. LIVE PROVIDER POLICY
=====================================================================

Do NOT spend large Gemini quota automatically.

Run offline first.

Live qualification requires user approval if it would exceed a small
smoke budget.

If allowed:

use a small representative matrix.

Record:

logical calls
HTTP attempts
credential failover
provider error category
latency


=====================================================================
108. MANUAL BROWSER ACCEPTANCE MATRIX
=====================================================================

The phase is not complete until these are manually verified or explicitly
marked NOT RUN.


CASE 1:
type "dsdasds"

Expected:
blocked
not "valid"


CASE 2:
Compare question → switch Ranking

Expected:
new mission draft
old question not inherited


CASE 3:
Ranking tab + comparison wording

Expected:
mission mismatch warning


CASE 4:
Trend revenue weekly Sep 2026

Expected:
plan and report succeed


CASE 5:
Guided forecast revenue 3 months

Expected:
no provider dependency


CASE 6:
Risk Watch Sep 2026

Expected:
only risk evidence


CASE 7:
Relationship shipper deliveries vs rating

Expected:
scatter + caveat


CASE 8:
Privacy phone request

Expected:
block


CASE 9:
Unsupported profit request

Expected:
unsupported with alternatives


CASE 10:
Casual Vietnamese valid question

Expected:
accepted appropriately


=====================================================================
109. REPORT VISUAL ACCEPTANCE
=====================================================================

For a successful report verify:

clear answer at top

3 or fewer key findings by default

2–4 relevant primary charts

no irrelevant charts

chart insights visible

units correct

partial periods visible

scope obvious

period obvious

source available


=====================================================================
110. VERIFICATION TAB ACCEPTANCE
=====================================================================

Main report should NOT be dominated by verification details.

Dedicated verification tab should show:

contract checks

numeric reconciliation

oracle accuracy if available

grounding

chart relevance

forecast backtest

data freshness

provenance

SQL/data links


=====================================================================
111. WORD EXPORT
=====================================================================

If Word export contains report content:

include:

question
scope
period
KPIs
grounded findings
relevant charts
chart insights
limitations

Verification details may go in an appendix.

Do not export giant internal debug dumps.


=====================================================================
112. PERFORMANCE
=====================================================================

Preflight remains:

0 provider calls
no synchronous warehouse query

Guided builder interactions:

no provider calls

Mission switch:

instant local/UI state reset

Do not make workspace slower.


=====================================================================
113. FRONTEND ARCHITECTURE
=====================================================================

Do not re-grow AnalyticsView.tsx.

Keep components modular.

Likely introduce/refine components such as:

MissionWorkspace
MissionInputBuilder
PreflightStatus
ChartInsight
ReportTabs
VerificationPanel
ProviderStatusBadge

Exact names may follow project convention.


=====================================================================
114. BACKEND ARCHITECTURE
=====================================================================

Prefer focused services, e.g.:

mission_contract_service.py

semantic_preflight_contract.py

guided_analysis_service.py

chart_relevance_service.py

chart_insight_service.py

verification_reconciliation_service.py

provider_credential_router.py

Do not create a god service.


=====================================================================
115. DO NOT DUPLICATE BUSINESS RULES
=====================================================================

Risk thresholds:
registry

Metric definitions:
registry

Forecastability:
registry

Mission compatibility:
registry / governed contract metadata

Frontend only renders them.


=====================================================================
116. DO NOT USE LLM-AS-JUDGE FOR PRODUCTION VERIFICATION
=====================================================================

No "ask Gemini whether Gemini was correct".

Production verification must remain deterministic.

Optional research/evaluation LLM judging may be added only as a clearly
separate experimental tool, not as correctness authority.


=====================================================================
117. FAILURE UI
=====================================================================

Each failure card should show:

What happened

At which stage

Whether retry helps

What the user should change

Reference code if execution/system failure

Do not dump internal stack details.


=====================================================================
118. PROVIDER STATUS UI
=====================================================================

Workspace may show:

AI provider: Sẵn sàng
AI provider: Đang chuyển dự phòng
AI provider: Giới hạn quota
AI provider: Không khả dụng

Do not reveal which secret/key is used.


=====================================================================
119. TELEMETRY / DIAGNOSTICS
=====================================================================

Record sanitized:

input_mode
mission
preflight_state
semantic_confidence
guided_contract_used
logical_provider_calls
provider_http_attempts
credential_failover_used
semantic_repairs
chart_count
dropped_irrelevant_charts
verification_status

No secret values.


=====================================================================
120. DOCUMENTATION
=====================================================================

Create/update:

data-platform/AI_V32_MISSION_RELIABLE_ANALYST.md

Document:

incidents
root causes
architecture
guided/free-text paths
provider failover
mission contracts
chart relevance
verification methodology
tests
manual acceptance
remaining limitations


=====================================================================
121. IMPORTANT PRODUCT LANGUAGE
=====================================================================

Use clear Vietnamese labels.

Avoid:

"Câu hỏi hợp lệ"

when all we know is that AI may attempt interpretation.

Prefer:

"Đã đủ thông tin để phân tích"

"Có thể gửi để AI diễn giải"

"Cần bổ sung thông tin"

"Chưa nhận ra bài toán phân tích"

"Yêu cầu chưa phù hợp với nhiệm vụ đang chọn"


=====================================================================
122. ACCEPTANCE — GIBBERISH
=====================================================================

"dsdasds"

must never look successful.

This is a release gate.


=====================================================================
123. ACCEPTANCE — MISSION SWITCH
=====================================================================

Mission state must never silently inherit contradictory question state.

This is a release gate.


=====================================================================
124. ACCEPTANCE — PREFLIGHT/PLAN CONSISTENCY
=====================================================================

If preflight locks a canonical metric,
planner cannot silently choose another metric.

This is a release gate.


=====================================================================
125. ACCEPTANCE — GUIDED ANALYTICS
=====================================================================

A fully guided mission request must be executable without Gemini.

This is a major V3.2 success criterion.


=====================================================================
126. ACCEPTANCE — RISK RELEVANCE
=====================================================================

Risk Watch may not show unrelated generic business charts by default.

This is a release gate.


=====================================================================
127. ACCEPTANCE — CHART EXPLANATION
=====================================================================

Every primary chart must explain why it answers the user's question.

This is a release gate.


=====================================================================
128. ACCEPTANCE — TRUE VERIFICATION LANGUAGE
=====================================================================

No internal weighted score may be presented as calibrated answer
accuracy.

This is a release gate.


=====================================================================
129. ACCEPTANCE — SEPARATE VERIFICATION VIEW
=====================================================================

Primary business report is clean.

Verification/provenance lives in a dedicated view.

This is a release gate.


=====================================================================
130. ACCEPTANCE — PROVIDER FAILOVER
=====================================================================

If configured secondary credential exists:

primary quota/rate-limit failure may use secondary credential once.

No chatbot logic modification.

No secret exposure.

No semantic retry abuse.


=====================================================================
131. IMPLEMENTATION ORDER
=====================================================================

Execute in this order:

P0 — Baseline + reproduce incidents

P1 — Mission state lifecycle + mission-specific input contracts

P2 — Honest preflight status + gibberish + mission mismatch

P3 — Canonical alias priority + preflight/planner semantic locking

P4 — Guided deterministic execution

P5 — Provider credential failover

P6 — Mission evidence contract + chart relevance

P7 — Chart insight + visual polish

P8 — Independent verification / reconciliation framework

P9 — Separate report/verification UI

P10 — regression, offline eval, browser acceptance, docs


=====================================================================
132. AFTER EACH PHASE
=====================================================================

Run targeted tests.

Do not accumulate ten phases of untested changes.


=====================================================================
133. STOP CONDITIONS
=====================================================================

Stop and ask the user before:

reading .env

changing real secrets

modifying original operational DB schema

destructive DB operations

changing chatbot business logic

changing Kubernetes

changing AWS

large live provider run

major unrelated refactor

committing/pushing


=====================================================================
134. DO NOT STOP FOR NORMAL ENGINEERING DECISIONS
=====================================================================

Continue autonomously for:

frontend component work

backend services

registry metadata

tests

safe read-only SQL fixtures

deterministic verification

documentation

normal refactoring inside data-platform/


=====================================================================
135. FINAL REVIEW
=====================================================================

Before declaring complete:

git status --short
git diff --check

Review every changed file.

Check for:

secrets
dead code
temporary files
generated artifacts
debug prints
hard-coded API key values
accidental chatbot edits


=====================================================================
136. REQUIRED FINAL REPORT — IN VIETNAMESE
=====================================================================

Report exactly:

BRANCH:
STARTING HEAD:
WORKING TREE:

P0 INCIDENT REPRODUCTION:
A gibberish:
B mission switch:
C mission scope:
D preflight/planner drift:
E revenue alias:
F forecast retry:
G risk relevance:
H chart explanation:
I verification score:

MISSION STATE:
PASS/PARTIAL/FAIL

MISSION-SPECIFIC INPUT CONTRACTS:
PASS/PARTIAL/FAIL

PREFLIGHT:
PASS/PARTIAL/FAIL

GIBBERISH:
PASS/FAIL

MISSION MISMATCH:
PASS/FAIL

CANONICAL ALIAS:
PASS/PARTIAL/FAIL

PREFLIGHT → PLAN LOCK:
PASS/FAIL

GUIDED EXECUTION:
PASS/PARTIAL/FAIL
Provider calls for guided requests:

FREE-TEXT EXECUTION:
PASS/PARTIAL/FAIL

PROVIDER FAILOVER:
PASS/PARTIAL/FAIL
Primary→secondary test:
Logical calls:
HTTP attempts:

RISK WATCH:
PASS/PARTIAL/FAIL
Irrelevant charts dropped:

CHART RELEVANCE:
PASS/PARTIAL/FAIL

CHART INSIGHTS:
PASS/PARTIAL/FAIL

VISUAL UX:
PASS/PARTIAL/FAIL

VERIFICATION FRAMEWORK:
PASS/PARTIAL/FAIL

Independent numeric oracle:
Ranking reconciliation:
Forecast backtest:
Grounding coverage:
Chart relevance verification:

REPORT TABS:
PASS/PARTIAL/FAIL

BACKEND TESTS:
baseline:
final:
new failures:

FRONTEND TESTS:
baseline:
final:

TYPECHECK:
PASS/FAIL

BUILD:
PASS/FAIL

OFFLINE EVAL:
PASS/FAIL

LIVE EVAL:
NOT RUN / result
Logical provider calls:
HTTP attempts:

BROWSER ACCEPTANCE:
1 gibberish:
2 mission switch:
3 mission mismatch:
4 trend:
5 guided forecast:
6 risk:
7 relationship:
8 privacy:
9 unsupported:
10 casual Vietnamese:

KNOWN LIMITATIONS:

FILES CHANGED:

GIT DIFF CHECK:

COMMIT:
NOT PERFORMED

PUSH:
NOT PERFORMED

SUGGESTED COMMIT MESSAGE:


=====================================================================
137. FINAL PRODUCT SUCCESS DEFINITION
=====================================================================

V3.2 is successful only when:

1. nonsense is not labeled valid

2. changing missions cannot leave contradictory old questions

3. each mission exposes only relevant analytical controls

4. selected mission has real execution meaning

5. canonical metrics resolved by preflight remain stable in final plans

6. guided mission requests can run without LLM interpretation

7. free-text still works naturally

8. provider quota failure does not become random semantic behavior

9. secondary credential failover is bounded and secure

10. Risk Watch uses risk evidence only

11. every primary chart maps to a user requirement

12. every chart explains its analytical relevance

13. charts are visually clearer and more interactive without becoming
    decorative

14. verification does not pretend a weighted score equals AI accuracy

15. independent numeric reconciliation is used where possible

16. forecast quality uses proper backtesting metrics

17. verification/provenance is separated from the main business report

18. no new provider calls are added for chart storytelling

19. no security boundary is weakened

20. V3.0/V3.1 regression tests remain stable


=====================================================================
138. BEGIN
=====================================================================

Begin now.

Do NOT only rewrite the plan.

Actually execute it.

First:

1. verify branch and working tree
2. read V3.0/V3.1 architecture and current code
3. run baseline
4. reproduce the real incidents
5. create AI_V32_MISSION_RELIABLE_ANALYST.md
6. implement P1 → P10 incrementally
7. run targeted tests after every phase
8. run final verification
9. do not commit/push
10. return the required Vietnamese report

=> với cái độ sâu phân tích theo 3 chế độ này có thật sự là độ sâu ko vậy nhỉ, để vào thì nó phải chứng minh được ấy test 1 câu hỏi 3 chế độ xem nhé b ơi @@ chứ ko nó hơi cấn nếu để vào cho có lúc demo với thầy cô hỏi mà test k khác gì nhau 
=> với cái phạm vi này tôi nghĩ là nó tự nhận diện từ câu hỏi bài toán đi, với nó tự tìm đến các features liên quan đi :) bảo mỗi sp chẳng nhẽ bài toán lớn mà tập trung vào mỗi đúng sp thôi bỏ mấy cái khác à@@ nên mấy cnay nó phải tự nhận diện được dễ dàng ấy bạn ơi hiểu không bạn ơi nên làm kĩ vào ấy


=====================================================================
EXECUTION CHECKPOINT (Claude Code, branch_thaian) — cập nhật sau mỗi phase
=====================================================================
STARTING HEAD: 36827fa16e4f08a1d3da6e5fb6784e17c43e685e · working tree sạch (chỉ file plan này untracked)

P0 — DONE (2026-10-16)
- Baseline backend (tools.run_tests_v29): 876 test, 4 lỗi có sẵn (đúng danh sách cũ).
- Baseline web-ui: node --test 138/138; typecheck PASS. Eval offline: 146 ca, retrieval domain 110/113,
  metric 109/113, compile 108/108, preflight 17/17, unsupported 5/5.
- Tái hiện (offline, fixture):
  A "dsdasds" → status ok, can_submit=true, nhãn "Câu hỏi hợp lệ để lập kế hoạch". TÁI HIỆN.
  B/mismatch tab Xếp hạng + câu "So sánh…" → ok, mission=ranking, không cảnh báo. TÁI HIỆN.
  C ScopeDepthBar chung cho mọi nhiệm vụ (mặc định "Sản phẩm"). TÁI HIỆN (code).
  D LLM trả product_revenue cho "xu hướng doanh thu…" → báo cáo success với product_revenue (trôi nghĩa im lặng);
    LLM bỏ metric → explicit_metrics_missing liệt kê 6 metric doanh thu sau 2 lượt. TÁI HIỆN.
  E "doanh thu" neo 6 metric (revenue, item/product/store/payment/voucher_revenue) → "+5 chỉ số cùng tên". TÁI HIỆN.
  F Forecast builder sinh câu chữ → vẫn cần Gemini diễn giải lại. TÁI HIỆN (code path).
  G Risk qua pipeline: supporting thêm aov + nhiều bar trùng; lens liên miền không lọc theo nhiệm vụ. TÁI HIỆN.
  H Chart không có giải thích; tiêu đề trùng "Doanh thu — Đơn hàng và doanh thu". TÁI HIỆN.
  I UI "Kiểm chứng & độ chính xác" + "Điểm kiểm chứng tổng xx/100". TÁI HIỆN.
  ĐỘ SÂU (ghi chú người dùng): cùng câu, focused/deep/comprehensive → CÙNG 6 chart. TÁI HIỆN — độ sâu giả
    (support_limit/target_views cố định trong analytical_resolver; test V2.12 ép focused ≥4 view).
- Hậu kế hoạch đã tất định (narrative/forecast/assess_report không gọi LLM) → mục 32 đã đạt sẵn.

P1–P4 — DONE
- Files: metadata/semantic_catalog.json (input_contract ×8, metric_alias_policy, qualifier_dimensions, depth_budgets,
  business_signal_vocabulary, vague_quality_terms, preflight_states, alias "tỷ lệ hủy", "điểm đánh giá shipper");
  services/{mission_contract_service,semantic_preflight_contract}.py (mới), preflight_service, hybrid_analyst_planner,
  agent_pipeline (guided_context + server precheck), analytical_resolver, analysis_expansion_service (depth budgets,
  mission_relevant, related-axis discovery), analysis_quality_service (floor theo độ sâu/nhiệm vụ), dashboard_planner_service
  (tiêu đề nêu chiều/tỷ trọng), domain_intelligence_service (depth_options), workspace_service (input_contract),
  error_taxonomy + analysis_pipeline (mã lỗi + analysis_stage), semantic_catalog_validation, common.py (AiGuidedContract);
  tools/regenerate_capabilities_fixture.py; tests/test_v32_mission_reliability.py (mới, 23 test); cập nhật có chủ đích 2 test
  bị V3.2 thay thế (focused floor V2.12; drift type V3.0).
  web-ui: utils/missionWorkspace.mjs(+d.ts,+test), preflightPresentation, components/workspace/{MissionInputBuilder,
  AnalysisScopePanel}.tsx (mới), AnalystWorkspace, MissionPicker (+Câu hỏi tự do), AnalyticsView (draft/nhiệm vụ, guided);
  xoá ScopeDepthBar.tsx (đã thay thế; LƯU Ý: việc xoá bị stage nhầm bằng git rm --cached).
- Tests: full backend 899 → 5 lỗi (4 có sẵn + 1 hồi quy v284 đã sửa bằng qualifier ngữ cảnh; rerun module OK);
  web-ui 147/147, typecheck PASS.
- Kết quả: gibberish BLOCKED; mismatch chặn trước AI; "doanh thu" = revenue (chỉ số chuẩn); drift sửa tất định;
  guided forecast/trend/ranking 0 lượt AI; độ sâu thật: focused 2 / deep 4 / comprehensive 7 chart (cùng câu, cùng số liệu chính).
- Còn lại: P5–P10.

P5 — DONE: services/provider_credential_router.py (mới); agent_provider (≤1 failover cùng model, không tốn hạn mức logic,
  dừng sau khi khoá phụ hỏng); hybrid_analyst_planner (cho phép đúng 1 attempt failover, không retry sau failover,
  logical_provider_calls/provider_http_attempts/credential_failover_used/credential_slot); provider_health (rate_limited,
  degraded khi vừa failover); docker-compose.data.yml + data-platform/.env.example (DATA_ANALYST_GEMINI_SECONDARY_KEY,
  mặc định ánh xạ secret Gemini của chatbot ở .env gốc; không đọc giá trị); tools/run_tests_v29 loại biến này khỏi env test.
  Test: 4 ca failover giả lập HTTP (429→thành công: 1 logic/2 HTTP; quota×2: lỗi có kiểu, không lần 3; lỗi ngữ nghĩa
  không đổi khoá; status không lộ khoá).
P6 — DONE: services/chart_relevance_service.py (mới) + mission_relevant (resolver) — Risk chỉ còn metric rủi ro; mỗi chart
  có requirement_id/relevance_role/evidence_refs; ngân sách chart hỗ trợ focused 0 / deep 4 / comprehensive 6.
P7 — DONE: services/chart_insight_service.py (mới, 0 AI); short_answer; web-ui ChartInsight/ChartSource, vạch ngưỡng rủi ro +
  đèn giao thông, focus bàn phím, prefers-reduced-motion; RiskSignalTable tóm tắt + câu hỏi đi sâu; docx có nhận định.
P8 — DONE: services/verification_reconciliation_service.py (mới): numeric/ranking oracle (endpoint
  POST /api/ai/sessions/{id}/reconcile, chủ sở hữu, read-only, 0 AI), backtest, grounding, chart relevance; null khi chưa đo.
P9 — DONE: AnalystDashboard 4 tab (Báo cáo · Kiểm chứng & nguồn · Dữ liệu / SQL · Lưu & xuất), VerificationPanel,
  đổi nhãn "Mức hoàn tất kiểm chứng nội bộ (không phải độ chính xác AI)".
  Hồi quy giữa chừng: cổng ghi đè evidence_refs của chart dẫn xuất → 24 test V2.8+ tụt điểm 90 → đã sửa (setdefault);
  rerun 10 module bị ảnh hưởng: 149/149 OK. web-ui 153/153, typecheck PASS.
P10 — DONE (kiểm chứng cuối, 16/10/2026):
- Backend full (tools.run_tests_v29): 913 test, FAILED (failures=3, errors=1) = đúng 4 lỗi có sẵn của baseline V3.1, 0 hồi quy.
- web-ui: node --test 153/153 (cập nhật kỳ vọng badge "Tín hiệu rủi ro" cho low_stock_count), typecheck PASS, build PASS.
- Eval offline 146 ca: domain 110/113, metric 109/113, compile 108/108, preflight 17/17, unsupported 5/5, forecast 6/6
  (4 ca lỗi ship_12, rev_12, rev_r_02, v31_rev_01 — giống baseline).
- Nghiệm thu API (stack thật, chỉ đường 0 lượt AI): A/B/E/F/G/I/§97/§98 đạt; độ sâu 2 / 5 / 7 biểu đồ. Trình duyệt: NOT RUN.
- Sửa thêm ở P10: "Phân tích lợi nhuận tháng 9" (chỉ khái niệm chưa quản trị) → NEEDS_INPUT + unsupported_only (§97, 0 lượt AI).
- git diff --check sạch; quét secret/debug sạch; không đổi ai-service, k8s, docker-compose.yml app.
- Còn lại: live eval NOT RUN (không chạy để tránh tốn quota); việc xoá ScopeDepthBar.tsx đang ở trạng thái staged.
P10b — BỔ SUNG SAU RÀ SOÁT PLAN (16/10/2026, sau phản hồi thử UI):
- Nguyên nhân bản UI cũ: container web-ui chưa build lại → đã `up -d --build web-ui` và kiểm bundle phục vụ (skill execute-plan ghi quy tắc).
- §14–§21/§45 ngữ pháp biểu đồ theo nhiệm vụ: registry thêm supporting_forms + max_supporting_per_form; chart_relevance_service.grammar_decisions
  (không lặp góc nhìn, không donut thừa, 1 chart hỗ trợ/dạng); lý do mới duplicate_view, outside_mission_grammar.
- §15 So sánh: KPI A · B · chênh lệch tuyệt đối · chênh lệch % (compare_cards); §84 Trả lời ngắn không lặp, hai nhóm → câu "cao hơn".
- KPI một thẻ/một ý nghĩa; nhãn nghiệp vụ cho enum thô (payment_method, order_type, order_status, payment_status) qua value_labels + business_labels;
  bỏ mã định danh khỏi nhãn Top-N.
- §117 thẻ lỗi hiện "Giai đoạn: …"; §83 test đơn vị cho toàn bộ metric.
- Chưa làm / không áp dụng: §76 nhãn "Cần chiều/Cần trường thời gian" (registry không có chỉ số nào bắt buộc chiều); §86 gợi ý tiếp theo của So sánh
  vẫn dùng mẫu chung (xu hướng/đào sâu/kỳ trước), chưa có "chênh lệch theo tuần".
