# AWS capacity overlay

Scope: real API Gateway, Identity, Menu and News. No Order/payment/provider/AI
workers. These browse services require existing PostgreSQL, and do not require
Mac Redis/RabbitMQ. Existing resources, probes, logging, keepalive and cache TTL
are retained. HPA 2–4 / 1–3 / 1–4. Private NodePort 30300 is permitted only
from the generator security group. No public benchmark endpoint.

This is a deployment template: render to a private temporary directory, replace
all local images with immutable source-derived amd64 tags, build/import images
on all target nodes, and provision only the four required service config/secret
objects before apply. Do not apply local k8s-local image references to AWS.

Pool lifetime experiment: `DB_POOL_IDLE_TIMEOUT_MS=30000` (service default 5000;
integer bounds 1000–60000). This is independent of the 2000ms readiness connection
allowance. Cache TTL, pool max=2, workload, resources and HPA remain unchanged.
The experiment is pending same-load 250 VU validation.

Measured Gateway burst experiment: CPU limit 500m -> 750m, request stays75m,
HPA2–4 unchanged. Diagnostic500 showed up to31.2% throttled periods and0.914s
throttled time per5s interval on one Gateway container; average CPU was below
limit. This is pending SAME500 validation, not a proven fix or a default change.
