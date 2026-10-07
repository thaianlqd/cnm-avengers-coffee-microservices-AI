# V2.6 analytical dashboard presentation

The report now opens with a compact scope summary, up to four verified highlights,
four findings, and six charts. Additional charts, full narrative, result tables,
and calculation evidence remain available through expandable sections.

## Charts and data

- Desktop charts share one continuous two-column grid across story sections,
  ordered as ranking, comparison, composition, and trend. Mobile uses one column.
- Long category names use horizontal bars with ten rows per page. Top 10 therefore
  shows every ranked product at once. Tooltips keep
  full names and values; zero and negative values retain their actual proportions.
- Additive, nonnegative time trends use area charts; averages use lines. Small,
  complete, additive category partitions can use donut charts. More than eight
  categories show the six largest and an explicitly labelled remainder, preserving
  the exact full total and every original result row. Ranked, truncated,
  negative, and nonadditive results are not presented as composition totals.
- Chart accents remain stable and categorical bars use multiple colors. Time axes
  use at most five short date labels; tooltips preserve full dates. Redundant titles
  are removed, and detailed
  chart controls live in the card menu.
- Equivalent charts are merged only when validated query semantics match. Matching
  displayed numbers alone never establish equivalence. All query results and
  evidence remain accessible.
- Highlights prioritize evidenced leaders, maxima, complete totals, and period
  changes, covering distinct analytical operations. Averages and unique
  customer counts are never summed into fabricated dashboard totals.
- Tables support search, pagination, and a full CSV export. Calculation evidence
  supports search, operation filtering, eight entries per page, and direct links.

## Verification

- Backend qualification: 463 tests passed. The qualification runner blocks
  external HTTP requests and database connections.
- Frontend suites: 69 tests passed; TypeScript checking and production build passed.
- Headless Chromium checks rendered the actual dashboard components and production
  CSS at 1440px desktop and 390px mobile widths using a verified warehouse snapshot.
  Desktop has two charts per row; neither viewport has document overflow or
  overlapping time ticks. Previous synthetic checks also covered 1,200 evidence
  items, paging, and scope filters. This is component visual QA, not a new AI call.
- Local Docker images were built. The running web UI received the compiled assets
  and index without a container restart; the served index matches the build, and
  the new JavaScript asset returns HTTP 200.

An existing unsaved report lives in browser memory. Save it before refreshing if
it needs to be retained. Saved reports also use the compact presentation, with
conservative query-plan matching when the newer semantic chart key is absent.

## Product report verification — 2026-10-07

Read-only compiled queries for Hồ Chí Minh, 2026-07-01 through 2026-09-30, and
catalog-defined eligible order statuses confirmed:

| Observation | Verified value |
| --- | --- |
| Mochi Kem Chocolate, first by product identity | 117 products |
| Sum of the Top 10 selected products | 1,097 products |
| Highest product revenue: Bánh Trung Thu Thập Cẩm Bát Bửu | 11,424,000 VND |
| All 17 categories | 10,400 products |
| Bánh Ngọt | 1,181 products; 11.3558% of the complete total |
| First complete week, starting July 6 | 869 products |
| Last complete week, starting September 21 | 663 products |
| Change between those complete weeks | −206 products; −23.7054% |

The former −350 / −56.09% calculation compared a five-day boundary week against a
three-day boundary week. Trends now retain all buckets in the chart, mark clipped
weeks with an asterisk and actual covered dates in tooltips, and calculate change,
extrema, slope, and volatility from complete buckets. Fewer than two complete
buckets produces a coverage explanation instead of a change KPI. This does not
prove that source data is complete within each calendar bucket.

Older report presentations recalculate an evidenced scalar trend comparison from
their stored chart observations when scope clipping is identifiable. Newly
generated backend reports carry the corrected evidence into their narrative and
exports. Product identifiers remain authoritative: identical displayed product
names are not silently merged.
