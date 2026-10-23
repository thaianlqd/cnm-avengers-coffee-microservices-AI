# 1K capacity phase evidence

Final outcome: **500 VU repeatably qualified;750 INVALID GENERATOR;1000 NOT RUN**.
See [the final report](../../../K8S_1K_CAPACITY_REPORT.md) and the three run directories.
All owned benchmark resources have been cleaned. Delivery is local only; no GitHub push.

Native k6/Docker/build/control-test logs are included explicitly despite the repository's
normal log-ignore rule. Their bytes and alignment spaces are preserved to keep original
log hashes verifiable. The scoped `.gitattributes` disables only trailing-space warnings
for these raw `.log` artifacts; source, documentation, manifests and CSV files retain
normal whitespace checking. This does not change any benchmark or qualification gate.
All public logs are covered by the credential scan and checksum manifests. Private
controller logs, tokens, keys and decrypted jobs remain excluded and were removed.
