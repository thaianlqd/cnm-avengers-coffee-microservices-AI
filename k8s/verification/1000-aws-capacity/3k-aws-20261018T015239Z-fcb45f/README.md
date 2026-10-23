# Fresh two-target 1,000 VU qualification — 18 October 2026

**1.000 VU QUALIFIED: normal 120s và long 300s đều STABLE PASS. Cleanup verified, session CLOSED.**
RunId `3k-aws-20261018T015239Z-fcb45f`. See [final report](../../../../K8S_1000_TWO_TARGET_CAPACITY_REPORT.md).

Scope: two targets + at most six generators `m7i-flex.large`, 95 minutes, Free plan only,
account 956035085549/ap-southeast-2. Same aggregate 3 USD credit cap; prior closed compute
upper bound 0.729179626938 USD included. No additional 3 USD authorization.
`approved_additional_credit_usd` is a legacy guard field;
`approval_cap_is_same_aggregate_not_additional_three_usd=true` and `new_credit_cap_authorized_usd=0`
state its current meaning. Price 0.1197 USD/instance-hour; planned total including reserves 2.995379626938 USD.
Cost figures are upper bounds/estimates, not invoices or measured credit debits.

Fresh progression: 500 normal → 750 normal/long300s → healing/rolling → 1,000 normal/long300s.
Read actual `qualification.json`, `progression.json`, point `analysis.json` and `artifact-consistency.json`.
Normal 1,000 used recovered artifacts from the original load after encrypted result delivery failed;
no rerun, workload or threshold changes. See `control-recovery.json`, recovery logs/controllers.
Native lifecycle and guest cleanup deadline stayed unchanged. Full tagged streams existed only on
terminated AWS disks; retained numeric observations/VU timelines support exact merges.
All synthetic fixture logs are labelled, never used as measured capacity; response bodies are not retained.

`final-all-phase-cleanup.json`: all known benchmark-owned EC2/SG/EBS/keypairs/ENI zero,
private job files zero, key/token removed, local controls stopped. `cost-summary.json` records bounds.
No app/DataPlatform/Compose/Docker Desktop resources/IAM/plan/quota changes.
Public hashes: this run and parent `SHA256SUMS`. Secret/AST/test checks in `validation/`.
Only commit/push features_k8s; no merge or auth/remote changes. Do not reopen the closed approval.
