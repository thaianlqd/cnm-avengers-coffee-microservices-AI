# V2.6 result reliability — 2026-10-07

The live API log recorded a successful proposal followed by `result_contract`
at generation. It did not retain the failed operation or validator rule, so the
original operation cannot be attributed conclusively from that log alone.
Read-only replay against the current warehouse reproduced two general failures:

- Complete grouped product/store results fetched an overflow row at 101 rows,
  then failed a 100-row execution contract. This was a completeness budget, not
  a user request for Top N.
- The `hour` dimension uses `EXTRACT(HOUR FROM ...)`, returning PostgreSQL
  `Decimal`. The validator interpreted it as a timestamp because it checked the
  source column rather than the projected expression.

The supplied second-attempt response identifies a separate proposal failure:
`store_performance` omitted metrics and its blueprint had no default, despite
the lens being labelled as a branch revenue view.

## Changes

- Complete grouped operations can return up to 2,000 rows, with one overflow
  sentinel. Scalar, explicit user limits, detail and global Top N retain their
  own limits. SQL AST equality and independent result checks remain mandatory.
- Over-budget populations fail with a suggestion to narrow scope/time or use
  Top N; they never become an incomplete report.
- Raw projected timestamps still undergo date/timezone bounds validation.
  Expressions derived from timestamps are not parsed as raw dates.
- The revenue lens defaults to `store_revenue`. Explicit AOV/customer metrics
  remain authoritative; blueprints with genuinely absent defaults still clarify.
- Large single-dimension bar views display up to 20 groups with the largest
  displayed metric, labelled with displayed/total group counts. Result tables
  and analytical evidence retain all validated rows. This presentation subset
  does not change the analytical query into Top N or allow a partial donut.
- Fresh, cached and stored-result failures record controlled validator codes,
  operation type, row count and budget. Logs contain no SQL, filters, row values,
  operation identifiers or raw exception/provider prose.

## Verification

- 458 backend tests passed with global external HTTP and database guards.
- 32 dashboard frontend tests passed, including visible subset disclosure.
- TypeScript check and production frontend build passed.
- Docker images for `analytics-api` and `web-ui` built successfully.
- Read-only warehouse replay after the fix passed product sales (118 rows),
  branch revenue (416), branch order volume (417), hourly load (16), and the
  tested sales/product/payment trends and distributions.
- End-to-end proposal → approval → report used **scripted AI decisions** and
  **actual read-only warehouse SQL**: Top 5 succeeded with one query; a six-view
  deep sales plan succeeded with six queries and five charts plus scalar KPIs.
  Proposal executed zero analytical SQL; approval called zero providers.

Real AI/provider and embedding calls: **0**. Diagnostic SQL ran in read-only
transactions, with no direct DML/DDL or changes to business records.
These checks prove execution reliability for validated plans; they do not prove
that a live model will always return a valid plan on its first attempt.

The running development API mounts source and reloads automatically. Metadata
fingerprints changed, so start a new proposal instead of reusing an old session.
The existing startup hook also reran its warehouse schema/view initialization
DDL on these automatic reloads (the log reports 21/21 active views). Therefore
the entire running-service session cannot be claimed to have executed zero DDL.
Frontend images/builds are prepared separately; no service was explicitly
started or restarted. Unrelated chatbot and review-backup files were untouched.
