# V2.7 evaluation methodology

The runtime verification score and model understanding accuracy answer different questions. Runtime scoring checks an individual declared report against catalog rules and its validated results. A golden evaluation checks a system's selected meaning and results against independently authored expected answers.

## Dataset and partitions

`analytics-api/evals/golden.py` version 2.7.1 deterministically enumerates **104 cases**:

| Family | Cases |
|---|---:|
| 38 lens families, two phrasings each | 76 |
| Explicit multi-domain requests | 8 |
| Unsupported, ambiguous, unavailable-history and adversarial cases | 12 |
| Exact city/time/ranking contrasts | 4 |
| Partial scope requiring approval | 2 |
| Bounded repair | 2 |

All 16 domains and 38 lenses are represented. Dev has 76 cases and holdout has 28. A family's paraphrases stay in one split. Difficulty groups are simple, medium, multi-domain, deep, ambiguous, unsupported and adversarial. The split is authored and inspectable; it is not an independently blinded test set. Freeze the dataset/version/hash before evaluating a candidate model. Do not tune prompts on holdout outcomes and then describe that same holdout as unseen.

Each case has four user inputs (`question`, `time`, optional `analysis_context`, optional `analysis_expectation`), expected outcome, independent expected domain/lens/operation/metrics/grouping/filter/time/ranking, unavailable components when relevant and a dev/holdout family. Omitted optional text is empty. Negative cases also require the correct issue category, nonempty missing information and a suggested action. A generic rejection cannot pass solely because its broad outcome matches.

Scripted decisions exist only as test adapters. Production services do not import the golden dataset or fixture. The examples are never a routing table for real user prompts.

## Independent result oracle

`fixture_warehouse.py` creates 17 ephemeral synthetic Silver tables. Curated rows include multiple cities, products/categories, qualifying/cancelled orders, distinct buyers, vouchers, payment statuses, current shipper/stock snapshots, review counts, shifts, signed reconciliation, surveys and favorites. Production SQL is still compiled and guarded normally, then translated to SQLite for this disposable read-only fixture.

Expected results come from a separately authored Python oracle for all 33 metrics, with explicit populations/status filters, grouping and value rules. The oracle does not call the production compiler or execute its SQL to derive an expected answer. It compares typed row identities and values, ignores row order, and uses a 1e-6 numeric tolerance. Extra/missing rows, wrong identity, wrong cohort, time, ranking or filter fail. It matches multiple expected operations one-to-one rather than allowing one matching lens to cover several operations.

This fixture is intentionally small. It detects contract/cohort/arithmetic errors; it does not prove correctness for every production distribution, every timezone boundary or all schema drift. Expand fixtures and authored expectations when adding business definitions.

## Separate scorers

Semantic scoring reports micro precision, recall and F1 separately for domain, lens, metric, grouping, filter, resolved period/granularity, operation, ranking and executable component coverage. Equality filters and singleton membership normalize to the same meaning; value order is irrelevant, operators and resolved dates remain significant. Missing requested components reduce recall. Optional supports cannot increase requested recall.

Result exactness uses the independent oracle. Dashboard scoring reuses production `chart_reason`, `comparison_reason`, renderer and quality coverage checks, including exact data/unit/scope, duplicates, completeness and prohibited share displays. Grounding checks controlled facts/numbers/narrative. Correct refusals and actionable clarifications count as correct outcomes, while unexpected clarification on supported unambiguous inputs fails.

SQL differing from the canonical compiled SQL, invalid contracts, ungrounded statements and invalid charts are hard gates. They cannot be averaged away by good results elsewhere. The summary reports each metric's eligible denominator and Wilson 95% interval; undefined metrics stay null rather than zero or perfect. Overall pass requires the expected outcome, semantic match, safety and all applicable result/chart/grounding checks.

First-attempt validity and repair rate are distinct. The two scripted repair cases deliberately submit an invalid mapping first; eventual success does not rewrite their first attempt as valid.

## Offline qualification versus real observations

```bash
python -B -m evals.run_eval --mode offline --output /tmp/v27-evaluation
python -B -m evals.run_eval --mode offline --split holdout --output /tmp/v27-holdout
```

Offline mode blocks HTTP and live DB connections. It exercises actual request/approval/compiler/result/evidence/dashboard/scoring code using scripted decisions and the fixture. Its 104/104 result is **contract qualification, not model accuracy**. Real provider, external judge, external embeddings and live DB mutations are all zero. Token usage is unknown/null; scripted wall time is not provider latency.

For an actual model comparison, an operator must independently collect model outputs against the same controlled physical fixture schema, catalog fingerprint, reference date and four inputs, recording the plan and resulting report. Collect dev and holdout separately with fixed model ID and configuration. This task did not collect such outputs or call any provider.

Import independently collected reports as JSONL:

```json
{"case_id":"product_volume_1","run_id":"manual-2026-10-07-01","model_id":"provider/model-version","report":{"status":"success","...":"full report payload"}}
```

```bash
python -B -m evals.run_eval --mode observations --observations /tmp/observations.jsonl --output /tmp/v27-observed
```

The example is schematic; `report` must contain the actual complete payload. A live warehouse report with different rows is not a valid observation against this fixture oracle. Observation imports perform no provider calls themselves. `real_provider_calls=0` in their summary describes the evaluator process, **not** the external collection cost. Missing model attribution prevents a model-accuracy-measured claim. Model/run breakdowns should be used for comparisons; do not compare mixed-model aggregate results.

The output contains dataset SHA-256, catalog fingerprint, aggregate/split/domain/difficulty/model/run results, bounded-repair success, failure IDs/reasons, observed token usage, average provider attempts and p95 measured timings/context. No token prices or cost estimates are fabricated when token usage is absent. Runtime and restored verifier timings must be labeled separately from provider/request latency.

## Stability

`CRITICAL_IDS` names 20 cases spanning scalar/ranking/share/trend, multi-domain, snapshot/history, ambiguity and adversarial boundaries. Collect **three independent manual runs per model and case**. Distinct run IDs are required; duplicate observations are rejected. Stability reports all-runs-pass rate, stable-outcome rate and every missing/incomplete critical case. The offline scripted run is never repeated and relabeled as model stability. Current model stability is **not measured**.

## Thesis reporting and baselines

Report four separate layers: model semantic selection, independent numerical results, dashboard/grounding safety and runtime verification. Include sample sizes, Wilson intervals, split construction, dataset hash, model/version, call policy, provider errors, refusals, token observations and evaluation limitations. Count correct refusal as correctness; never force a report for unsupported questions.

Archived V2.6 versus V2.7 context-body sizes were measured with the same local no-execution profile. No V2.6/V2.7 live model accuracy baseline was collected. Therefore no model-accuracy improvement percentage, first-click success probability or production stability gain is claimed.

DeepEval, promptfoo and Ragas were considered as optional future adapters. They are not installed or required here: deterministic algebra/result/chart checks cover the current contracts without extra dependencies or an LLM judge. Ragas-style retrieval metrics would need independently labeled retrieval relevance and a distinct evaluation objective. Any later external judge/embedding experiment must be explicitly authorized, budgeted and reported separately from these zero-call checks.
