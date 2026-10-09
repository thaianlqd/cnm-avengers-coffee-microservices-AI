# Hybrid configuration protocol repair — 2026-10-08

The reported “cho tôi size lớn, ít đá, ít ngọt nha” turn failed at 22:00:25 ICT with `missing_required_field` at `/message`. Its single format-repair attempt failed at 22:00:26 with `unknown_field` at `/ice`. Final class: `INTERPRETER_PROTOCOL`, two provider requests, zero business operations/writes, pending product retained. The repeated customer message subsequently interpreted as CONFIGURE_PRODUCT and added one configured product. Logs are sanitized and do not retain the full invalid provider bodies, so regression tests reproduce the observed error shapes rather than claiming an exact raw-response replay.

## Repair

An audited, lossless normalization supplies `message: null` only for a nonempty commands envelope with an omitted message. It does not rewrite an explicit message, infer a missing kind/command/argument, move option fields, choose a reference, or supply business defaults. Every command, option shape, reference grammar, cross-command conflict and final confirmation check still runs before dispatch. Input objects remain unchanged through the existing copied parsing boundary.

The primary interpreter explicitly puts size/toppings/ice/sweetness/milk inside CONFIGURE_PRODUCT args.options. Format repair requests one complete envelope rather than a JSON patch or standalone options object, restates root/command keys and option nesting, and includes the exact configuration argument schema for related failure fields. It instructs preservation of command order, references, quantities and options, and forbids added customer choices. Existing discovery-delta guidance remains intact. Failed provider bodies are not copied into logs or repair prompts.

The request budget is unchanged: one primary interpretation and at most one format repair (shared outer budget unchanged). There is no extra provider pass, keyword routing, flat-object executor, Menu validation bypass, automatic order confirmation or legacy fallback. Missing-message-only valid commands avoid spending the repair request. Malformed options still require repair; two invalid responses fail closed with pending state retained. Prompt changes reduce avoidable format errors but cannot guarantee every future provider response will be valid.

## Verification

Focused offline suite: **124 passed**. New regressions cover immutable omitted-message normalization, social/clarification and explicit-message exclusions, unknown/empty commands, forbidden fields, root/args/standalone option shapes, complete-envelope repair, exact requested configuration, one write with client-message replay, invalid Menu options and zero-write state preservation after two failures. Network connections are blocked by the Hybrid test fixture.

Final full offline suite: **5,901 passed, 1 existing skipped, 2 existing dependency warnings in 36.13 seconds**, inside a network-disabled container. Log: `/private/tmp/configuration-protocol-suite.log`. `git diff --check` is clean for AI-service.

No live LLM request or real customer mutation is used for this repair. Scripted provider output verifies protocol and commerce behavior, not live language accuracy.

## Deployment

`docker compose build ai-service` and `docker compose up -d --no-deps ai-service` completed. Running image: `sha256:301448901268ee374c48360c61f903bcf72ee0d719c223e9c41d91f7a10e785f`, started 22:11:12 ICT. `/ai/health` returns `status: ok`, Hybrid commerce and Redis available. All 20 changed runtime Python files (including the two files changed in this follow-up and previous repairs) match their tested host hashes inside the running container. Container ID comparison confirms only AI-service was recreated among persistent running services; the temporary offline test container exited with `--rm`. All 12 pre-existing dirty DataPlatform files retain their original hashes.

Only AI-service is rebuilt/restarted. Order-service, frontend, geo.py and DataPlatform remain unchanged in this follow-up. Existing uncommitted work is preserved; no commit/reset/cleanup is performed.
