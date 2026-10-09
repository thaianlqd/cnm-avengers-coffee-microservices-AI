# Semantic recovery and consistent time scope — 2026-10-09

Scope: Data Platform analytics API and dashboard. No customer chatbot changes.

## Findings and changes

The observed rejection logged `repair_add_1 / time / invalid_semantic_shape`. That code was produced by a broad `ValueError/TypeError/KeyError` handler, so the historical log does not identify the original exception. It is not evidence that the user supplied an invalid date.

- Complete per-kind time schemas now apply to primary intent, targeted repair and refinement delta. Relative modes are enumerated; custom ranges require ISO start/end. Missing calendar fields are validated at the time boundary, rather than raising accidental TypeError.
- Time-only repair is authorized only by a time validation failure. Controlled `AnalysisError` categories survive resolution, including capacity choices. Unexpected resolver exceptions are reported as server errors without another semantic retry. Diagnostics contain exception type and source frames, never exception text or provider prose.
- The shared metadata time grammar determines whether the question supplies a period. When it does not, requested work uses the declared `all_time` policy consistently, including repair additions and their supporting views. Explicit question/UI time and stored refinement scope remain protected.
- Stored rolling/calendar scopes with redundant resolved bounds remain compatible only when those bounds exactly match resolution. Contradictory bounds are rejected.
- Rejection logs now retain root issues, subsequent issue history, failure stage, provider count and sanitized resolver location.
- The existing ranking recovery remains covered: product quantity determines Top N; population status disclosures do not introduce grouping; grouped categories and separate metric units produce verified charts.

## Bounded live verification

Only the existing server credentials were used. Two proposal submissions for `Đánh giá doanh thu và xếp hạng hiệu suất các chi nhánh`, four actual AI calls total, against a six-call ceiling. No further live calls were made. Both proposals succeeded. The first run exposed mixed unrequested periods; the final run after the default-time fix uses `all_time` in all five query shapes and took 3,740.61 ms. Each run needed one repair because the initial provider response omitted a required clarification object. This remains a bounded recovery, not a guarantee of one-call model compliance.

The live requests executed zero report SQL queries and zero warehouse writes. Proposal success does not prove source data correctness or general natural-language accuracy. Sanitized measurements: `analytics-api/evaluation/semantic_recovery_live.json`.

## Offline verification

`tests/test_semantic_recovery_boundaries.py` exercises complete time schemas, invalid dates, preserved controlled errors, sanitized internal failures with one AI attempt, immutable repair fields, consistent defaults across domains, explicit scope preservation and stored-scope compatibility. It also replays the branch question through approval, independent fixture SQL execution, chart rendering and saved-report verification. The complete backend suite and dashboard checks are recorded in `analytics-api/evaluation/semantic_recovery_validation.json`.

Final checks: **713 backend tests passed**, **107 dashboard tests passed**, TypeScript check passed. Data Platform API and web container health checks are healthy; API readiness returned HTTP 200 / ready. The customer AI service start time stayed `2026-10-09T03:59:56.168679043Z`.
