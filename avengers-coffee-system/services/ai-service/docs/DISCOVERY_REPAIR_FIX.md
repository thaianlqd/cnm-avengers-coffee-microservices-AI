# Discovery after semantic repair — 2026-10-07

Follow-up to the customer report at 16:39: a configured coffee was added successfully, then a request for another product family returned product cards alongside a failure message.

The supplied log shows `invalid_semantic_arguments` on the first proposal, followed by a valid `filter_catalog` action with `commitment=SELECTED`, `decision=ok`, and four canonical product candidates. The log does not expose which field was invalid in the first proposal.

The server treated every repair read without an immediate customer milestone as repair exhaustion. It also treated selected discovery as necessarily needing further tool execution, even when several products required a customer choice. Finally, the rejected wrapper in the audit log prevented discovery rendering after the valid replacement. These conditions produced `semantic_repair_exhausted`; the fallback replaced the catalog reply while preserving its UI cards.

## Fix

- A selected discovery with multiple canonical matches and no outstanding multi-read plan ends by showing choices. It never automatically adds one matching product. An exact singleton lookup still proceeds to its options.
- A fresh successful canonical discovery is workflow progress. The normal selection/configuration step can follow it within existing tool-round and provider budgets; the protocol repair counter is never reset.
- Presentation can disregard rejected protocol wrappers after a valid replacement. Full audit evidence is retained. An unresolved new protocol fault cannot be hidden by earlier catalog evidence.
- Unrelated cart reads/prose still cannot complete a failed repair. A second protocol fault remains terminal.
- The successful-write fence remains active after discovery continuation, preventing a previously completed target from being written again with different arguments.

No product names, category phrases or customer sentences were added to production routing. Business authorities, model order (Gemini 3.5 Flash Lite then 3.1), and Data Platform remain unchanged.

## Verification and application

Four reproducer cases failed before the fix. The final six additional regression cases cover selected/question family discovery, exact lookup continuation, unchanged repair budget, preservation of the successful-write fence, and visibility of a new unresolved protocol fault.

Commands run from repository root with `IMAGE=cnm-avengers-coffee-microservices-ai-ai-service:latest`:

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -w /repo/avengers-coffee-system/services/ai-service "$IMAGE" \
  python -m pytest tests/test_semantic_control.py tests/test_chatbot_semantic_regressions.py \
  tests/test_gemini_guarded_continuation.py::test_semantic_repair_uses_auto_same_key_and_signed_history -q --tb=short
```

**182 passed, 1 warning, 3.07s.** These tests use scripted model responses and isolated business authorities. The family-discovery reproducer returns product cards and asks the customer to choose, preserves the configured coffee unchanged, performs no cart writes, and completes in two provider calls including the correction.

Full offline suite, with the same mounts plus `docker-compose.yml` and `.env.example` mounted at `/repo`: **2,537 passed, 113 failed, 1 skipped, 2 warnings, 21.60s**. Exact failed node IDs match the previous baseline: zero new failing tests and zero baseline failures cleared. Syntax checks and `git diff --check` passed.

`docker compose build ai-service` succeeded. Applied with `docker compose up -d --no-deps ai-service`; only the customer AI container was recreated. `/ai/health` returned HTTP 200, `status=ok`, `chat_orchestrator_mode=llm_tools`, `agent_provider=gemini`, and Redis available. Running source hashes match the tested files.

Logs: `/private/tmp/chatbot-discovery-repair-{before,focused,full,build}.log`. No additional real Gemini requests were sent; the prior 40-request limit remains respected. This targeted server regression is verified; broader real-model reliability remains unqualified as recorded in the earlier hardening report.
