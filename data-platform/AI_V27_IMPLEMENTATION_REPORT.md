# V2.7 implementation report — A–AN

Date: 2026-10-07. Scope: Data Platform only. Detailed behavior is documented in [architecture](AI_V27_VERIFIABLE_ANALYST.md), [evaluation methodology](AI_V27_EVALUATION_METHODOLOGY.md) and [manual matrix](AI_V27_MANUAL_MATRIX.md). Machine-readable qualification evidence is under [evaluation/v27](evaluation/v27).

## A. Starting branch / HEAD / status

Initial inspection: `branch_thaian`, HEAD `592c9a2771649bbfbd5880e5714f8eeeb1a5cfde`. The pre-existing dirty file was `avengers-coffee-system/services/ai-service/tests/test_reported_compound_user_turns.py`; it was left untouched. During the task an external commit advanced HEAD to `c7d75366d0afa0a4c1ee95f1363d87db5bee1b3c`. That user-side history was preserved. The assistant did not commit, reset, checkout, stash, merge, rebase, stage or push.

## B. V2.6 architecture discovered

Natural input uses local domain retrieval and compact global knowledge, one structured decision, validated lens blueprints, catalog algebra compilation, explicit plan approval, read-only execution, result contracts, deterministic evidence, visual grammar and controlled narrative. There is an existing optional one-round contract repair with a shared provider budget. Saved modules revalidate definitions/fingerprints and rerun approved logical operations. Word export renders report data. V2.7 extends these boundaries rather than adding an autonomous agent loop or SQL-producing model.

## C. Catalog and blueprint counts

16 domains, 38 lenses, 38 blueprints, 33 metrics, 26 dimensions, 35 business relationship hints. Synthetic and live-local read-only metadata audits both found no errors and no unavailable domains. Live audit compiled metadata-only artifacts; it did not execute analytical queries.

## D. Runtime Quality Assessment architecture

Pure `analysis_quality_service.py` plus typed `analysis_quality_contract.py`, version 2.7.1. Fresh reports use internal validated artifacts. Stored reports recompile logical operations with a forbidden executor, revalidate rows and recompute canonical evidence/visuals/narrative. UI, module rerun and export use this assessment; there is no LLM judge.

## E. Exact scoring formula

`min(Σ round(weight × passed_fraction), cap)`: requested coverage 30, semantic consistency 20, result integrity 20, evidence grounding 15, visualization appropriateness 10, limitation disclosure 5. Applicable fractions and denominator rules are specified in the architecture document. Scalar-only answers receive full visualization credit with a not-applicable label.

## F. Caps and unscored rules

Missing requested parts or invalid/duplicate/misleading charts cap the score at 74. Execution-only coverage, absent/failed grounded claims, uncovered eligible visuals or missing disclosures cap it at 89. Legacy/stale/failed/malformed/oversized reports, invalid results and empty/all-null requested observations return `score=null`, status `not_scored`. No failure is relabeled as an excellent successful report.

## G. Request-coverage model

Natural tool schema requires a component array. Component IDs, short goals, known domain/lens, role, status, operation mapping and controlled reasons are validated before execution. All executable requested operations must be mapped. Unavailable requirements remain visible; partial execution requires explicit user approval. Legacy payloads remain readable but have execution-only coverage. Repair cannot drop an originally declared requested identity.

## H. Completed / missing / unverified

Structured assessment lists completed and missing requested components, unverified claims/causes, derived limitations and suggested actions. Business labels and evidence references replace raw technical dumps. The card sits below charts and above tables, including a legacy placeholder. Word includes the same sections and next actions. A runtime score does not prove complete natural-language comprehension; independent golden scoring addresses that distinction.

## I. Domain Intelligence

All lens examples, business labels/questions and capability flags remain metadata owned. Selected packs, compact global lens directory, protected direct matches and physical availability checks improve discoverability without new execution authority. Weak/unknown retrieval broadens candidates and records confidence. No production import of golden questions or fixture IDs is allowed by regression tests.

## J. Metric semantics

All 33 metrics have explicit definition, population, grain, aggregation behavior, per-dimension/time additivity, historical capability, quality direction and invalid uses. AOV/store AOV are corrected from sum to average metadata. Buyer/registration populations, cancellation/status cohorts, payment versus sales value, snapshots, review exposure, signed cash differences, favorites and survey denominator limits are explicit.

## K. Dimension semantics

All 26 dimensions describe business grouping, filtering, hierarchies and known/unknown cardinality. SQL compatibility remains catalog checked. No invented cardinality or approximate group truncation is used to claim full-population analysis.

## L. Relationship semantics

35 authored related-population hints explain what a relationship can and cannot establish. Physically validated directional paths, metric grains, clocks and cohorts still determine executable joins. Related populations are disclosed; they cannot silently become shared denominators or causal evidence.

## M. Retrieval improvements

Two example intents per lens are used locally as weak matches; all examples are not dumped into prompts. Strong direct matches stay protected. Unselected lens directory rows retain business labels, metric/grouping defaults, operation and capability flags. Repeated blueprint values and compatibility lists are shared on the wire. Low-confidence retrieval does not authorize guessed SQL.

## N. Context-size changes

Same no-execution scenario profile against archived V2.6 and V2.7: product native body 22,798 → 22,696 characters; six-domain request 22,900 → 29,165; unknown vocabulary 22,053 → 22,604. Six-domain V2.7 allowance expands to 31,000 after compaction, within hard 48,000; ordinary soft target stays 24,000. The larger multi-domain context is a measured metadata tradeoff, not a measured accuracy gain. Actual native/compatibility sizes and manifests are in profile artifacts.

## O. Provider-call policy

One initial plan plus at most one eligible targeted repair. No escalation, fallback, embeddings or post-result synthesis. Scoring, deterministic narrative and saved-report verification add zero calls. Auth/quota/provider availability, genuine ambiguity/history/unsupported definitions, SQL execution and result failures do not trigger automatic AI retry. This policy cannot guarantee every external provider request succeeds.

## P. Bounded repair

Repair receives concise validation issues and delivered semantics, preserves scope and never exceeds the same shared two-call budget. Two authored repair cases now verify first-attempt rejection and second-attempt success; first-attempt metrics retain those failures. Repeated invalid decisions and dropped requested components stop safely before SQL.

## Q. Actionable failures

Outcomes distinguish SUCCESS, PARTIAL_AVAILABLE, NEEDS_INPUT, INSUFFICIENT_DATA, UNSUPPORTED and SYSTEM_ERROR. Current-context packing failure is presented as planning capacity rather than falsely blaming business scope. Missing history, genuine metric ambiguity, unknown filters and unsupported forecasting/metrics have business messages/actions. Empty/all-null observations cannot obtain a successful numeric score.

## R. Golden dataset structure

Versioned authored cases separate four user inputs, expected outcome/issue, requested domain/lens/operation/metric/group/filter/time/ranking and unavailable components from the scripted adapter. Fixture and oracle code stay outside production routing. Dataset hash/catalog fingerprint accompany summaries; no full private reasoning is stored.

## S. Golden case count

104: 76 lens phrasings, 8 multi-domain, 12 negative/adversarial, 4 scoped contrasts, 2 partial approvals and 2 bounded repairs. Dev 76; holdout 28. Paraphrases of one family never cross the split.

## T. Domain / difficulty coverage

All 16 domains and 38 lenses. Simple, medium, multi-domain, deep, unsupported, ambiguous and adversarial groups are summarized separately. This authored holdout is inspectable and not claimed as an independently blinded sample. Negative cases include unsupported profit/ROI/forecast, best-criterion ambiguity, unavailable snapshot history, unknown values and malicious/invalid plans.

## U. Deterministic semantic scorer

Micro precision/recall/F1 separately cover domain, lens, metric, grouping, normalized filter, resolved time/granularity, operation, ranking and executable component meaning. Supports cannot hide missing requested work. Exact scope/value differences are not repaired by fuzzy text similarity.

## V. Result oracle

Seventeen ephemeral synthetic Silver tables execute production-compiled guarded SQL through SQLite translation. Independently authored Python metric/cohort/group rules supply expected typed rows. Identity, missing/extra rows and numeric tolerance are checked one-to-one by expected operation. The oracle does not reuse production SQL to derive its answer.

## W. Dashboard scorer

Shares production visual grammar/renderer; verifies data, units, selection, series, scope references, semantic duplicates and requested metric coverage. Invalid share/trend/scatter shapes fail. Scalar requests are exempt from unnecessary chart requirements. Equivalent physical metric views are now merged across domain aliases; the verifier maps each metric and checks both scopes’ values before crediting coverage. Existing two-column responsive dashboard, colors, short ticks and controlled one-line purpose descriptions are retained.

## X. Clarification / refusal scorer

Correct expected outcomes count as correctness only with the expected issue category, missing information and action. Generic nonactionable refusals fail. Unexpected clarification for a supported unambiguous case fails. Safety violations cannot average away with other good cases.

## Y. Stability methodology

Twenty named critical cases, three independent manually collected run IDs per model. Duplicate records are rejected; missing critical cases remain incomplete. Summaries report all-runs-pass and stable-outcome rates per model. No repeated scripted execution is represented as measured model stability. Current live model stability: **not measured**.

## Z. Cost metrics

Offline scripted attempts average 1.0192 per case; maximum two in repair cases. Real token usage remains null. Actual context/body characters and measured local timings are recorded, distinctly labeled from provider latency. The 20-sample restored-verifier profile (four-operation fixture, seven result rows) measured median 65.74 ms and p95 81.26 ms in this run; this is neither worst-case capacity nor live provider latency. See artifacts for evaluation-batch p95 rather than treating scripted wall time as a provider benchmark.

## AA. Optional library decision

No new DeepEval/promptfoo/Ragas dependency or external judge is required. Deterministic result, semantic and chart contracts fit the current evaluation objective. Future adapters require independent observations and explicit cost reporting; no automatic judge or embedding call was introduced.

## AB. Files changed

See `evaluation/v27/files-from-starting-baseline.txt` for the scoped file list. Core additions are coverage/quality contracts and services, golden/fixture/scorer/runner, semantic audit/profile, verification card, two backend test modules and SSR tests. Integrations touch planning/context, sessions/modules, report generation/failures, API verification/export, Word, metadata, frontend load/save/approval, Compose bootstrap guard and documentation. Development-only temporary probes were removed. Existing context tests now account for V2.7 enriched metadata and wire deduplication while retaining hard ceilings and scope checks.

## AC. Tests added

20 V2.7 runtime tests and 13 evaluator tests: 33 new backend tests. Five frontend SSR tests verify accessible true/no-score/partial rendering, escaped text/encoded references, responsive placement and legacy behavior. Adversaries cover tampered data/evidence/KPIs/findings/comments/conclusions/labels, stale metadata, malformed SQL-algebra inputs, absent disclosures, oversize results, scope-preserving repair, no-I/O verification and startup DDL disabled.

## AD. Exact backend results

Final qualification: **519 tests passed, zero failures/errors**. Global HTTP and live DB transports were forbidden. Mocked 400/401/403/404/429/500/503/timeout logs are expected test stimuli, not real provider requests. Synthetic semantic audit: no errors across 38 blueprints. Offline evaluation: **104/104 cases passed**, 92/92 numerical/chart/grounding cases, 3/3 actionable clarifications, 6/6 correct unsupported/history outcomes, two repairs successful, two explicit partial cases successful, zero safety violations. First-attempt validity: 102/104, not 104/104. Wilson intervals and split/domain breakdowns are stored in summary artifacts. These numbers qualify contracts and fixtures; **model accuracy was not measured**.

## AE. Exact frontend results

`node --test src/utils/*.test.mjs`: **79 passed, zero failed**, including five new quality-card SSR checks. Chart grammar, formatting, pagination, date/partial-period, scope and evidence behavior remain covered by the existing utility suite.

## AF. TypeScript and production build

`npm run typecheck`: passed. `npm run build`: passed, Vite 5.4.21, 67 modules. Final local bundle: CSS 45.79 kB, JavaScript 404.13 kB (111.26 kB gzip), index 1.41 kB. No frontend dependency was installed for this task.

## AG. Docker and startup

`docker compose -f docker-compose.data.yml build analytics-api web-ui`: both built successfully. `up -d --no-deps analytics-api web-ui`: both running/healthy. API health returned OK; web root returned HTTP 200 with the new asset. Logs confirm “Warehouse bootstrap disabled; serving existing schemas without startup DDL.” No dependency container was recreated or orphan removed. The unchanged FastAPI startup-event deprecation remains a nonfatal existing warning.

## AH. Real provider calls during implementation

**0 calls initiated by the assistant.** Qualification and evaluator transports are scripted or blocked. Any requests independently made by the user in the open browser are not evaluation samples or assistant-generated provider calls.

## AI. External LLM judge calls

**0.** No judge integration was invoked or installed.

## AJ. External embedding calls

**0.** Retrieval remains local text/metadata matching.

## AK. Live database mutations

**0 initiated by the assistant.** Tests use forbidden live DB connections or ephemeral query-only fixtures. Live audit only introspected local metadata with a read-only transaction/PGOPTIONS and prepared logical artifacts without execution. Warehouse startup/bootstrap was disabled. No live seed, refresh, save, feedback, export persistence, generated report or migration action was invoked by the assistant.

## AL. Manual live matrix

[Ten four-input scenarios](AI_V27_MANUAL_MATRIX.md) specify domain/lens expectations, complete/partial/refusal outcomes, score ranges, chart rationale and maximum call policy. They are ready for the user and were not called live by the assistant. The separate 20-case three-run stability matrix remains unmeasured.

## AM. Remaining limitations

No model-understanding accuracy, live first-click success probability or model stability baseline has been measured. The runtime score checks declared analysis and current contracts, not arbitrary natural-language completeness, provenance authenticity or causal truth. Stored rows are revalidated without a live warehouse re-query. Small synthetic fixtures do not exhaust production skew or time boundaries. Snapshot-only domains still cannot supply history, and no cost/forecast methods were invented. Requests above eight independent operations or a configured hard context/result ceiling still need a truthful scope decision. Catalog drift yields “Chưa chấm” until rerun. Bootstrap now requires explicit operator opt-in for fresh warehouse initialization.

## AN. Final working tree

All assistant changes are restricted to `data-platform/**` and the initial Compose startup guard. The final captured `git status --short` is in `evaluation/v27/git-status.txt`; the capture naturally precedes its own file creation. The user's `.review-seed-backups/**` and chatbot files were not modified by the assistant.

**NO COMMIT PERFORMED. NO PUSH PERFORMED.**
