# Metrics Server on Docker Desktop

Do not install blindly over an existing Metrics Server. First inspect:

```bash
kubectl --context docker-desktop version
kubectl --context docker-desktop -n kube-system get deployment metrics-server
kubectl --context docker-desktop top nodes
kubectl --context docker-desktop top pods -A
```

If absent, pick a release compatible with the cluster version from the
[official compatibility matrix](https://github.com/kubernetes-sigs/metrics-server#compatibility-matrix).
The example pins v0.8.0 (Kubernetes 1.31+); for 1.27–1.30 use v0.7.2. Download and
review the release manifest before applying it; no application Helm is needed.

```bash
curl -fL https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.8.0/components.yaml -o /tmp/metrics-server.yaml
less /tmp/metrics-server.yaml
kubectl --context docker-desktop apply -f /tmp/metrics-server.yaml
kubectl --context docker-desktop -n kube-system rollout status deployment/metrics-server --timeout=180s
kubectl --context docker-desktop -n kube-system logs deployment/metrics-server --tail=50
```

Only if logs prove the local kubelet certificate cannot be verified, add the
local-demo TLS exception (never a production default):

```bash
kubectl --context docker-desktop -n kube-system patch deployment metrics-server --type=json -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl --context docker-desktop -n kube-system rollout status deployment/metrics-server --timeout=180s
```

Wait about 30–60 seconds, then rerun both `top` commands and `scripts/k8s/preflight.sh`.
Check `kubectl get apiservice v1beta1.metrics.k8s.io` if metrics remain unavailable.
Avengers teardown leaves this cluster addon intact.
