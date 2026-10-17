# AWS750VU qualification evidence

Run `3k-aws-20261017T074726Z-2acf4e` is the separately approved750-only phase:
3targets and at most5generators, m7i-flex.large, Free plan,90minute controller/guest
bound and2.20USD credit cap. No1000run is authorized by this phase. See
[K8S_750_CAPACITY_PLAN.md](../../../K8S_750_CAPACITY_PLAN.md) and
[K8S_750_CAPACITY_REPORT.md](../../../K8S_750_CAPACITY_REPORT.md).

The frozen application/media source matches the earlier two qualified500 runs;
application code, Dockerfiles and service resource/HPA/cache/DB settings stay the
same. The retained AWS keep-alive flag remains true. This phase expands the
measured generator capacity so750 can be tested at5x150actualVUs, preserving full
JSON/every-item validation, gzip, think3s and all original quality/validity gates.

Raw public native build/test/k6/observer logs are explicitly included even when
global .gitignore ignores.log files. Scoped.gitattributes exempts only their
native trailing alignment spaces from Git whitespace checks. Raw log bytes and
hashes are preserved; source/docs/JSON/CSV retain ordinary checks. No qualification
threshold is relaxed by this formatting policy.

Compact gzip streams preserve every retained numeric observation, with hashes,
counts, actualVU timelines and per-route/per-generator5s windows. Exact combined
quantiles are calculated on AWS from all samples; never average p95. Full original
bulky tag streams are temporary on AWS and are deleted with the disks; the evidence
does not pretend to retain response bodies or all original streams locally.

Runtime/provenance/image checks, baseline fingerprints, natural recovery, availability,
CPU/RAM/FD/ENA/socket/cgroup/kernel counters and strict artifact consistency are
stored with the run. Missing metrics are not replaced by zero. Correlation CSVs
must include every generator and sum to all observed requests. Linux/ENA counters
are distinct layers and are not summed as unique packet drops.

Private control URLs, tokens, keys, decrypted jobs, DB configuration values and
bytecode/cache are excluded from Git. Cleanup must be independently verified for
all known benchmark ownership phases, includingENIs; unrelated resources are out
of scope. Price/cost manifests are estimates/authorized caps, never invoices or
card-debit claims. Refer to the run's final cleanup/qualification records for final
status; this README alone is not a completed750PASS or cleanup certificate.
