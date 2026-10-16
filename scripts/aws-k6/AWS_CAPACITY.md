# AWS private capacity phase

This workflow is separate from the historical Mac/reverse-SSH phase. Only
features_k8s may run it. The source baseline records the fresh origin/main SHA.
The initial eligibility probe launches three target instances atomically, with
no public ingress, IMDSv2, ownership tags on instances/volumes/ENIs, 20 GiB gp3
DeleteOnTermination roots and a 15-minute guest terminate-on-shutdown fallback.
It ALWAYS cleans up after probing. It does not deploy applications or run load.
Run only after reviewing the current price manifest (hard budget USD 5).

```bash
python3 -m unittest discover -s scripts/aws-k6 -p test_aws_capacity.py
python3 scripts/aws-k6/aws-capacity.py probe RUN_ID k8s/verification/3k-aws-capacity/RUN_ID
# Recover only this RunId if the controller was interrupted:
python3 scripts/aws-k6/aws-capacity.py cleanup RUN_ID k8s/verification/3k-aws-capacity/RUN_ID
```

Stop on an actual Free Plan/quota rejection. Dry-run verifies permission only;
it does not establish actual fleet eligibility. No IAM, plan or quota changes.
A successful probe is only a prerequisite, never a capacity result. Deployment,
secure secrets, native k6, private baseline, observations and load qualification
must be implemented/validated before any application capacity claim.

## AWS-target execution

Read [the handoff](../../FEATURES_K8S_RESUME.md) and
[the report](../../K8S_3K_AWS_CAPACITY_REPORT.md). The eligibility probe above is
not the deployment workflow. `aws-private-session.py start FOLDER --run-id RUN
--evidence EVIDENCE` manages 3 targets + 1 generator, encrypted control and
mandatory cleanup; `finish FOLDER` requests cleanup. Guest shutdown is configured
to terminate at +175 minutes. Certificates must be authenticated via the AWS
console before jobs/secrets; aws-cli returns decoded console text.

`job FOLDER --role ROLE --script FILE [--stdin FILE] --timeout SECONDS` encrypts
and signs commands/stdin. The relay sees ciphertext, not application secrets.
Build/deploy orchestration remains manual; public source clone must pin the
committed SHA, run tests, build amd64 immutable tags and privately import each
image on every target. The AWS overlay is a template, not ready for direct apply.

Single-generator helpers: aws-network-baseline.py, aws-run-generator.py,
aws-generator-metrics.py, aws-observe.py, analyze-aws-capacity.py. Stop on first
failure. Distributed execution below merges actual observations; never average percentiles.

## Distributed generator qualification

Scale only after measured inadequacy; maximum three generators. Keep the
application images/overlay/profile fixed and rerun the same total VU level.
Distribute integer partitions summing to that level. On each generator run
`aws-run-generator.py NAME PARTITION --target http://PRIVATE_IP:30300
--json-output --start-at SHARED_FUTURE_EPOCH` (one line); the shared epoch must
be less than120seconds ahead. The original workload is unchanged. Gzip JSON
output contains numeric observations, never application response bodies.

Collect into `RUN/generator1`, `RUN/generator2` (and `generator3` when needed),
including k6summary/log, generator metrics and postsmoke for each. Copy shared
target observations/naturalrecovery into each partition. Then use:

```bash
python3 scripts/aws-k6/merge-aws-generators.py RUN RUN/generator1 RUN/generator2
python3 scripts/aws-k6/analyze-aws-capacity.py RUN
```

The merger validates raw request/check counts and start skew<=2seconds, and
computes exact combined quantiles from observations. The analyzer requires
every generator's CPU/RAM/FD/socket/ENA/coverage adequacy and all target stability
gates. HTTP thresholds use merged whole/hold observations. Never averagep95.
`archive-aws-points.py PARTITION /tmp/NUMERIC_RAW_ARCHIVE` retains exact numeric
observations and original hashes in compact gzip format; the merger can replay
them. Full rawoutput stays outside Git. Archive logs/observers as gzip, and
include source/image/config/workload provenance, runtimecost and finalcleanup.


## Lifecycle guards and explicitly approved generator additions

`start` defaults to one generator. Before creating local control or AWS resources,
it inventories current AWS, legacy 3K and legacy 5K ownership tags across RunIds.
An active/stopped instance or orphan SG/EBS/key pair blocks launch; reconcile by
RunId with the existing ownership-scoped cleanup. No unrelated resource is deleted.
RunIds and finite positive cost estimates <= USD 5 are validated before provisioning.

To permit a user-approved maximum of three, record `maximum_generators: 3` in the
fresh projected-cost manifest and explicitly pass `--max-generators 3` to `start`.
This still launches only one generator initially. Each addition needs an existing
analysis with `generator_adequate: false` and nonempty `generator_reasons`:

```bash
python3 scripts/aws-k6/aws-private-session.py add-generator /tmp/SESSION \
  --evidence k8s/verification/3k-aws-capacity/RUN_ID \
  --inadequacy k8s/verification/3k-aws-capacity/MEASURED_RUN/analysis.json
```

The helper checks the approved bound, current fleet IDs/ownership and remaining
lifetime; authenticates the new certificate with AWS console; and records the
inadequacy file SHA256. An addition failure requests full fleet cleanup. The
caller must review the explicit user approval before changing the default of one.

SIGTERM executes the cleanup path. Partial control initialization is also covered.
`CLOSED` is written only after verified AWS cleanup and stopped local processes;
a cleanup exception/negative result writes `cleanup-failure.json` instead.
Export sanitized evidence before `finish`: successful cleanup deletes controller
keys/tokens and temporary encrypted/decrypted job artifacts (which can include
cluster join tokens). Public certificates and sanitized state may remain locally.

The AWS analyzer now requires sufficient complete hold samples containing all
three expected HPAs and Pod/node metrics. It reports per-Pod/per-node and sampled
cluster CPU/RAM peaks. Merged p50/p90/p95/p99 use actual numeric observations;
the workload and HTTP thresholds are unchanged.

The default lifetime remains 175 minutes. `--runtime-minutes` may shorten it
(30..175, matching `guest_termination_minutes` in the cost manifest); both the
controller deadline and guest shutdown use that bound. Include previous attempt
costs when reserving the remaining phase budget.

`archive-aws-points.py` also retains timestamped actual `vus`/`vus_max` observations
in `stage-vus.jsonl.gz`. Fresh qualification rejects a missing VU timeline, missing
hold coverage, or fewer than 95% of hold samples at the requested partition VUs.
Distributed qualification applies this check to every generator. This is observed
active VUs (including think time), not requested VUs inferred solely from metadata
and not requests per second. Keep stage timelines alongside compact latency points.

Five-second per-generator route/phase windows are retained in `http-windows.jsonl.gz`
for correlation with HPA/resource timelines; their percentiles must not be averaged.
`kubectl top` may return `<unknown>` during stress. The analyzer skips those values
when reporting sampled peaks, excludes partial-node sums from cluster peaks, and
checks complete hold coverage independently. A missing-metric gap cannot become
a stable PASS or a zero-resource-usage claim.

Guest shutdown bounds compute lifetime; it does not delete security groups. If the local controller/runtime disappears (including abrupt kill), inspect all known ownership phases and run ownership-scoped cleanup. Do not infer full cleanup from terminated instances alone. The 16 October recovery removed two orphan groups and verified instances, disks, groups, key pairs and ENIs were zero.
