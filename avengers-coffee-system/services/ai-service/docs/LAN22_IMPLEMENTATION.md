# LAN22 implementation / deferred validation

Date: 2026-10-02, Asia/Ho_Chi_Minh. This is a source implementation report, not runtime qualification.

## A–B. Starting state and changed files

Fetched origin successfully. Branch: `branch_thaian`. Starting local HEAD and remote tracking HEAD: `dfc32df70095eed4e5795559bcfe6cf88bee36af`, message `test key`. Initial working tree was clean. No repository AGENTS.md was found. Root `.env` was confirmed ignored and untracked before editing. HEAD is unchanged.

Tracked changes: root `.env.example`, `docker-compose.yml`; AI `main.py`; `src/agents/agent_context.py`, `agent_memory.py`, `llm_tool_orchestrator.py`, `tool_artifacts.py`, `tool_capabilities.py`, `tool_policy.py`; `src/common/groq_service.py`; `tests/test_llm_tool_orchestrator.py` (scripted fixture wiring only); `docs/LLM_TOOL_ORCHESTRATOR.md`. New files: `src/common/agent_provider_policy.py` and this report. Local ignored `.env` also changed. Web, Order and business tool implementations were not edited.

## C–G. Providers, accounts, tiers and failures

Before: guarded ordering inherited the broad compatible-client chain, including automatic Groq model resolution and equivalent bad requests across credentials. Model inference used the same preference/model throughout the tool loop; HTTP wrappers did not preserve structured status/Retry-After for policy.

After: the existing tool loop uses a separate inference-only guarded policy. It never calls model-list APIs. It passes the actual chosen model unchanged to the wrapper. Local policy is Gemini → ordered models/accounts within the round budget → optional OpenAI. General simple-chat/STT provider support and explicit legacy/shadow modes remain. Groq/OpenRouter/Cerebras guarded fallback requires opt-in. Guarded OpenRouter cannot launch hidden internal fallback requests.

Local Gemini credential slots: **4**. The first three independent accounts are prioritized and rotate after success; the previous distinct credential is preserved as the trailing fallback slot. Only the ignored root `.env` received credential values. OpenAI credentials and unrelated secrets were preserved. Local mode is `llm_tools`, provider `gemini`, model override empty, fallback provider `openai`.

Tier selection receives server execution state, not user language: default Lite; Standard for summary/confirmation, a repair, continuation after a mutation, or round index ≥2; Strong after a second repair. No router inference or extra summarization call is added. A concrete `AI_AGENT_MODEL` overrides tier pools for its provider; disabling tiering uses fixed provider models. Specialized image/TTS/audio/live/embedding/robotics/Veo/Lyria/Gemma families are excluded.

Lite/Standard/Strong pools are configurable ordered API-ID lists. Standard defaults to LAN21's `gemini-3.6-flash` candidate. Lite and Strong are deliberately empty locally and use Standard until exact compatible API IDs are supplied. AI Studio display labels were not converted into invented IDs. **Cheap Lite execution and the additional advertised model IDs remain unqualified.**

| Failure | Guarded response |
| --- | --- |
| 429/quota/RPM/TPM | Cool down `(provider, credential SHA-256, model)` and try another independent account. Retry-After is bounded to 1–300 seconds; no blocking wait. |
| 401 | Disable that credential for the process; another account may be attempted. |
| 403 | Skip account/model for the rest of the current turn. |
| 404/model missing | Skip the model across all credentials for the turn; advance configured models/provider. |
| 400/schema/request incompatibility | Skip provider/model/request shape across credentials. A different request shape may remain usable. |
| 5xx/network timeout | Bounded inference fallback. |
| Context length | Same credential/model retry once with safe local compaction, counted in the attempt budget; no key rotation. Fail closed if protected state/evidence cannot fit. |

Default budget: four actual requests per round; eight-second request timeout; twelve-second round scheduling deadline. Reserve an attempt for a configured emergency provider when capacity permits. These are scheduling/request bounds, not measured latency promises. State is process/turn-local, contains fingerprints rather than secrets and is never saved to Redis.

## H–I. Capability exposure and static counts

All **19 READ + 14 WRITE = 33** capabilities remain registered. One `capabilities_for_context` selector drives schemas, executor map and gateway validation. Each round refreshes exposure; execution revalidates current write legality. Hidden tools are default-deny, including proposals for formerly exposed cached writes. A pending write repair narrows writes to the same operation; final synthesis exposes zero capabilities.

Universal consultation includes catalog/recommendations, options, current price/stock, reviews, RAG, cart and nearby/rated stores. Product descriptions become available with canonical product context; branch reviews with canonical branches/focus. Authenticated profile/order reads remain available. Cart quote/voucher/payment reads appear with a nonempty cart. Writes depend on verified cart, pending product/candidates, voucher gate/decision, fulfillment and fresh prior-turn confirmation action. `finish_cart` remains exposed while shopping and is suppressed once its transition is already complete. Canonical location selection remains separate from geocoding and checkout promotion.

These counts are obtained by reading the selector's sets and conditions, **not by running synthetic cases or measuring a provider**. They assume no extra inactive candidates, no submission/completed transaction, and the conditions stated:

| State | Exposed capabilities |
| --- | ---: |
| Guest browsing, empty cart, no focus | 9 |
| Authenticated browsing, verified empty cart, no focus | 15 |
| Shopping/CART_REVIEW, verified nonempty cart, no fulfillment/candidates/voucher decision | 23 |
| Same cart with staged product/fill_options | 23 |
| VOUCHER/select_voucher with canonical voucher candidates | 24 |
| CART_READY, pickup, canonical branches, voucher skipped, no voucher/location candidates | 26 |
| SUMMARY, same pickup state, valid prior confirmation action | 27 |
| Tools-disabled synthesis after repair/summary/confirmation | 0 |

Checkout consultation and changes of mind require a wider surface than simple browsing; extra current candidates/applied voucher can increase those counts. This pass does **not** claim the ideal 8–15 shopping tools or a smaller initial confirmation surface have been achieved. The final synthesis rounds do omit all schemas. No Vietnamese phrase router, demo utterance/entity patch, or new primary graph routing was added.

## J–L. Context, Redis and result projections

The gateway retains full cart line identity/options, pending products/action, checkout fingerprint/expiry/submission, canonical candidates and business safety state. Model context is a separate copy: current cart references, stage/choices, freshness/action when relevant, active pending product/options, lean snapshots, focus and bounded recent prose. It excludes fingerprint internals, submission/replay records, image URLs, coordinates/provider metadata and historical product prices. Fresh tool results still supply authoritative prices/stock and requested ranking facts.

Redis remains non-authoritative conversational memory. Storage remains eight exchanges, TTL 1800 seconds, 32000-character budget and existing snapshot limits. Model history has a separate six-exchange ceiling, normally four, with no LLM summarization. Soft context target is 8000 characters; hard context ceiling remains 12000. Remove old prose and inactive metadata first. Preserve active candidates, focus, staged products and confirmation references. A whole oversized cart is omitted only from the model copy with an explicit unverified marker; an oversized protected remainder fails closed.

Per-tool projections retain product IDs/names/indices and fresh price/ranking/stock facts; full ordered cart IDs/options/amounts; voucher code/benefit/eligibility; canonical branch/location IDs/labels and availability; payment codes/eligibility; minimal checkout items/amounts/action. Product aliases are normalized and result indices match the server's combined visible list. Fresh product facts remain available even when the UI candidate limit is reached, marked not displayed with no invented ordinal. Non-product candidate rows outside the displayed list are omitted with an explicit count; complete carts and RAG evidence are never clipped this way. Options avoid duplicate representations. Denial recovery fields remain intact. Profile/review/completed-order contracts are projected conservatively. Full server results and canonical UI artifacts are retained independently.

## M–O. Loop, RAG and writes

Safe read reuse refreshes authoritative state and includes business state/revision in cache keys. Any write/state adapter invalidates read reuse conservatively, including changed price/stock/quote/voucher context. Writes use their existing operation/signature fences, not read memoization. Known successful writes are not executed twice; precondition denials may be revalidated after state changes.

Repair remains the same intended operation, including another proposal in the same batch. After repair succeeds, or summary/final confirmation succeeds, later synthesis has no tools/executors. Prose/envelope repair after successful mutation cannot reopen writes. Provider fallback only wraps inference from known tool results and never restarts the turn. Synthesis failure uses conservative tool-grounded facts, preferring successful write evidence. Durable processed turns, client_message_id, operation IDs, reconciliation and unknown-write propagation are retained.

RAG keeps complete approved content, canonical evidence IDs and authority metadata; exact duplicate evidence is removed. Existing quotation/grounding validation, ingredient checks, allergen refusal and dynamic-authority separation are unchanged. Local context compaction retains assistant/tool-call pairing, every write result and approved RAG content. No evidence-hash rewrite was introduced.

## P–Q. Metrics and configuration

New/extended metrics include `model_tier`, `model_tiers_used`, `model_context_chars`, `exposed_tool_count`, `max_exposed_tool_count`, `capability_counts_by_round`, `tool_schema_chars_by_round`, `provider_attempt_count`, `provider_failure_count`, `provider_attempts_by_provider`, `credential_slots_tried`, `models_tried`, `retry_reason`, `fallback_count`, `provider_failure_latency_ms`, `tool_result_chars`, `same_turn_read_cache_hits` and `context_compaction_count` when used. Existing mode/provider/model, memory version/availability, system/history/memory sizes, token usage, successful request count, tool rounds, total latency, business stage and mutation evidence remain. Attempt counts and quota reasons are separate from successful-response token accounting. Schema/count fields record the turn maximum; per-round arrays show zero-tool synthesis. Logs use safe slot identifiers and redact known credentials/JWT/Bearer values.

Added/changed deployment controls: empty `AI_AGENT_MODEL`; `AI_AGENT_ENABLE_MODEL_TIERING`; `AI_AGENT_GEMINI_PRIMARY_KEY_COUNT`; `AI_AGENT_GEMINI_LITE_MODELS`, `AI_AGENT_GEMINI_STANDARD_MODELS`, `AI_AGENT_GEMINI_STRONG_MODELS`; `AI_AGENT_OPENAI_MODEL`, `AI_AGENT_GROQ_MODEL`, `AI_AGENT_OPENROUTER_MODEL`, `AI_AGENT_CEREBRAS_MODEL`; `AI_AGENT_FALLBACK_PROVIDERS`; `AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND`; `AI_AGENT_PROVIDER_TIMEOUT_SECONDS`; `AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS`; `AI_AGENT_MODEL_RECENT_TURNS`; `AI_AGENT_MODEL_CONTEXT_TARGET`. Existing memory size control is now forwarded explicitly through Compose. Optional provider credentials are placeholders only in `.env.example`; Compose references environment variables.

## R–U. Verification limits

Only static verification: git status/HEAD/ignore inspection, source/diff review, `git diff --check`, tracked-diff and new-file secret audit, production hardcoding audit, and syntax compilation of ten changed Python files using `compile` without importing/executing them. Registry counts were read through AST literals. No test cases were executed. The shared scripted fixture was rewired to the guarded policy with an isolated fixture credential and no fallback; old negative assertions about now-hidden tools may need alignment during deferred regression.

**Tests NOT RUN. Real-provider/model qualification NOT RUN. Redis integration NOT RUN. Authenticated E2E NOT RUN. Docker build/start/health NOT RUN.** No post-LAN22 token/latency results are claimed. LAN21's full Gemini matrix qualification was already incomplete; this pass does not change that evidence.

Security incident during inspection: the initial attachment read included credentials in tool output. No credential values are repeated in this report, source, generated commands or final response. The tracked/new-file audit checks the supplied values without printing them; only the ignored root `.env` received those values as a file edit.

## V. Commands for the user later — NONE executed in LAN22

Run from repository root:

```sh
# A: rebuild AI only
docker compose up -d --no-deps --build ai-service

# B: inspect non-secret health/config and Redis readiness
curl -fsS http://localhost:8009/ai/health | python3 -m json.tool
# Expect llm_tools, gemini, tier_policy, agent_model_tiering=true, redis_available=true.
```

Reusable shell helper for C–F (bash/zsh). Set an authenticated customer session/token before mutation/journey commands. Keep the same conversation and unique turn IDs; do not invent canonical entities or checkout action IDs.

```sh
export LAN22_API_URL=http://localhost:3000
export LAN22_CONVERSATION_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
export LAN22_SESSION_ID="anon-$LAN22_CONVERSATION_ID"

lan22_chat() {
  local lan22_auth_args=()
  if [ -n "${LAN22_BEARER_TOKEN:-}" ]; then
    lan22_auth_args=(-H "Authorization: Bearer $LAN22_BEARER_TOKEN")
  fi
  LAN22_MESSAGE="$1" python3 -c 'import os,json,uuid; print(json.dumps({"session_id":os.environ["LAN22_SESSION_ID"],"conversation_id":os.environ["LAN22_CONVERSATION_ID"],"client_message_id":str(uuid.uuid4()),"message":os.environ["LAN22_MESSAGE"]},ensure_ascii=False))' |
    curl -fsS "$LAN22_API_URL/ai/agent/chat" -H 'Content-Type: application/json' "${lan22_auth_args[@]}" --data-binary @-
}

# C: social — expect no business action
lan22_chat 'chào bạn'

# D: catalog — inspect canonical products returned by real tools
lan22_chat 'cho mình xem hai món đồ uống rẻ nhất'

# E: AFTER setting LAN22_SESSION_ID and LAN22_BEARER_TOKEN to your authenticated account,
# and checking that this account has an authoritative cart line 1:
lan22_chat 'xem giỏ hàng hiện tại'
lan22_chat 'dòng 1 đổi số lượng thành 2 ly'
```

F: use the same authenticated conversation for a full journey. Browse, select a displayed canonical product, supply the actual returned option values, finish the cart, choose/skip a shown voucher, choose fulfillment/payment, provide an actual location, select a branch shown on a prior turn, request summary, interrupt with product/RAG consultation, re-render summary, then explicitly confirm the fresh prior summary. Example transition commands, issued only after reading each previous response:

```sh
lan22_chat 'chọn món số 1'
# Supply required option values from the preceding response before continuing.
lan22_chat 'hoàn tất giỏ hàng'
lan22_chat 'bỏ qua voucher'
lan22_chat 'lấy tại quán, thanh toán khi nhận hàng'
# Ask for nearby branches using your literal location, then select a shown candidate.
lan22_chat 'chọn chi nhánh số 1'
lan22_chat 'xem tóm tắt đơn hàng'
lan22_chat 'món vừa chọn có vị như thế nào?'
lan22_chat 'xem lại tóm tắt đơn hàng'
lan22_chat 'đồng ý đặt đơn theo tóm tắt này'
```

G: the original LAN21 28-case real-provider matrix harness was not found in this checkout or the inspected temporary/Desktop Python files. Restore its actual path before running this command; the scripted pytest files are not that real-model matrix. The restored harness also needs to inject scripted business authorities/provider clients through the new guarded policy rather than the legacy client registry.

```sh
: "${LAN21_MATRIX_SCRIPT:?Set the path to the restored LAN21 28-case real-provider harness}"
(cd avengers-coffee-system/services/ai-service && .venv/bin/python "$LAN21_MATRIX_SCRIPT")
```

H: an existing external authenticated customer-journey three-scenario harness was found. It is distinct from the previously referenced, absent natural-RAG harness; qualification against LAN22 remains pending.

```sh
: "${E2E_EMAIL:?Set your test account email}"
: "${E2E_PASSWORD:?Set your test account password}"
E2E_API_URL=http://localhost:3000 python3 /Users/thaian/Desktop/avengers_e2e_customer_journey_3_scenarios.py
```

I: deferred deterministic regression, with provider credentials blanked. Redis integration is deliberately not enabled here. Existing negative assertions may expose the intentional change from handler-level denial to hidden-capability denial; do not interpret an unexecuted suite as passed.

```sh
(cd avengers-coffee-system/services/ai-service && ENVIRONMENT=test AI_CHAT_ORCHESTRATOR_MODE=legacy AI_AGENT_PROVIDER= AI_AGENT_MODEL= GEMINI_API_KEY= OPENAI_API_KEY= GROQ_API_KEY= OPENROUTER_API_KEY= CEREBRAS_API_KEY= AI_AGENT_REDIS_INTEGRATION=0 .venv/bin/python -m pytest -q tests)
(cd avengers-coffee-system/apps/web-customer && node --test)
(cd avengers-coffee-system/services/order-service && npm test -- --runInBand)
```

## W. Inspect and compare actual future observations

```sh
docker compose logs --since 15m ai-service | rg '\[AIStartup\]|\[LLMToolTurn\]|\[AgentProvider\]'
```

Compare actual new `tool_schema_chars` and per-round arrays with the LAN21 ~13427-char full schema baseline; compare actual provider attempts with the observed eight-attempt fallback; compare accumulated checkout input with LAN21 ~19000–23000. Also inspect model-context/history/projected-result sizes, model tier versus actual model ID, read cache hits, mutation evidence and total latency. A Lite tier label with empty Lite pool still means the Standard candidate, not a qualified cheap model. Validate that incompatible 400/404 failures do not rotate every credential, 429 rotates independent accounts, successful repaired writes occur once, final synthesis has zero tools, RAG interrupts pending state safely, and only a fresh prior action plus explicit confirmation creates an order. Token targets remain engineering goals, not measured LAN22 results.

## X–Y. Git state and explicit confirmation

Nothing staged. Twelve tracked files modified; two new files untracked, listed in A–B. Root `.env` remains ignored and absent from status. Local/remote tracking HEAD stays at the starting commit. No unexpected user changes were overwritten.

**NO COMMIT PERFORMED. NO PUSH PERFORMED.**
