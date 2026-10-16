# External public-browse capacity

Current AWS private-target workflow and results: [AWS capacity](AWS_CAPACITY.md),
[latest report](../../K8S_3K_AWS_CAPACITY_REPORT.md), and
[handoff](../../FEATURES_K8S_RESUME.md). Preserve the existing private data path;
the Mac/reverse-SSH and Quick Tunnel sections below are historical.

## Historical Mac-target phase 3K

Read [the 3K report](../../K8S_3K_CAPACITY_REPORT.md). Clean legacy 200 recovered
once (p95 1044.8ms); external load did **not start**. Direct NAT discovery found
no usable mapping protocol, and restricted reverse SSH timed out before handshake.
TCP/TLS STUN observed changing source IPv4 addresses. No external stable max or
application/uplink ceiling was measured. One EC2 setup attempt was fully cleaned.

`phase-3k.py` is a separate workflow: one m7i-flex.large initially, fresh tagged
key per RunId, gzip user-data bootstrap, HTTPS **control only**, restricted SSH
443 /32 rules, EC2 loopback reverse forwarding to the Mac GET allowlist and real
IPv4 Docker Desktop LoadBalancer. `customer-browse-3k.js` rejects Quick Tunnel
data URLs. It retains full JSON/gzip checks and think=3s, and adds p99 reporting.
After the setup abort, a pre-launch guard was added: three TCP443 observations
must agree and be less than ten minutes old. Missing/changing egress aborts before
key/SG/EC2 creation; a future attempt uses the observed TCP source /32.
Do not use the historical 5K commands below for a 3K benchmark.

Before another attempt, establish a reachable path with safe source restrictions;
do not broaden public ingress or keep rotating EC2 to guess an egress IP.
`network-3k.py` and `egress-3k.py` are read-only diagnostics, with actual addresses
only in private `/tmp/avengers-aws-k6-3k/network-private.json`. Remove that file
when diagnostics/phase ends. STUN sends binding probes, never benchmark data or
TURN allocations. Do not treat failure to discover router WAN as proof of CGNAT.

After resolving network prerequisites:

```bash
export AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing BASE_URL=http://127.0.0.1:3000
python3 -u scripts/aws-k6/phase-3k.py start
# Only after READY (80 EC2 curl samples), independent runs and manual gate review:
python3 scripts/aws-k6/phase-3k.py run /tmp/SESSION 250 baseline
python3 scripts/aws-k6/analyze-3k.py /tmp/SESSION/TIMESTAMP-baseline-250
python3 scripts/aws-k6/phase-3k.py finish /tmp/SESSION
# Idempotent ownership-scoped recovery, including the new remote/local temp key:
python3 scripts/aws-k6/phase-3k.py cleanup /tmp/SESSION
```

Do not run the next ladder level unless both quality/stability and adequacy pass.
`analyze-3k.py` rejects missing hold coverage (<80% or a gap >15s), observed socket
exhaustion and the generator resource limits. A local `network-adequacy.json`
with `adequate: true` and an evidence list is required after reviewing EC2 curl,
Mac TX, route timings, generator RX/TX and origin counters. It is not an artifact
the remote control endpoint may upload; missing review cannot produce qualification.
The current controller implements one generator; distributed aggregation was not
implemented because no generator bottleneck was measured. User authorization of
up to three generators requires evidence before adding machines, plus correct
VU partitions, synchronization and merged distributions (never averaged p95).
Runtime guards remain 225 minutes local / guest termination +230 minutes; $5
phase credit target. No target migration, account upgrade or IAM changes.

Tests include packet parser, ownership, local profile initialization and rejected
data paths. Run Node tests serially because control fixtures use the same port:

```bash
python3 -m unittest discover -s scripts/aws-k6 -p 'test_*.py'
node --test --test-concurrency=1 scripts/aws-k6/*.test.cjs
```

## Historical phase 5K

This phase uses one **m7i-flex.large**, Ubuntu 24.04 x86_64 in **ap-southeast-2**.
The user approved this replacement after AWS Free Plan rejected c7g.xlarge.
The Mac Kubernetes target remains arm64. No account upgrade or IAM change is used.
Revalidate Free Tier eligibility, account restrictions and pricing before a new phase.
This phase stopped at the first external level (250 VUs): Quick Tunnel returned
217 HTTP 429 and p95 exceeded 1500ms. No higher level or stable external max
was qualified. Read [the report](../../K8S_5K_CAPACITY_REPORT.md) before reproducing.
The remote temporary key was deleted at completion; reconcile/create a new
dedicated key safely before another phase, without overwriting the local key.

The executed workflow uses **outbound HTTPS control** after repeated SSH
bootstrap failures. The user explicitly approved temporary control-token/job/
sanitized-artifact transfer through Cloudflare, whose edge terminates TLS.
Only the k6 profile/helpers enter AWS user-data; no app/AWS credential, private
key or business response body is transferred. SG has **no inbound rules**.
The separate loopback control server requires the ephemeral token, allows
only fixed jobs and whitelisted artifact uploads, and expires with its tunnel.

Start this mode (the SSH workflow below remains a separately documented option):

```bash
export AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing BASE_URL=http://127.0.0.1:3000
python3 -u scripts/aws-k6/https-session.py
```

Queue/review/finish with the same `session.py` commands below. Before the first
external capacity baseline, the generator/path adequacy gate was fixed:
reject >=90% EC2 CPU for three consecutive ~5s intervals during hold, available
memory <256MiB, <20% FD headroom, insufficient generator observer coverage,
or Quick Tunnel HTTP 429 requiring intermediary diagnosis. `qualification.json`
combines this gate with the target's HTTP/stability result. A target HTTP PASS
alone never authorizes proceeding to the next level.

HTTPS mode uses aggregate k6 summary metrics, including status counters and
per-route hold p95, rather than a high-volume per-point JSON writer. The
observation-only submetric thresholds do not change quality thresholds. This
avoids generator/disk overhead at high VU counts; full JSON validation remains.

Run from the repository root in a dedicated terminal:

```bash
export AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing
export BASE_URL=http://127.0.0.1:3000
python3 -u scripts/aws-k6/session.py start --instance-type m7i-flex.large
```

The command prints a private `/tmp/avengers-aws-k6/5k-...` session directory.
`start` defaults to the originally requested `c7g.xlarge`; the explicit type
above selects the approved Free Plan fallback. Never change this to an
unapproved type or upgrade the account to bypass an eligibility rejection.
It verifies the existing remote key `avengers-k6-temp` and local key permissions,
refuses duplicate owned instances, creates a uniquely tagged SSH-only SG restricted
to the current Mac public IPv4 /32, and launches exactly one instance. Root is
20 GiB gp3 with DeleteOnTermination. IMDS requires v2. k6 2.3.0 is pinned and
verified against official release checksums. No repository, app configuration or
AWS credentials are copied to EC2. Runtime IPs and known_hosts stay outside Git.

After `READY`, use another terminal (replace `/tmp/SESSION` with the printed path):

```bash
python3 scripts/aws-k6/session.py run /tmp/SESSION 250 baseline
python3 scripts/aws-k6/analyze.py /tmp/SESSION/TIMESTAMP-baseline-250
```

Review `result.json`, `analysis.json`, `external-analysis.json`, origin ingress
metrics and generator samples **before** queuing 500, 1000, 2000, 3000, 4000,
5000. Stop at the first clear failure. The harness intentionally does not
automatically continue a ladder after failure. Two independent confirmations
on the same configuration are required for a capacity claim. For a candidate
5000, use `--hold 300` twice with natural recovery between runs.

Fixed workload: four sequential GETs actually used by Web Customer:
`/menu/danh-muc`, `/menu/san-pham`, `/users/branches/public`, `/news?limit=100`,
then sleep 3s. Requests negotiate gzip. k6 parses the complete decoded JSON and
checks every item against route contracts; historical profiles are unchanged.
Ramp/hold/down is 60/120/30s (long qualification 60/300..600/60s), 15s grace.
Failure <2%, checks >98%, p95 <1500ms apply globally **and during hold**.
No new overload restart/OOM/CrashLoop, pressure, invalid metrics or failed
post-smoke is allowed; baseline recovery is natural and bounded to 720s.

The path is EC2 → HTTPS **Cloudflare Quick Tunnel** → temporary loopback-only
GET allowlist ingress → **127.0.0.1:3000 Docker Desktop LoadBalancer**. It does
not hit an application on EC2 localhost. IPv4 avoids an unrelated IPv6 Next.js
listener on this Mac. The ingress streams full bytes without a new cache or
compression layer, strips credentials, and blocks every other path and method.
Quick Tunnel is a non-production intermediary with a 200 in-flight request
limit and no uptime guarantee. Classify tunnel/network failure separately;
do not infer raw application capacity or tune the app to hide such failure.
[Cloudflare limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Network baseline uses EC2 curl status, DNS/connect/TLS/TTFB/total times and wire
sizes. Each capacity run records sanitized local Pod UID/restart/HPA/top/node/
events/cgroup and Mac CPU/RAM/VM samples; EC2 numeric CPU, available memory,
network bytes and k6 RSS/FD/CPU ticks; full k6 metric points (no response bodies).
Summary serialization explicitly uses the supported legacy format for the
existing analyzer; this does not change workload or thresholds. `analyze.py`
adds status counts, timing decomposition, route hold p95 and generator peaks.

Finish the phase explicitly:

```bash
python3 scripts/aws-k6/session.py finish /tmp/SESSION
```

The session's `finally` stops its ingress/tunnel, terminates and waits for its
tagged instance, deletes its detached SG and orphan tagged volumes, and verifies
no owned active instance/volume/SG remains. Explicit finish also deletes the
remote key **by its recorded KeyPairId**, never a replacement with the same name.
The local private key remains on the Mac. An interrupted phase retains the remote
key for reconciliation. Idempotent manual recovery:

```bash
AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing python3 scripts/aws-k6/session.py cleanup /tmp/SESSION
# Only when the phase is truly complete:
AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing python3 scripts/aws-k6/session.py cleanup /tmp/SESSION --complete
```

Never run cleanup against another session's resources. Ownership requires all
four phase tags **and** the unique RunId. No default VPC/subnet/network resource
is deleted. Guest shutdown is configured to terminate; a +230-minute shutdown
is scheduled during bootstrap in case the Mac disappears. The local session
also has a deadline below four hours. Stop earlier if the target, generator,
network or remote dependency becomes the limiting factor.

Tests:

```bash
python3 -m unittest discover -s scripts/aws-k6 -p 'test_*.py'
node --test scripts/aws-k6/public-ingress.test.cjs
```
