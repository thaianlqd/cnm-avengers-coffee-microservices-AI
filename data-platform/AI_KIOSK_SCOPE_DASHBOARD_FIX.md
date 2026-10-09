# Kiosk population and broad dashboard correction — 2026-10-09

The observed request was `Đánh giá doanh thu và xếp hạng hiệu suất các chi nhánh các kisok`. The returned ranking included main branches and only one chart, while the internal verification index was 90. This was an incorrect interpretation of population, not proof of data correctness.

## Confirmed causes

1. `silver.chi_nhanh.loai_diem_ban` existed physically but had no semantic dimension. The warehouse contains 1,155 main branches, 50 franchise kiosks and 10 satellite kiosks. The old physical-column description also listed different, obsolete classifications.
2. Exact-value coverage did not represent kiosk as a group of two canonical types, and ordinary value coverage could be satisfied by only one sibling requirement.
3. A single metric/grouped ranking automatically selected focused depth, regardless of the user's broad evaluation goal. Supporting selection was skipped.
4. The verifier checked only the recognized plan and requested metric chart coverage; it did not require four independent views for broad evaluation.

## General changes

- Register `store_type` with warehouse-backed enum values, business labels, precise subtype aliases, and the kiosk value group. `kiosk`, `kisok`, `kiốt` and related spellings select both `KIOSK_NHUONG_QUYEN` and `KIOSK_VE_TINH`. Main-branch qualification remains separate; the generic word “chi nhánh” does not imply main branches.
- Metadata population selectors support group aliases, unions and explicit exclusions. They generate checked categorical filters for every requested and supporting operation. Missing physical classification fails before an AI call. Conflicting model scope requires targeted repair. No store-name substring is used to establish membership.
- Metadata declares broad evaluation phrases. These preserve deep analysis instead of silently downgrading to one metric's focused chart. The server chooses whole-scope KPIs, time trends, segmentation and related domain views with identical user filters and time. Broad supporting capacity is six queries, within the existing eight-query total ceiling; the provider-call ceiling stays three.
- Reconstruct and verify population from the original request and semantic history. An incorrect saved population receives no numeric score. Broad dashboards also earn verification points for four distinct valid views; missing views produce partial verification and an explicit UI notice.
- Provide chart tabs for all views, ranking, time, composition and comparison. Up to six primary charts remain visible initially. Whole-scope KPI cards precede local ranking highlights. Scope presentation uses catalog business labels.
- Preserve the archived planner's ability to use metric IDs explicitly delivered by its selected lens directory when whole-subject manifest sharding removes those IDs. The permission remains tied to that delivered lens; an unrelated omitted metric is rejected. This was caught by the full regression suite after adding the new dimension.

## Verification

`tests/test_population_dashboard_v211.py` covers spelling variants, subtypes, union/exclusion, missing physical metadata, scope on every sibling, contradictory model filters, adversarial names, independent fixture totals, minimum four distinct charts, saved scope rejection and reduced scores for missing views. Frontend tests cover tabs, four initially visible cards, incomplete-view notice and whole-population KPIs.

The manual warehouse audit uses a **scripted provider with AI_OFFLINE=1**, then runs the actual semantic resolver, compiler, proposal approval, read-only warehouse execution, chart builder and verifier. For the exact observed request it produced **7 queries, 6 independent charts**, and Top 10 values matched a separately authored SQL query restricted to the two kiosk types. No AI requests and no warehouse writes were made during this audit. This qualifies the actual warehouse scope and dashboard contracts; it does not measure live provider language accuracy.

- Warehouse audit: `analytics-api/evaluation/kiosk_dashboard_warehouse_audit.json`
- Validation and deployment: `analytics-api/evaluation/kiosk_dashboard_validation.json`
- Manual audit command: `python -m tools.qualify_kiosk_dashboard`

The earlier two-submission/four-AI-call qualification is a separate historical result. This correction did not spend additional provider calls. Create a new proposal for the corrected kiosk request; prior sessions carry the previous catalog fingerprint.

## Final validation and deployment

- Full offline suite covered 721 cases: 720 passed; one newly added boundary test initially used an invalid fixture configuration (one call with contract repair still enabled). The fixture was corrected to disable repair. The final affected group, including that boundary, all kiosk tests and the archived regression, passed **52/52**. Production code did not change after the full-suite run. All 721 current cases are covered across these runs; no unresolved failure remains.
- Frontend **109/109** passed; TypeScript, production builds and `git diff --check` passed.
- Updated only `analytics-api` and `web-ui` using `--no-deps`. Both containers are healthy. API readiness confirms the catalog, Redis and warehouse. Customer AI container start time stayed `2026-10-09T03:59:56.168679043Z`.
- Repeated the read-only scripted warehouse qualification on the deployed API: **7 queries, 6 independent charts**, Top 10 matched the independent SQL. The total paid AI requests for this correction remains **0**.
