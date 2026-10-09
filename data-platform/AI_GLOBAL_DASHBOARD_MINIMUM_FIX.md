# Minimum views for every analytical dashboard — 2026-10-09

The previous kiosk fix applied the four-view floor only to broad evaluation phrases. A simple payment request still became `focused`, so the server produced only two cross-tab charts and gave an internal verification score of 90. The user clarified that every analytical question must receive at least four useful charts, aiming for five or more.

## Policy

- The semantic catalog now declares a server-owned minimum of **4** and target of **5** views for every analytical dashboard. Single-metric questions and the `focused` setting cannot bypass this floor. Unsupported requests and empty populations retain controlled failures.
- Deterministic supporting selection includes whole-scope KPIs, total and bounded segmented timelines, marginal distributions, and approved companion metrics/relationships. The provider does not choose whether to apply the floor. No extra AI call is needed.
- All supporting work inherits the requested filters and observation period. The resolver still verifies compatible populations, historical availability and safe source paths. Snapshot metrics do not receive invented historical trends.
- Cross-tab axes can also be analyzed independently: gateway versus status and their joint cross-tab answer different questions. Complete additive grouped results may provide both absolute values and composition using the same saved rows. Top N, incomplete results, averages, invalid numbers and negative totals never qualify for these composition views.
- At most **8** analytical queries and **8** charts are admitted. Dashboard tabs categorize the actual eligible charts, and up to six primary cards remain visible by default.
- Supporting expansion stops when the server's conservative estimate reaches the target, while still admitting whole-scope KPIs. Actual chart count and uniqueness are verified from returned data, not inferred from that estimate. Delta repair retains the complete approved meaning with default fields omitted on the wire, and limits envelope-error vocabulary to approved domains plus exact new metric references.
- The verifier independently applies the catalog minimum to every hybrid report, even if a saved flag claims zero. Fewer than four valid, distinct views yields partial verification and a missing-view notice. It remains an internal evidence score, not calibrated AI accuracy.

## Validation

`tests/test_dashboard_minimum_views_v212.py` runs proposal, approval, fixture SQL execution, dashboard creation and saved-report verification for the first analytical lens in all **16 domains**. It also checks payment cross-tabs with a grounded gateway filter, identical scope on all queries, an explicit focused setting, forged/truncated reports and empty data. Every default domain case produced at least four independently verified semantic views.

`tools/qualify_dashboard_floor.py` uses a scripted provider and **read-only live warehouse SQL**, including separately authored primary-result queries:

| Scenario | Queries | Distinct charts | Independent primary SQL |
| --- | ---: | ---: | --- |
| Payment count and amount by gateway and transaction status, last 30 days | 4 | 6 | Matched |
| Top 5 products by quantity with product revenue, last 30 days | 5 | 5 | Matched |

This audit made **0 live AI requests and 0 warehouse writes**. It qualifies SQL, scope, chart and verifier behavior with scripted intent; it does not measure live model language understanding.

Detailed results: `analytics-api/evaluation/dashboard_floor_warehouse_audit.json` and `analytics-api/evaluation/dashboard_floor_validation.json`.

Final validation: **726/726 backend tests**, **110/110 frontend tests**, TypeScript, production builds and `git diff --check` passed. Only `analytics-api` and `web-ui` were updated with `--no-deps`; both are healthy. API readiness confirms Redis, catalog and warehouse. The deployed API passed the same independent read-only warehouse audit (payments: 4 queries/6 charts; products: 5 queries/5 charts). Customer AI start time stayed `2026-10-09T03:59:56.168679043Z`.

Existing reports must be proposed again under the new catalog fingerprint. Reload the dashboard and start a new question to see the updated plan and supporting views.
