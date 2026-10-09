# V2.6 bounded planning repair and chart explanations

## Incident and scope

Logs around 2026-10-07 01:59–02:01 UTC show two generate requests rejected with
`visualization_unavailable`, then a proposal rejected with `invalid_analysis_contract`,
followed by the successful session supplied by the user. Historical logs do not
contain the failed visual's shape; its exact omitted-chart reason cannot be recovered.

Offline regression found two concrete visual coverage defects: a complete
composition with 118 groups was rejected before its existing six-plus-Other
renderer could run; and deduplicated equivalent operations lost coverage of their
second query reference. Both are fixed. When a valid result exceeds safe visual
shape/density limits, the report retains its full result table with an explicit
limitation and partial completion status. Numerical/result validation still fails
closed. Empty requested populations still require clarification.

## Request-owned allowance

The production compose profile explicitly enables at most two planning calls.
A valid first decision still uses one. A malformed/invalid contract or structured
UI scope conflict may receive one compact repair; timeout/connection/HTTP 500,
502, 503, 504 may receive one transport retry. Authentication, quota, unsupported
schema, genuine business ambiguity, SQL failures and invalid results do not retry.
The shared allowance is consumed before HTTP and survives stateless transport
reset. Models and providers never change. Approval and report synthesis use zero
provider calls.

Repair feedback uses controlled validator codes, the original question/UI,
delivered semantic manifest, relevant lens definitions and a bounded rejected
decision. No SQL or result rows enter repair context. Partial preflight state is
cleared, filter resolution shares the same finite lookup allowance, and the second
plan cannot reduce the number of requested components. Input/output usage sums
both attempts; diagnostics retain the retry reason and measured repair body size.
The strict one-call profile remains available through max calls 1 / repair 0.

## Presentation and result verification

Each chart now has a visible, deterministic explanation beneath its title,
including Top N, full-population composition, display subset or clipped weekly
buckets as appropriate. These explanations also work for stored reports and do
not call AI. Desktop keeps two charts per row; mobile stacks cards.

The supplied successful report's charts reconcile with its result sets:
Top 10 quantities (117 first), revenue display top 20 of 118 (11,424,000 VND first),
17-category quantity total 10,400, and all 14 weekly observations. Comparable full
weeks run from July 6 (869) to September 21 (663): −206 / −23.7054%.
The clipped first/last weeks remain visible and are marked, excluded from this
change comparison. This check reconciles the supplied payload; it is not an
independent re-extraction of the warehouse in this turn.

## Validation

- 475 backend regressions passed with external HTTP/DB globally blocked.
- Native Gemini and its OpenAI-compatible adapter tested with mocked HTTP:
  two-call shared guard, transport state reset, cumulative token accounting.
- 70 frontend tests, TypeScript check and production build passed.
- Local isolated browser fixture checked desktop/mobile: paired desktop charts,
  four visible explanations, no page overflow or time-axis label overlap.
- No real provider/embedding calls made during qualification.

## Local deployment

Both Docker images were built. The running web service serves the new
`index-Ddf8vrdS.js` bundle (HTTP 200); only analytics-api was recreated to apply
max calls 2 / repair 1. Local health is OK, metadata status ready and provider
budget 2. Service startup reran its existing warehouse initialization hook.
No review seed backups or unrelated chatbot files were edited by this task.

The requested one-workflow live Gemini verification was blocked before
execution by automatic approval review: question plus internal semantic
metadata would be sent to an external provider without specific approval for
that payload. No workaround or alternate provider call was attempted. Live
provider verification remains pending explicit user permission; zero real AI
calls and zero AI tokens were consumed by this task.

## Follow-up: business overview first-attempt rejection (2026-10-07)

The local API log at 02:28:51 UTC records a proposal rejection with
`domain_lens_invalid`; the following successful proposal was created at
02:29:32 UTC. The failed decision itself was not logged, so its exact lens/field
cannot be reconstructed. The two new attachments contain the successful attempt.

The retry loop handled structural contract errors but `accept_plan` explicitly
passed `domain_lens_invalid` through as unsupported. Therefore this semantic
validation error bypassed the second-call allowance even with the correct Docker
configuration. Lens validators now return controlled contract issues for unknown
or undelivered lenses and incompatible operations, metrics, groupings,
granularities and incomplete compositions. Missing genuine business choices and
unavailable snapshot history retain their clarification/unsupported behavior.

In the two-call profile, preflight collects independent requested-operation
errors with their operation index before the single repair. No analytical SQL
runs during this preflight. Strict one-call diagnostics retain their prior paths.
Compact blueprint grammar now declares allowed operations/granularities and
required metrics; repair includes that grammar, avoiding unexplained lens errors.
Both complete request bodies remain capped at 24,000 characters. A valid first
response still uses one call, the second is used only when eligible, and there is
no third call or provider escalation.

The supplied business report was replayed locally with external HTTP and database
connections blocked: all five result sets pass the current result validator.
Store revenue sums to 1,438,693,000 VND, exactly matching all weekly revenue rows.
The full-week comparison is July 6 (123,402,000) to September 21 (100,161,000):
−18.8336%; clipped boundary weeks remain visible but excluded from that comparison.
This is reconciliation of the supplied payload, not an independent warehouse
re-extraction or live Gemini verification.

The same validated store rows now support a complementary revenue/AOV scatter,
with all 1,215 paired observations. It is eligible only for a complete unranked
single-entity aggregate containing additive and average metrics, with sufficient
nonconstant paired values. No new SQL or AI call is needed. Scalar comparisons
remain available; scatter never implies causation. Axes have numeric ticks,
units and full-value tooltips. The replay has eight charts across four types:
horizontal bars, donut, area and scatter. Eight charts are visible by default,
in two columns on desktop. Each has a concise semantic explanation. Payment
codes have readable labels. Single-series tooltips identify the metric rather
than its grouping dimension.

Summary findings cover distinct requested scopes before extra findings (maximum
six), retaining the previously omitted fifth revenue-trend finding. Four KPI
cards preserve a comparable trend and follow analytical-operation order, so a
complementary chart cannot displace its primary KPI. Averages and distinct buyer
counts are never summed.

Validation: 479 backend qualification tests passed with HTTP/DB globally blocked,
plus the additional exact business-question five-component repair regression
passed separately (480 unique passing tests). All 73 frontend tests, TypeScript
check and production build passed. Desktop/mobile isolated browser fixtures show
eight explanations, paired desktop cards, no page overflow and no time-axis label
overlap. Both images were rebuilt; the running frontend serves
`index-D_d1wMUQ.js` (HTTP 200), and the bind-mounted API reports ready with allowance
2. Its lazy local metadata cache was warmed through the read-only capabilities
endpoint. No real provider calls were made. The earlier auto-review restriction
on live Gemini verification remains respected.

## Follow-up: context capacity for six-domain city comparison

Logs at 2026-10-07 05:23:48 and 05:24:08 UTC record
`one_shot_context_budget_exceeded` before any provider call. The supplied failure
payload has a 28,647-character body, six protected domain packs and a 24,000 hard
limit. These are local packing limits, not a Gemini context-window rejection or
a result-row limit. The user request itself is short.

Natural-input packing now shares repeated whole blueprint list values through a
single `blueprint_sets` table, with an explicit wire grammar. This is a wire-only,
lossless projection: canonical catalog IDs, defaults, required metrics, allowed
operations, grouping and granularity definitions are retained. Catalog/payload
objects are not mutated. Sharing precedes optional whole-subject sharding;
protected domain packs and their complete semantic references remain mandatory.
Repair messages carry the same reference table and grammar.

The normal packing target remains 23,000 characters with a 24,000 normal
allowance. After compaction, larger required natural-input contexts can reserve
only their measured size plus modest transport headroom, up to 48,000 characters
by default. An explicitly configured `DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS`
remains authoritative, including a stricter 24,000 cap. Legacy input retains its
24,000 allowance. Provider transports enforce the measured request-owned limit;
there is no extra discovery/provider call, fallback or synthesis. This supersedes
the earlier universal 24,000-character cap described above. The change expands
knowledge capacity, not the existing eight-operation execution contract.

Offline reproduction of the exact question/context/expectation in the screenshot
now measures 22,909 / 22,858 characters (native / compatibility), preserving all
six protected domains, both cities and the previous-month period. Extended probes
with eight and sixteen explicitly named domains measure 27,974 and 31,850 maximum
body characters, reserving 29,000 and 33,000 respectively. These probes validate
knowledge delivery and a scripted valid city comparison, not real AI intent
coverage of every named domain or historical availability of snapshot metrics.

Capacity failures now use `PLANNING_CAPACITY`, distinct from the genuine
`REQUESTED_SCOPE_TOO_LARGE` operation-count response. The UI does not describe a
server packing failure as missing user input, nor duplicate its message. Genuine
business ambiguity, snapshot/history limits and result checks are unchanged.

Validation: the full backend qualification passed 486 tests with external HTTP
and database calls globally blocked. New coverage includes exact-request replay,
lossless reconstruction of every delivered blueprint, protected domain coverage,
8/16-domain expansion, explicit hard-cap rejection before HTTP, shared-context
repair and both real transport builders with mocked HTTP. Frontend typecheck,
tests and production build are also rerun. No live Gemini calls are made.

Final local verification for this follow-up: the exact six-domain packing replay
also passes against the actual local schema (schema introspection only; provider
scripted, subsequent HTTP/DB blocked), with the same 22,909-character maximum.
The strengthened protected-reference assertions pass all six context tests.
All 74 frontend tests and typecheck/build pass. Both Docker images were built;
the running frontend serves `index-CgNvSfBA.js` (HTTP 200), and the API reports
ready with provider allowance 2 after read-only metadata-cache warmup. No seed
backups were edited, and no real AI tokens were consumed during verification.
