# Avengers Coffee: Docker Desktop Kubernetes

Kubernetes is an additional deployment mode. The existing `docker-compose.yml`
is unchanged. This machine uses `K8S_DB_MODE=existing` (Supabase). Application manifests use Kustomize; no Helm/Ingress/monitoring
stack is required. See [the demo guide](../K8S_DEMO_GUIDE.md) and
[the verification report](../K8S_VERIFICATION_REPORT.md) before switching modes.

Eight application Deployments run in namespace `avengers-coffee`. The application
database remains remote Supabase/PostgreSQL; Redis and RabbitMQ stay in Compose.
The unused local Postgres container/volume is retained. Customer/shipper
mobile apps remain clients; Admin and DataPlatform are outside this deployment.

```bash
# From repository root; Kubernetes and Metrics Server must be ready.
export K8S_DB_MODE=existing
bash scripts/k8s/build-images.sh
bash scripts/k8s/start-infra.sh
python3 scripts/k8s/environment.py audit
# Stop only customer application copies after the DB audit succeeds:
docker compose stop web-customer api-gateway identity-service menu-service inventory-service order-service news-service ai-service
bash scripts/k8s/deploy.sh
```

`environment.py` asks Docker Compose to resolve root `.env` in memory. It creates
per-service ConfigMaps and Secrets through stdin, without a secret YAML file,
shell sourcing, secret CLI arguments, or secret output. Required values are
`JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, and
an explicit database password. Compose token-like fallbacks are not copied.

| Setting | Default / effect |
|---|---|
| `K8S_CONTEXT` | `docker-desktop`, passed explicitly to every cluster command |
| `K8S_ALLOW_OTHER_CONTEXT` | Must be `1` to deliberately target another context |
| `K8S_DB_MODE` | `compose`: uses resolved `POSTGRES_USER/DB/PASSWORD`, published port, TLS disabled for the local non-TLS Postgres |
| `K8S_DB_MODE=existing` | Uses existing backend `DB_*`/`PGSSLMODE`; local aliases resolve to the host bridge, remote hosts are retained |
| `K8S_INFRA_HOST` | `host.docker.internal`; override with a verified Docker Desktop host IP only if Pod DNS fails |
| `K8S_READY_TIMEOUT` | `300s` per deployment |

The observed published infrastructure ports are **6543 / 6379 / 5672** on the
verification machine. Scripts resolve actual Compose mappings every time.
Database mode `existing` preserves the current remote datasource. Local Compose
PostgreSQL is not used in this machine's demo. No script restores/resets/deletes DB data.
The demo startup guards disable existing seed/migration/workers; public HTTP
snapshot freshness is bounded to 5 seconds, with full JSON/gzip serialized once
per refresh and no stale responses after a failed refresh. No DB read-only role is provisioned.

The static overlay renders independently:

```bash
kubectl kustomize k8s/overlays/docker-desktop
python3 scripts/k8s/environment.py prepare
kubectl kustomize k8s/overlays/.docker-desktop-runtime
```

Use `deploy.sh` for deployment: it adds immutable local image tags and configuration fingerprints via a
generated, gitignored overlay, validates service port structure and image architecture/environment/DB,
creates secrets, runs server dry-run, waits for readiness, then checks Pod DNS,
host bridge, public HTTP routes, and auth rejection. Public media is copied from a small snapshot image into per-Pod emptyDir by an
init-container, then mounted read-only. No node hostPath is required; Admin uploads
are outside this mode.
Deployment template fingerprints change when configuration/secrets or the local
image ID changes, so rerunning `deploy.sh` rolls the affected Pods even when a
local image tag is reused. The generated overlay contains hashes, not secrets.

Only Web (5175), Gateway (3000), and Order Socket.IO (3005) are exposed by
LoadBalancer. Backend calls use Service DNS. Frontend `VITE_*` values are public
**build-time** values; changing them requires rebuilding Web. Never put backend
credentials into a `VITE_*` variable. Public client map tokens must be scoped to
browser use by their provider. Existing frontend map fallback literals remain
an existing concern recorded in the report.

`SOCKET_REDIS_ENABLED=true` enables the production Redis adapter only in this
deployment mode. Failed Redis startup refuses a local adapter fallback; Redis
disconnect makes Order unready. Order stays at one replica without HPA until
two actual Pods and Service affinity are qualified. Redis Pub/Sub is ephemeral;
reconnecting clients must rejoin rooms/read persisted notification history.

For metrics installation, see [Metrics Server](addons/metrics-server/README.md).
For safe browse load, see [k6](../load-tests/k6/README.md). Teardown removes only
the application namespace; it retains Compose data and cluster addons.


The classroom generator should use native macOS arm64 k6 → localhost. Use
`install-k6-local.sh` for a checksum-verified pinned 0.57.0 binary in gitignored
`.tools`. Container → host.docker.internal transport has failed the stress
qualification and remains explicit diagnostics (`K8S_LOAD_USE_DOCKER=1`).
