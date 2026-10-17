# Bounded Kubernetes capacity evidence — CLOSED

Global measured outcome: **500 VU repeatably QUALIFIED;750 INVALID GENERATOR;
1000 NOT RUN**. See [the final report](../../../../K8S_1K_CAPACITY_REPORT.md).
All known benchmark resources and private control jobs/keys/tokens were cleaned.
Ownership-scoped final verification includes ENIs; unrelated AWS resources are out of scope.
The user requests **local delivery only: no GitHub push/authentication changes or merge**.

Run-scoped controllers preserve the concrete commands/provenance used. They are not
instructions to rerun an expired fleet: do not reuse its IPs/certificates/tokens or
provision without fresh inventory, price, source provenance and approved cost scope.

This diagnosis fleet contains baseline/diagnostic results and an incomplete500 start. It did not itself obtain the two quiet500PASS; those belong to the next fleet.

---
Run setup notes (historical; final outcome above supersedes active wording):

# Bounded AWS 1K capacity phase

RunId retains the existing `3k-aws-*` ownership format; the goal of this phase is **1000 VU**, subject to the preserved qualification gates. Starting Git HEAD: `0a9b928c7c596c8772cf83019342f392e96a4d2e` on the isolated `features_k8s` worktree.

The user approved an additional USD 3.10 maximum and up to three generators when measured inadequacy justifies them. `generator2-inadequacy.json` and `generator3-inadequacy.json` hash the actual historical inadequate-generator analyses. They are evidence for generator provisioning, not new application capacity results.

`source-manifest.json` identifies frozen source contents. The image tag is a **source-tree digest**, not an uncommitted Git SHA. `build-checks.json` records immutable image IDs, amd64 architecture, and 168 passing backend tests executed on AWS. The unchanged workload SHA identifies full JSON validation, gzip, four sequential GET endpoints, and 3-second think time.

Only existing external DB connection settings were transferred to authenticated AWS recipients, within the explicit approval. Startup auth/payment placeholders were generated on AWS. No real payment/email/auth credentials were copied. `database-readonly-audit.txt` records an explicit READ ONLY transaction and schema-presence check; there was no seed, migration, reset or data restore. The application demo startup flag is not a SQL permission boundary.

Point folders retain exact compact numeric metric observations, raw-observation hashes/counts, actual VU timelines, per-route 5-second HTTP windows, generator resource metrics, Pod/node/HPA timelines, post-smoke and natural recovery. Numeric diagnostic logs follow Pod UIDs continuously through HPA deletion. Kernel collectors retain numeric host/container CPU, connection and allowance counters, without addresses, SQL parameters, request bodies, credentials or process environments. Metrics-server log categories retain no raw log URLs or text.

`controller/` contains the concrete run orchestration. Private jobs, credentials, cluster tokens and control URL are kept only in the gitignored mode-0700 session folder and must be removed after verified AWS cleanup. Original bulky k6 streams live temporarily on AWS disks; the exact numerical observations needed for quantiles/count checks are exported before termination. Diagnostics-enabled points are explicitly ineligible for qualification.

The Mac DataPlatform worktree and Docker runtime are outside this phase. Final results, experiments and cleanup are recorded in the final report and checkpoint.
