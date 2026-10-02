# LAN22.3 — Gemini guarded continuation

## Starting state and evidence

Branch `branch_thaian`, HEAD `bb65e9ac5847bae2e75da9e84e90f1e8224b51cd` (`sua chatbot lan 23`). The only initial tracked modification was LAN22.2's product-description/RAG prompt guidance; it is preserved. The ignored local `.env` remains untouched in this pass: `llm_tools`, provider `gemini`, explicit model `gemini-3.1-flash-lite`, fallback `gemini`. Credentials were neither changed nor displayed.

The supplied real turn succeeded at inference 0 and `filter_catalog`, then failed at inference 1 with HTTP 400. Its 6→11 capabilities, 3434→5873 schema characters, ~1990 successful input tokens and ~9186 ms latency are **user-provided evidence**, not new measurements. This task made no real inference/model-list/chat request and did not start/build Docker.

**Strongest root-cause hypothesis: discarded Gemini thought-signature metadata.** Source inspection establishes a definite serialization defect: `FakeToolCall` previously retained only ID/type/function, discarding `extra_content.google.thought_signature`; the loop independently reconstructed tool calls from those fields. Thus any returned signature was absent from the next request. Google's [thought-signature contract and OpenAI-compatible examples](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures) require returning the opaque signature with tool-call history and describe missing signatures causing 400. This directly fits a successful first tool call followed by failed continuation. The actual failing response/error body was unavailable, so the original real failure is **not conclusively diagnosed**. The model remains experimentally configured, not fully qualified.

## Round differential and alternatives reviewed

| Dimension | Round 0 | Round 1 |
| --- | --- | --- |
| Messages | system, user | refreshed system, user, assistant tool_calls, tool result |
| Assistant tool call | none | original call ID/name/arguments; null content becomes empty string; previously lost signature |
| Tool result | none | matching `tool_call_id`, optional `name`, projected JSON string with canonical products |
| Tool choice | auto | auto (required is only used for existing semantic repair) |
| Response format | json_object | json_object, unchanged |
| Tools | 6 browsing capabilities | 11 after canonical products become visible |
| Context | no visible canonical products | canonical product snapshots/focus refreshed |

Initial six: `filter_catalog`, `get_recommendations`, `search_knowledge_base`, `get_cart`, `find_nearest_branch`, `resolve_location`.

The five added capabilities are exactly:

| Added tool | Schema inspected |
| --- | --- |
| get_product_options | object, string product_id, required product_id, additionalProperties=false |
| get_product_insights | object, string product_name, required product_name, additionalProperties=false |
| check_price_and_stock | object, product_name_query required; optional string options/branch, integer quantity, array-of-string toppings; additionalProperties=false |
| get_product_description | object, string product_id/query, required product_id, additionalProperties=false |
| add_to_cart | object, required product_id; quantity integer/minimum=1; string options; toppings array/maxItems=16; boolean use_defaults; additionalProperties=false |

Root object strictness and required arrays already occur in the accepted round. The new add schema has additional numeric/array constraints; static inspection alone cannot qualify all provider schema keywords. No union/nullable/oneOf/anyOf was found in those five schemas. No schema is loosened or removed. Dynamic 6→11 refresh remains intentional. The continuation's ID/result-string/order and optional name align with the documented examples; there is no evidence to remove the name or arbitrarily change empty assistant content. The tools/JSON-format combination remains an alternative hypothesis; it is not globally disabled based on speculation. New diagnostics distinguish these cases at the next manual test.

## Implementation and safety

* `src/common/gemini_compat.py`: pure representation/diagnostic helpers. Allowlist only the returned opaque Google thought signature; preserve it byte-for-byte without interpreting, redacting, synthesizing or bypassing validation. Copy history; remove Gemini metadata for other providers. No business arguments, IDs, ordering or tool-result contents change.
* `src/common/groq_service.py`: wrapped response retains that metadata; Gemini continuation serializes it back. Other provider tool-call shapes remain canonical. No signature enters tool args, artifacts, UI, Redis or logs. Tools-disabled guarded rounds that receive an illicit model tool call return an empty reply/error, so the server renders factual fallback instead of treating an unvalidated prose placeholder as LLM synthesis.
* `src/common/agent_provider_policy.py`: content-free attempt diagnostics, allowlisted error categories, normalized-shape fencing and an evidence-triggered bounded compatibility retry.
* `src/agents/llm_tool_orchestrator.py` and one observability line in `tool_artifacts.py`: log final synthesis source after reply validation. LAN22.2 prompt text is preserved; RAG/business validation logic is unchanged.

The 19 READ + 14 WRITE registry, LAN22.1 selector and schema definitions, gateway, cart/option/quantity/reference checks, authoritative price/stock/voucher/location/payment rules, checkout confirmation/fingerprint/action/expiry, operation IDs, durable replay and mutation reconciliation remain unchanged. Inference retries are inside `completion`, which has no tool executor. The same already-recorded history/results are resent; it cannot restart the turn or repeat a read/write. Successful same-operation repair/summary/confirmation retains the existing zero-tools/zero-executors synthesis fence.

### Exact retry policy

Primary fix is proactive signature preservation, requiring no additional HTTP attempt. Normally Gemini still receives `response_format=json_object` on tool-enabled and tools-disabled rounds, plus existing auto/required tool choice when tools exist. OpenAI/Groq/etc retain their JSON-format behavior.

Only when Gemini HTTP 400 explicitly classifies `response_format_incompatible` may policy omit **that single field** and retry inference once, using the same model/client/key, messages, schemas and tool choice. This also works for tools-disabled synthesis; zero tools remain zero. The retry shares the existing total attempt/time budgets and is absent if capacity is exhausted. The normalized mode is remembered only within the current turn, separately for tool-enabled and tools-disabled requests. No retry matrix or global production default change is introduced.

Unknown, schema, tool-choice, tool-message or missing-signature 400s stop for that model/request shape; no credential rotation is attempted to fix them. Signatures cannot be recovered by guessing one, so no dummy signature is inserted. Existing explicitly configured fallback providers/models retain their architecture, but the local explicit Gemini model plus Gemini-only fallback cannot silently substitute another model/provider. Other transient/auth/quota handling stays bounded as before.

Failed canonical and normalized shapes have distinct fingerprints. Each HTTP attempt counts in `provider_attempt_count`; successful inference responses count in `request_count`. A same-key compatibility/context retry does not count as provider/account/model fallback. Final source is `llm`, `server_factual_fallback`, or `shadow`; reply validation invoking factual fallback is included in the fallback classification.

### Safe observability

`[AgentProviderRequest]` and `provider_request_shapes` contain provider/model, round_index/request_sequence, fixed role sequence/message count, content **types only**, tool/result counts, hashed tool sets/schemas, schema character size, response-format presence/type, tool choice, tool-call/result pairing, signature **count only**, compatibility mode and request_shape_fingerprint. The fingerprint excludes prompts, tool results, argument values, call IDs, credentials and signature values.

`[AgentProvider]` and final turn metrics add `provider_error_category`, `provider_error_field`, `provider_request_shape_fingerprint`, `compatibility_retry_count`, `compatibility_mode` and `final_synthesis_source`. Error categories are fixed labels: response_format/tool_choice/tool_schema/tool_continuation/tool_message incompatibility or unknown. Fields are fixed allowlisted names, never provider-supplied paths/text. Raw error bodies, user/system/RAG/result content and opaque signatures are never logged.

## Offline verification

Added `tests/test_gemini_guarded_continuation.py`. Before execution, inspected its imported business fixture: cart/DB/Redis/catalog/options/write/durable replay use memory fakes. The new fixture removes provider keys, supplies synthetic Gemini keys, forbids other clients and blocks sockets/requests transport. Only the actual Gemini/OpenAI **serializers** are exercised, with `requests.post` replaced by a script that never forwards. The test launcher also removed credential environment variables and blocked sockets/DNS before pytest/application imports; plugin autoload was disabled. Imported application sources do not load dotenv.

**20 focused cases passed**, 0.64 seconds; one existing urllib3/LibreSSL environment warning. Coverage includes signed first/second/third inference, exact 6→11 additions, stable canonical products/result IDs, multi-round signatures, response-format downgrade, same-key/bounded retry, incompatible-shape fencing, unknown/schema/signature 400 stop, attempt-budget exhaustion, repaired write exactly once, narrow repair, zero-tool synthesis refusing an illicit write, factual fallback source, strict argument rejection, OpenAI JSON behavior and no private contents in diagnostics/logs/UI/Redis. These prove local wire/loop contracts, not real Gemini acceptance, latency or token savings.

Also performed no-import syntax compilation, diff whitespace check, before/after AST inventory/selector/schema/gateway audits, secret scan of tracked diff/new files against local credential values and key-shaped strings, `.env` ignore/untracked and preserved agent-setting checks, hardcoding/diff review and final status review. No full regression, E2E, provider matrix, Docker, real provider/chat/health/model-list request or Redis integration was run.

## ONE manual retest — user only

From repository root, rebuild only AI service and inspect startup (not executed by Codex):

```sh
docker compose up -d --no-deps --build ai-service
docker compose logs --since 2m ai-service | rg '\[AIStartup\]'
```

Verify `agent_provider=gemini`, `agent_model=gemini-3.1-flash-lite` and `llm_tools`. In the authenticated customer UI with an empty authoritative cart/fresh conversation, send **once**: `Cho tôi xem 2 món cà phê`. Alternatively send one direct request below using your existing authenticated customer/session/token; it sends one POST and has no retry loop. Use one method only.

```sh
# Set LAN223_SESSION_ID to your authenticated customer ID; LAN223_TOKEN to your
# existing bearer token if needed. LAN223_API_URL defaults to localhost:8009.
python3 - <<'PY'
import json, os, uuid, urllib.request
body = {'session_id': os.environ['LAN223_SESSION_ID'],
        'conversation_id': str(uuid.uuid4()), 'client_message_id': str(uuid.uuid4()),
        'message': 'Cho tôi xem 2 món cà phê'}
headers = {'Content-Type': 'application/json'}
if os.getenv('LAN223_TOKEN'):
    headers['Authorization'] = 'Bearer ' + os.environ['LAN223_TOKEN']
request = urllib.request.Request(os.getenv('LAN223_API_URL', 'http://localhost:8009') + '/ai/agent/chat',
    data=json.dumps(body, ensure_ascii=False).encode(), headers=headers, method='POST')
with urllib.request.urlopen(request, timeout=90) as response:
    print(response.read().decode())
PY
```

Inspect only new structural/turn logs:

```sh
docker compose logs --since 5m ai-service | rg '\[AgentProviderRequest\]|\[AgentProvider\]|\[ToolGateway\]|\[LLMToolTurn\]'
```

Expected primary-fix signal: round-0 `filter_catalog`, gateway status ok, round-1 assistant/tool pair with signature_count=1, no 400, `provider=gemini`, the exact Flash Lite model, `request_count>=2`, `tool_round_count=1`, `provider_failure_count=0`, `final_synthesis_source=llm`. With an empty verified authenticated browsing cart, surfaces remain 6→11. Other legitimate draft states can expose different counts. A recognized format downgrade may instead show one failure, one compatibility retry and final source llm; record that as recovered compatibility, not a clean zero-failure pass.

If it still fails, return the safe `[AgentProviderRequest]` entries and `[AgentProvider]` category/field plus `[LLMToolTurn]` fields: round/request sequence, roles/types, tool counts, schema/fingerprint hashes, signature count, result pairing, response-format/tool-choice/mode, provider_error_category/field, compatibility_retry_count, provider_attempt_count/failure_count/request_count and final_synthesis_source. Do not send raw response bodies, prompt/tool/RAG content, credentials or signature values. Do not repeat quota-consuming attempts automatically.

## Final worktree

Modified: `llm_tool_orchestrator.py` (including preserved LAN22.2 prompt change), `tool_artifacts.py`, `agent_provider_policy.py`, `groq_service.py`. New: `gemini_compat.py`, focused regression test and this report. Root `.env` remains ignored/untracked and unchanged in LAN22.3. No staged changes. **NO COMMIT PERFORMED. NO PUSH PERFORMED.**
