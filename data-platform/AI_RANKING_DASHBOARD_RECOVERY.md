# Ranking dashboard recovery

## Observed failure

The submitted 30-day Top 5 product request produced five rows and zero charts.
The live model selected `order_status` and `product` as grouping dimensions even
though “Nêu rõ trạng thái đơn được tính” requested a population explanation.
Existing exact anchors distinguished the disclosure but only checked missing
facts; they did not reject an extra disclosure-only grouping dimension.

The dashboard selected horizontal bars for a ranking, then rejected every bar
because its categorical grammar required exactly one visible dimension. Both
metrics fell back to a table. The quality assessment correctly reported 0/2
visualized metrics, but that did not make the presentation acceptable.

The earlier V2.10 qualification used a scripted model response with only the
product grouping. It therefore missed the actual response shape. Its offline
success rates did not establish live-model semantic accuracy.

## General fixes

- Before initial proposal approval, catalog-backed disclosure-only dimensions
  are removed from draft grouping. Independent dimension mentions retain their
  authority. Filters, metrics, time and ranking criteria remain intact.
- A disclosure-only ranking partition requires targeted semantic repair, with
  both grouping and ranking fields named. It is never silently repartitioned.
- The same guard runs during refinement replay and saved-report verification;
  previously stored coverage claims do not override it.
- Categorical bars can represent full multidimensional tuples. Labels preserve
  every business axis and distinguish repeated names through declared identity
  metadata. Only declared identity companions are hidden; an independent axis
  ending in `_id` remains visible. Tuple-label collisions are disambiguated.
- Ranking charts preserve original rows and order. The ordering metric appears
  first; mixed units use separate charts. Companion charts retain their ranking
  criterion and selected-cohort explanation. Per-group ranks and partitions are
  retained in the chart metadata and UI.
- Aggregates with more than two business axes also have a tuple-bar presentation.
  Existing two-axis grids, trends, composition restrictions and chart budgets
  retain their validators.
- Quality verification recomputes categories, displayed values, axis labels and
  ranking metadata. Altered values, hidden axes or changed partitions fail.
- An empty chart section now explains that no verified chart is available and
  points to the result tables and verification details.
- Full regression testing also exposed a capacity check that counted shared
  denominator queries more than once before considering an optional drilldown.
  Supporting admission now counts the same executable identities as final
  deduplication, while retaining the limits of eight total queries and three
  supporting queries. The existing recorded-overview regression covers this.

All changes are in `data-platform/**`. Chart generation uses existing result
artifacts and adds no warehouse query or provider call. Approval and read-only
SQL execution remain in place.

## Reproduction and checks

`analytics-api/tests/fixtures/ranking_dashboard_observed.json` contains the
sanitized actual model intent, query and five observed rows; no session ID or
credentials are included. Replaying those rows now yields two verified charts
without altering their original grain. This replay alone cannot establish the
correct product totals because the original result was already Top-N limited.

An independent SQLite fixture executes the corrected compiler-generated SQL:
one product across completed and delivering orders totals 14 units and 700 VND,
while a cancelled line is excluded. Aggregation happens before selecting Top N.
The full approval/report path produces two charts, retains population caveats,
and passes saved-report verification without another provider call.

New backend regressions cover observed-response normalization, cross-domain
disclosures, independently requested status grouping, partition repair,
refinement, two-to-four-axis rankings across products/payments/stores,
per-group ranks, duplicate names, tuple category budgets, chart tampering and
three-axis aggregate bars. Frontend regressions render both metric cards with
actual observed product labels and check per-group numbering and empty states.

Final qualification and deployment results are recorded in
`analytics-api/evaluation/ranking_dashboard_recovery.json`.

| Final check | Result |
| --- | --- |
| Complete offline backend suite | 703 passed, 311.285 seconds |
| New observed/generic regressions | 16 passed |
| Frontend suite | 107 passed |
| TypeScript | Passed |
| Offline business evaluation | 110/110 passed |
| Capacity evaluation | 8/8 passed |
| API and web build/deployment | Both healthy |
| Readiness and frontend proxy | Ready |
| Deployed frontend bundle | Ranking notes, partition positions and empty state verified |
| Customer service containers | All nine IDs/start times unchanged |
| New live provider requests / warehouse writes | 0 / 0 |

## Existing reports

Existing approved queries and saved results are not silently rewritten.
For the observed report, start a new question with the same request, review and
approve the corrected product-only plan, then generate the report. A browser
refresh alone cannot recalculate the approved query at a different grain.
No new live provider qualification was performed for this recovery; the
regressions replay the observed interpretation and use independent fixtures.
