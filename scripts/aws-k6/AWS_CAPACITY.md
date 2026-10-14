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
