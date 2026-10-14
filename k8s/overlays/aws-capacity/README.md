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
The pool experiment passed the same-load 250 VU latency comparison; an adequate two-generator 250 run passed all stable gates. It does not qualify 500 or 3000 VUs.

Gateway CPU750m experiment rejected: normal500 had a single STABLE PASS, but
long500 failed wholep951841.97/hold2421.21ms with adequate generators and no
restart. CPU limit restored to baseline500m; request75m/HPA2–4 unchanged.
Historical experiment/evidence retained. Poolidle30000 remains separate.
