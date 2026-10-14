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

## Paused AWS-target execution

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
failure. No distributed aggregation exists yet; do not average percentiles.
