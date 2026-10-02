# LAN22.4 — Ordering, profile locations and final confirmation

Implemented and verified offline. No real provider, geo, identity, inventory, voucher or order request was sent. No Docker command was executed. Live model planning, latency and authenticated end-to-end behavior remain for the user's manual retest.

## A. Starting state

Branch: `branch_thaian`. HEAD: `1a874668322c03c26d2ac22358c909ad07d80648` (`sua chat bot 22.3`). Working tree was clean. No applicable `AGENTS.md` was found. No branch changes or destructive Git operations were performed.

The root `.env` remains ignored and untracked. Its four qualification settings were checked without printing credentials and already match:

```dotenv
AI_CHAT_ORCHESTRATOR_MODE=llm_tools
AI_AGENT_PROVIDER=gemini
AI_AGENT_MODEL=gemini-3.1-flash-lite
AI_AGENT_FALLBACK_PROVIDERS=gemini
```

No environment file, provider default or credential was changed.

## B. Files inspected

Paths below are relative to `avengers-coffee-system/services/ai-service`, except the explicit root/web paths:

- `src/agents/llm_tool_orchestrator.py`, `agent_context.py`, `tool_capabilities.py`, `tool_policy.py`, `tool_artifacts.py`, `tier1.py`, `order_flow_graph.py`, `agent_service.py`.
- `src/common/groq_service.py`, `agent_provider_policy.py`, `gemini_compat.py`, `cart_manager.py`, `inventory_validation.py`.
- `src/function_calling/tools/__init__.py`, `cart_tools.py`, `branch_tools.py`, `user_tools.py`, `voucher_tools.py`.
- `tests/conftest.py`, `test_llm_tool_orchestrator.py`, `test_guarded_tool_gateway.py`, `test_gemini_guarded_continuation.py`.
- `docs/LAN22_3_IMPLEMENTATION.md`.
- `avengers-coffee-system/apps/web-customer/src/components/ChatWidget.jsx`, `agentTurn.js`, `agentTurn.test.js`, `src/lib/apiClient.js`, and `package.json`.
- Root `docker-compose.yml`, relevant `.env.example` settings and allowlisted qualification settings in the ignored root `.env`.

## C. Files changed

AI service paths:

| File | Change |
| --- | --- |
| `src/agents/checkout_contract.py` (new) | Server prerequisite list and precise Vietnamese guidance. |
| `src/agents/agent_context.py` | Project missing prerequisites; remove opaque confirmation action IDs from inference context. |
| `src/agents/tool_capabilities.py` | Empty confirm schema; state-scoped profile read; operation-scoped confirmation recovery. |
| `src/agents/tool_policy.py` | Bind prior action, structured denials, recovery ownership, no-op choices/branch/voucher, pickup origin semantics, retain delivery adapter's actual summary. |
| `src/agents/tool_artifacts.py` | Minimal profile projection, missing-state/payment fallback, safe validation categories, total presentation budget, no changed-write claims for no-ops. |
| `src/agents/tier1.py` | Accept the conversational filler `bạn` only in the existing final-confirmation classifier. |
| `src/agents/llm_tool_orchestrator.py` | Align prompt with server binding/profile origins/total count and add validation telemetry; effective mutation metrics exclude no-ops. |
| `src/common/groq_service.py` | Scope confirm repairs, stop after one failed summary recovery, and use zero-tools synthesis after confirmation or a delivery-generated summary. |
| `src/function_calling/tools/branch_tools.py` | Read current exact branch identity before a no-op: ACTIVE main branch, or an existing kiosk under its established identity contract. |
| `tests/test_checkout_guarded_contract.py` (new) | Focused LAN22.4 offline contracts and transport fences. |
| `tests/test_llm_tool_orchestrator.py` | Migrate affected confirmation and compound-display tests to the new contracts; prepare complete prior-summary fixtures. |
| `tests/test_guarded_tool_gateway.py` | Same-turn summary/confirm regression checks that confirm never reaches the gateway after summary success. |
| `docs/LAN22_4_IMPLEMENTATION.md` (new) | This A–U report and user-only retest instructions. |

Web change: `avengers-coffee-system/apps/web-customer/src/components/agentTurn.test.js` adds a backend-completed/client-lost-response retry test. Production frontend code is unchanged.

## D. Root causes and certainty

| Symptom | Evidence and certainty |
| --- | --- |
| Generic payment fallback | **PROVEN:** the old fallback had no specific choices/payment-options response; successful results without a message could reach generic unverified text. **NOT PROVEN:** the exact validation rejection for the recorded turn, because its raw envelope and rejection category were absent. Malformed envelope or mismatched claims are possible explanations, not established facts. |
| Saved profile address failure | **PROVEN:** the LAN22.1 selector never exposed `get_user_profile` in this relevant checkout state, despite an existing authenticated identity executor. The reported turn did not read profile authority. **LIKELY:** it tried resolving the address reference without obtaining the stored address. **NOT PROVEN:** the exact geocoder input from the structural logs alone. |
| Final confirmation denial | **PROVEN:** `oke xác nhận nhé bạn` classified as NONE because `ban` was a foreign token. The old combined predicate therefore denied this otherwise ordinary YES. **NOT PROVEN:** whether action mismatch, expiry or fingerprint/pending failures also occurred in that live turn. They now have distinct reasons. |
| Repeated branch/choices/voucher writes | **PROVEN:** branch success always invalidated summary; apply-voucher always reapplied then invalidated; unchanged choices still called persistence APIs. Unchanged choices already avoided the explicit summary invalidator, but lacked no-op status/evidence semantics. **PROVEN:** a confirm denial did not own subsequent writes in the inference loop. The reported unrelated retries were reachable through that gap. |
| Frontend connection interruption | **PROVEN:** Axios timeout is 60,000 ms and the request-phase message also covers other transport failures. **LIKELY:** unnecessary late-checkout rounds contributed to poor responsiveness. **NOT PROVEN:** an Axios timeout, gateway timeout or other specific network failure caused that message; the backend's 53.8 s metric does not establish the complete HTTP timing. |
| Four cards for requested total two | **PROVEN:** multiple catalog reads accumulated a canonical union, without an enforced total-count envelope contract. **NOT PROVEN:** why two real menu rows had the same display name; their canonical identities must be inspected before making any catalog-data conclusion. |

Additional source finding: the established delivery adapter can prepare a summary after resolving the location and selecting a compatible branch. The gateway previously retained nearest-branch facts but dropped that summary/UI evidence. This loss is **PROVEN by source**; its contribution to the reported dine-in journey is **NOT PROVEN**. The gateway now preserves the actual nested business evidence and summary.

## E. Confirmation state machine, before and after

Before: model copies opaque action ID → one combined confirmation predicate → generic `confirmation_required` → ordinary mutable capabilities remain → model may reset branch/choices/voucher and invalidate its prior summary.

After:

```text
Turn entry captures server action and current cart/choice fingerprint
    ↓
LLM proposes confirm_checkout({})
    ↓
Authenticate + require turn identity + authoritative cart
    ↓
Validate original prior action, current action, unchanged turn state,
current explicit YES, summary fingerprint, action/pending expiry,
pending confirmation and complete prerequisites
    ├─ All pass → existing confirm executor(action_id=entry_action) once
    │              → zero-tools synthesis from authoritative order result
    ├─ Missing prerequisites / no explicit YES → precise clarification
    │                                         → zero-tools synthesis
    └─ Stale/expired/missing prior confirmation with complete prerequisites
                   → request_checkout only, one summary attempt
                   → show refreshed summary or actual blocker
                   → zero-tools synthesis; require a later-turn confirmation
```

Invalid confirm arguments can repair only `confirm_checkout`; they cannot open another write operation. A failed summary recovery ends recovery rather than repeating business calls. These restrictions start after a confirm proposal. Ordinary cart/payment changes and read interruptions remain available before that proposal.

## F. Model-facing action ID

Removed. `confirm_checkout` has an object schema with empty properties/required and `additionalProperties=false`. Model arguments are `{}`. Inference context and projected summaries omit action IDs.

Public summary/checkout UI still receives its server action ID. Existing button/server API and durable checkout identity remain intact.

## G. Server safety

`entry_action` and `entry_fingerprint` are captured at gateway construction. The final executor receives only `entry_action`; the model cannot select or replace it. Current action/fingerprint and pending state are checked after authoritative refresh. Creating a summary in the current turn cannot authorize an order in that turn.

Safe denial reasons: `no_prior_action`, `action_mismatch`, `state_changed_during_turn`, `not_explicit_confirmation`, `summary_cart_changed`, `summary_expired`, `pending_confirmation_missing`, `checkout_preconditions_missing`. The structured result includes missing fields and an optional allowed recovery tool. Gateway logs include only the reason enum, never the action/fingerprint or model prose.

The existing final-order executor still owns final refresh, locks, inventory/quote checks, durable submission/reconciliation and completed-action replay. Its implementation was not changed. Auth, turn identity, canonical options/cart lines/ordinals, pricing, wallet, stock, voucher, immutable geo candidates and RAG safety remain in place.

## H. No-op semantics

- Same branch: still require a prior canonical candidate and current sellability/compatibility; re-read exact identity, then return `already_processed`, `changed=false` without setting branch or clearing summary/pending state. Failed identity/stock reads deny satisfaction. Main branches must be ACTIVE. Kiosks retain exact-existence identity rules and separate sellability validation.
- Same checkout choices: independent explicit-choice and wallet guards remain; compare only supplied fields with server preferences, then return a no-op before persistence or invalidation. Real changes preserve dependency invalidation.
- Same voucher: read current eligible candidates first. Require the same normalized code, a decided voucher, no revalidation flag, matching current cart/order binding or summary fingerprint, and an unchanged authoritative estimated discount when supplied. Otherwise run normal apply/revalidation. A successful new application stores a server-only cart/choice binding. No-op never reapplies or creates an action.

No-op results carry no changed mutation evidence or mutation authorization metric. The reply validator rejects claims that a no-op changed state. Successful already-completed order evidence remains supported.

## I. Profile exposure

Before: profile absent from default ordering surfaces, including relevant location states.

After: profile is available only for an authenticated, verified, nonempty mutable checkout where pickup/dine-in needs a branch, or delivery needs an address/confirmation. It is absent from ordinary browsing, unrelated cart state, completed/submitting checkout, guest state and already-complete location state. No message keyword determines exposure.

The smallest existing location set is retained: `resolve_location` combines canonical resolution/nearby lookup, and pickup also has `ask_branch`. `find_nearest_branch` is not additionally published throughout mutable checkout. The LLM chooses whether a saved-address reference requires profile authority.

The model profile projection contains only `status`, `default_address`, and address items' `label`, `full_address`, `is_default`. Full tool evidence remains internally available; name/email/phone and unrelated identifiers do not enter inference.

## J. Address semantics

Pickup/dine-in: saved address → literal search origin → read-only location/nearby branch authority → canonical cards → later customer branch selection. Even if the model proposes `for_checkout=true`, the gateway enforces read-only origin semantics. It does not set `delivery_address` or auto-select the nearest branch.

Delivery: saved address → actual string → canonical resolution → immutable candidate selection when ambiguous → established compatible-branch/sellability flow → confirmed delivery address. Profile text alone never confirms an address. The real location adapter and candidate coordinate reuse are covered offline with geo/branch authorities faked.

The prompt instructs profile lookup before resolving saved-address references and forbids geocoding the reference phrase. No new phrase matcher or semantic router was introduced.

## K. Fallback and presentation

Canonical choices plus payment options now produce grounded acknowledgment and precise missing payment/branch/address/voucher/options guidance. Payment cards still come from tool artifacts, not invented prose. Successful final-order evidence takes precedence over older draft facts; rejected final prose can use the business executor's actual success message.

`response_validation_issue` records fixed categories, including `missing_envelope`, `missing_tool_evidence`, `mutation_claim_mismatch`, `confirmation_contract_mismatch`, `display_selection_invalid`, `internal_content`, `unverified_amount`. Existing exact RAG evidence and ingredient/allergen behavior are preserved.

Compound discovery requires `display_product_count` as the semantic TOTAL, with exactly that many unique canonical `display_product_ids`. An oversized or incomplete selection gets bounded envelope repair; unresolved budget failures return clarification without displaying an overlarge union. The server retains the complete turn candidate pool separately from the initial 16-card UI budget, so final selection can include canonical IDs from either read. Ambiguous total-versus-each requests can use count 0/IDs [] and clarify. Language semantics remain model-owned; the server does not parse Vietnamese ranking/count phrases. Canonical IDs deduplicate; distinct IDs with the same name remain distinct.

## L. Frontend timeout and replay

Production frontend code and the 60-second timeout are unchanged. There is no evidence justifying a larger timeout. Backend work removes redundant writes and constrains fresh confirmation to a proposal and final synthesis in the scripted happy path.

Existing pending-turn storage, exact identity matching, remount recovery and same-ID clearing are retained. The new JavaScript test simulates backend completion followed by a lost client response, then verifies same pending turn ID and one order in a durable fake. A separate Python integration test clears the fast processed-turn map, retries the exact request and obtains the durable result without inference or another order call. Changed text with the same ID is rejected.

## M. Focused offline tests

72 new Python cases cover first dine-in/payment fallback, missing branch, narrow profile surfaces, profile origin/delivery semantics, minimal profile projection, real pickup and ambiguous-delivery adapters with fake authorities, immutable candidate coordinates, retained delivery summary, no-op state preservation and fresh identity/eligibility checks, all confirmation denial predicates, same-turn summary prohibition, exactly-once confirmation, summary-only recovery, failed recovery stop and actual blocker fallback, schema-only confirm repair, auth/cart/identity gates, durable lost-response replay, cart/payment changes, RAG interruption including missing knowledge, compound total budget repair/clarification, candidate selection beyond the initial UI budget and ID-based deduplication.

20 existing LAN22.3 cases verify signed Gemini continuations, bounded compatibility recovery, zero-tools synthesis, dynamic surfaces, diagnostics privacy and write replay safety. Twelve selected existing confirmation/compound tests were migrated and verified. Web: all five pure `agentTurn` unit tests passed, including the new lost-response case.

## N. Exact verification commands and results

From the AI service directory, the final focused run used this network-fenced launcher (no provider credentials printed or loaded):

```sh
.venv/bin/python - <<'PY'
import os,socket,sys
for name in list(os.environ):
    if any(part in name.upper() for part in ('API_KEY','SECRET','TOKEN','PASSWORD')):
        del os.environ[name]
os.environ.update(PYTEST_DISABLE_PLUGIN_AUTOLOAD='1',PYTHONDONTWRITEBYTECODE='1',ENVIRONMENT='test')
sys.dont_write_bytecode=True
def no_network(*args,**kwargs): raise RuntimeError('Network forbidden in focused offline regression')
socket.socket.connect=no_network
socket.socket.connect_ex=no_network
socket.create_connection=no_network
socket.getaddrinfo=no_network
import pytest
raise SystemExit(pytest.main(['-q','tests/test_checkout_guarded_contract.py','tests/test_gemini_guarded_continuation.py','tests/test_llm_tool_orchestrator.py::test_compound_extrema_uses_two_reads_and_canonical_union','tests/test_llm_tool_orchestrator.py::test_read_questions_cannot_confirm_even_when_model_requests_it','tests/test_llm_tool_orchestrator.py::test_final_confirmation_action_safety','tests/test_llm_tool_orchestrator.py::test_current_explicit_confirmation_once_then_transaction_memory_cleared','tests/test_guarded_tool_gateway.py::test_new_summary_cannot_be_confirmed_in_same_turn','-p','no:cacheprovider','--tb=short']))
PY
```

Result: **104 passed in 2.54 s**. Two existing dependency warnings: urllib3/LibreSSL and LangGraph pending deprecation. No failures remain in the focused run. Earlier migration assertions were corrected to distinguish inference-blocked proposals from actual gateway-dispatched tools; this did not loosen authorization.

From `avengers-coffee-system/apps/web-customer`:

```sh
node --test src/components/agentTurn.test.js
```

Result: **5 passed**, no failed/skipped/cancelled tests.

Root:

```sh
git diff --check
```

Result: pass. All 12 changed/new Python files were compiled in memory using `compile(path.read_text(), str(path), 'exec')`, with no imports or bytecode writes. Static AST comparisons against HEAD verified unchanged `FakeToolCall`, `_continuation_tool_call` and `GeminiClient`; Git comparisons verified unchanged `gemini_compat.py` and `agent_provider_policy.py`. Local config/ignore/tracking, secret and hardcoding audits passed.

## O. External-call prevention

Before importing pytest/application code, the launcher removed secret-bearing environment variables, disabled plugin autoload and blocked socket connect/connect_ex/create_connection/DNS lookup. The new test fixture additionally blocks requests transport and non-scripted provider clients. The runtime fixture supplies synthetic provider credentials and a fully scripted client, memory Redis/cart/durable store, and fake catalog/options/pricing/cart authorities.

Identity/profile, voucher, payment, inventory and branch/geolocation operations in exercised paths are explicitly replaced by in-memory fakes. Exact branch-identity SQL contract tests use an in-memory engine. Existing LAN22.3 wire tests restore only the real serializer and a scripted `requests.post` function; it never forwards HTTP. No actual key, model-list discovery, fallback client, provider endpoint, service network, geocoder or Docker process was contacted.

## P. Capability inventory

**33 → 33: 19 READ, 14 WRITE.** The new identity helper is internal, not a capability. Only state-specific subsets are exposed. Zero-tools final synthesis remains enforced. Existing Gemini 6→11 browsing-surface regression still passes; profile location states intentionally have their own narrow additions.

## Q. Static checks and preservation

- `git diff --check`: pass.
- In-memory compile of 12 Python files: pass.
- Actual local credential-value comparison and provider-key-pattern audit of all changed/new material: pass; values suppressed.
- Production additions reviewed for entity hardcoding and new message phrase routers: none. Synthetic product/branch/voucher fixtures exist only in tests.
- Root `.env`: ignored, untracked, expected four qualification values; unchanged.
- Gemini thought signatures, serializer, diagnostic structure, bounded compatibility retry and credential/model policy: unchanged and covered by the 20 regressions.
- No dependencies installed, broad full suite, real journey, Docker qualification, provider or external service call.

## R. Manual retest — user only; not executed by Codex

Run these commands only when ready to use your own local authenticated journey:

```sh
cd /Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI
docker compose up -d --no-deps --build ai-service
docker compose logs --since 2m ai-service | rg '\[AIStartup\]'
```

Confirm startup reports `llm_tools`, `gemini`, `gemini-3.1-flash-lite`. Use one fresh conversation in the authenticated customer UI, with a normal empty authoritative cart. Do not run an automated qualification batch.

1. Ask `Cho tôi 2 ly đắt nhất và rẻ nhất`. Expect two total canonical cards, or one clarification if total/each is ambiguous. Check canonical IDs if display names coincide.
2. Choose a displayed drink, answer its actual required options, then choose an available cake. Edit quantity using the current cart line/card. Finish the cart and explicitly select or skip a shown voucher.
3. Send `Tôi uống tại chỗ`. Expect fulfillment acknowledgment and payment/branch guidance; canonical payment cards when read.
4. Send `Thanh toán tiền mặt`. Expect branch/location guidance while branch is missing; no order or premature summary.
5. Send `Dùng địa chỉ trong hồ sơ của tôi`. Expect profile authority followed by resolution of its actual address as origin, nearby branch cards and a later branch choice. No delivery address for dine-in.
6. Send `Chọn chi nhánh 1` against those cards. Expect one actual branch selection and a fresh summary/confirmation UI.
7. Send `oke xác nhận nhé bạn` once. Expect one authoritative order and its ID. Do not repeat the whole journey to test retry.
8. Only if the client loses the final response, resend exactly the same final text in the same pending conversation/session. It must reuse `client_message_id` and replay the result. A distinct/new confirmation turn is not the lost-response retry contract.

Read only the new structural logs:

```sh
docker compose logs --since 10m ai-service | rg '\[AgentProviderRequest\]|\[AgentProvider\]|\[ToolGateway\]|\[LLMToolTurn\]'
```

Optional later separate checks: read-only product question while a summary is pending; real payment/cart change invalidates summary; stale/expired summary refresh requires a new confirmation turn; delivery profile address with ambiguous candidate selection retains canonical coordinates. These are not automated or executed here.

## S. Expected final-confirm logs

Fresh normal confirmation: one gateway `confirm_checkout`, `guardrail_result=ok` (or authoritative `already_processed`), no repeated branch/choice/voucher writes, approximately two successful model requests, `provider_failure_count=0`, zero exposed tools for final synthesis, `final_synthesis_source=llm` with no validation issue. If final prose is rejected after a committed order, the authoritative success message may render with `server_factual_fallback`; no second order call is allowed. The order ID must come from the actual business result, not model invention.

Stale confirmation: fixed denial reason → at most one `request_checkout` recovery → summary/blocker → later-turn YES. No order before that later confirmation. Lost-response retry returns the existing durable turn and performs no inference or new order mutation.

These latency/request targets were demonstrated with scripted inference; actual Gemini behavior and wall-clock/token usage are not claimed as live-qualified.

## T. Final Git state

HEAD and branch unchanged. Fourteen task files changed/new: nine production Python files, three Python test files, one JavaScript test file and this report. Local `.env` remains ignored. No unrelated user changes were overwritten; starting tree was clean. All changes remain reviewable and uncommitted.

## U. Git actions

**NO COMMIT PERFORMED. NO PUSH PERFORMED.** No merge, rebase, stash, reset or branch change.
