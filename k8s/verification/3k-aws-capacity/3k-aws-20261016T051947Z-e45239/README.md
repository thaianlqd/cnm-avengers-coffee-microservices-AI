# AWS capacity evidence —16 October2026

See [latest report](../../../../K8S_3K_AWS_CAPACITY_REPORT.md). Source/application
d715ba7423d012e068eb5b447b806c9a4967320b (lowercase in source-manifest), no app edits.
`session-results.json` indexes all six completed points, exact merged HTTP metrics,
per-node/Pod peaks, per-generator adequacy and CSV count checks. Setup-only failed
sampler is separate in diagon-g3-500. Highest single normal375PASS is not a long/
repeatable claim; retained repeatable250, long500FAIL,3Knotrun/notqualified.

Each point contains k6/analysis/metadata, compact exact metric-points and hashes,
actual timestamped stage-vus, 5s route windows, full target HPA/Pod/node timeline,
generator CPU/RAM/RSS/FD/ENA samples, original post-smoke, natural recovery and
correlation.csv. Every original request is accounted for in CSV. Large original
raw JSON stayed outside Git on ephemeral disks; compact numeric observations
remain sufficient for exact global quantile/count replay. Logs/observers are gzip.
Unknown metrics remain missing, never zero. Per-route window percentiles are not averaged.

`controller/` preserves session-specific orchestration and final postprocessing;
private session is gone, so do not execute load drivers now. `source-manifest.json`
distinguishes frozen app source from dirty-helper versions/final reanalysis hashes.
`diagnostic-hold-summary.json` includes interval selection/limitations; diagnostic
points are not qualification. `orchestration-recovery.json` explains original failed
smoke export recovery with no load rerun.

`final-cleanup.json`, `all-phase-final-inventory.json`, `local-control-cleanup.json`
verify complete cleanup; `interruption-recovery.json` documents the two orphan SG.
`runtime-cost.json` distinguishes configured budget from unavailable actual billing/
termination history. `authorization.json` records scoped DB egress/generator approval;
no credentials, raw payload bodies, private keys or live control URL are retained.
`verification.json` records245PASS+1skip plus22local/14AWSstatic. `SHA256SUMS` covers
all evidence files except itself. No production3000-user or nodeHA claim.
