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
