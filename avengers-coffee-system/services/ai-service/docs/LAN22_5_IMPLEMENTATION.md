# LAN22.5 — Bounded compound discovery and final display selection

Implemented with offline scripted inference and in-memory authorities. Live planning quality, tokens and latency have not been measured. Paths below are relative to `avengers-coffee-system/services/ai-service`, except the explicit root `.env` and attachment.

## A. Actual starting branch and HEAD

Branch `branch_thaian`; HEAD `afef3038ff6c539cc65519a712e42a8efbf563dd` (`sua chatbot lan 22.4`). Starting working tree and diff were clean. No applicable `AGENTS.md` was found. Branch and HEAD remain unchanged.

## B. Existing local changes preserved

There were no uncommitted changes at task entry. The committed LAN22.3/LAN22.4 implementation was retained. No checkout business service, Order Service, voucher rule, RAG internal, Gemini compatibility layer or production frontend was changed.

The ignored, untracked root `.env` was checked using only these four allowlisted settings, without printing credentials, and was not edited:

```dotenv
AI_AGENT_PROVIDER=gemini
AI_AGENT_MODEL=gemini-3.1-flash-lite
AI_AGENT_FALLBACK_PROVIDERS=gemini
AI_CHAT_ORCHESTRATOR_MODE=llm_tools
```

Provider/model defaults, output token limits and tool-round limits were not increased.

## C. Exact files inspected

- User request: `/Users/thaian/.codex/attachments/6a335eab-4050-45be-b1bb-7a19ac6d3d42/Pasted text.txt`.
- `src/agents/llm_tool_orchestrator.py`, `tool_artifacts.py`, `tool_policy.py`, `tool_capabilities.py`, `agent_context.py`, `agent_memory.py`, `shopping_language.py`.
- `src/common/groq_service.py`, `agent_provider_policy.py`, `gemini_compat.py`.
- `src/function_calling/tools/product_tools.py`.
- `tests/conftest.py`, `test_llm_tool_orchestrator.py`, `test_checkout_guarded_contract.py`, `test_gemini_guarded_continuation.py`, `test_guarded_tool_gateway.py`.
- `docs/LAN22_4_IMPLEMENTATION.md`; root `.env` qualification allowlist only.
- New `src/agents/discovery_contract.py` and `tests/test_compound_discovery_contract.py` were reviewed after creation.

## D. Exact files changed

| File | Result |
| --- | --- |
| `src/agents/discovery_contract.py` (new) | Pure normalized signatures, complementary-pair detector and compact discovery response contract. |
| `src/agents/tool_artifacts.py` | Turn-local ordered batches; separate candidate authority; final presentation barrier; safe fallback; ranks instead of discovery display ordinals; one-repair eligibility/context; current validation telemetry. |
| `src/agents/tool_policy.py` | Normalize discovery cache keys/effective args; collect cache reuse without duplicate batches; strip planning metadata before authority execution; resolve fresh canonical candidate IDs separately from visible ordinals. |
| `src/agents/tool_capabilities.py` | Optional bounded `planned_discovery_reads`; candidate availability unlocks canonical fact/options capabilities independently of visible snapshots. |
| `src/agents/llm_tool_orchestrator.py` | Generic independent-arm/default-count prompt, callbacks, discovery metrics and final UI count after presentation validation/fallback. |
| `src/common/groq_service.py` | Stop completed discovery plans/pairs; exactly one tools-disabled formatting repair, with one exclusively reserved extra slot at the existing loop boundary. |
| `tests/test_compound_discovery_contract.py` (new) | Focused offline regression coverage. |
| `tests/test_checkout_guarded_contract.py` | Two presentation tests now inspect candidate authority before final selection; the 32-candidate fixture represents distinct sort signatures. Their final selection assertions remain. |
| `docs/LAN22_5_IMPLEMENTATION.md` (new) | This A–Y report. |

## E. Root causes and certainty

**PROVEN by source:** discovery previously merged results directly into `ui.products` and visible snapshots, capped at 16. Malformed JSON returned before `_display_issue()`, leaving `display_unresolved` false. `factual_fallback()` then printed every accumulated UI product. Completed opposing-sort reads had no structural completion detector. A tools-disabled final response could fail envelope validation without any formatting repair opportunity. UI metrics were computed before final presentation validation.

**PROVEN by the supplied runtime evidence:** the recorded turn had four requests, three tool rounds, no provider failures, a cached repeated read, `missing_envelope`, server factual fallback and 16 cards. These observations are consistent with the source path above.

**LIKELY:** unnecessary serial/repeated reads, oversized candidates and repeated context contributed to the recorded latency/token cost. Their individual contributions cannot be quantified from the structural record.

**NOT PROVEN:** the precise malformed final text, why the model produced it, or whether truncation contributed. No raw final response was available. This record does not establish a Gemini 400, rate limit, catalog data error or checkout failure. No new live reproduction was attempted.

## F. Why 16 products escaped

Two reads populated a candidate union; the UI cap retained 16. JSON parsing failed before display selection validation could mark it unresolved. The fallback treated this candidate union as a display decision and rendered it wholesale. The server's new final barrier applies even when parsing/provider synthesis fails.

## G. Candidate pool versus presentation, before and after

Before: discovery result → merged UI/visible pool → optional model selection, which parsing failure could bypass.

After: discovery result → full turn-local `product_candidates` plus compact ordered `discovery_batches` → validated selection or safe bounded fallback → `ui.products` and visible snapshot. Batches contain tool, normalized args/signature and ordered canonical IDs, without duplicated product payloads. Empty successful batches are recorded. Cached repeats do not append another batch.

Discovery candidates get `result_rank` in model evidence, never customer ordinals. Candidate presence can unlock detail/options tools, but only final selected rows get `display_index`. Only these visible rows are saved to conversation memory; batches and the candidate pool are not. A completed confirmation cannot resurrect earlier discovery cards.

## H. Complementary completion detection

For `filter_catalog`, compare normalized argument sets after excluding **only** `sort_by`. Both `price_asc` and `price_desc` under the same remaining arguments complete a pair. Category, search, scope, bounds, inclusivity and limit remain part of the base. Different material bases do not trigger this stop. The detector operates after the whole proposed tool batch, so it does not cut off independent calls already in that batch.

An optional bounded `planned_discovery_reads` declares the total distinct discovery reads on the first call. A declared plan takes precedence over early pair completion, preserving 3+ arms and additional reads. For multiple category scopes, it also prevents the older single-category correction from collapsing separate food/drink arms. The ordinary single-scope category correction remains. There is no extra planner call, Vietnamese ranking phrase router or hard-coded product name.

## I. Repeated-read stopping

The gateway retains its business-revision cache boundary and uses normalized discovery signatures. JSON key order, omitted defaults and provider-equivalent search forms reuse successful reads. Filter search follows the provider's accent/case/token rules; recommendation search preserves accents/internal whitespace because its SQL LIKE contract differs. Material differences stay distinct.

A cached successful repeat supplies the original result with a reuse marker, increments the reuse counter, and does not add candidates/batches/cards. The existing loop repeat fence then immediately requests tools-disabled synthesis. No authority re-execution or extra discovery round follows that repeat. Successful genuinely new authority results remain evidence rather than being mislabeled cache hits.

## J. One final-envelope repair

Only envelope/display formatting issues backed by successful tool evidence qualify. Exactly one inference runs with an empty tool surface and empty executor map. If the normal tool budget ends at that malformed final response, one extra slot is reserved solely for this repair. A second invalid response stops safely. Business denials and provider failures do not enter this formatting-repair path.

For pure discovery, repair context includes a short untrusted-data contract, newest user message, batch IDs/args and canonical tool facts/ranks. Irrelevant cart/history, images and provider metadata are omitted. Every assistant tool-call row and corresponding result row remains; continuation metadata/thought signatures are copied unchanged. Mixed RAG/cart/write turns retain their evidence conservatively. A compact repair system message is not overwritten by the normal context refresh.

`final_envelope_repair_count` is 0 or 1. A successful repaired response resets `response_validation_issue` to null.

## K. Why writes cannot replay

Repair has no executors. Even an illicit tool call returned during repair is rejected before dispatch. The inference loop is not restarted; existing write cache, operation identity, gateway authorization, prior-action binding and durable client-turn replay remain in place. Tests cover a successful quantity write followed by valid/invalid formatting repair and a repeated identical client turn: the authority write runs once.

## L. Fallback rules

- One successful logical discovery batch may publish its canonical ordered results, capped at 16, when there is no invalid display selection or incomplete declared plan.
- A validated final selection publishes exactly its ordered unique canonical IDs and total count.
- Multiple successful batches without a valid final selection may publish one result per batch only if every batch has exactly one distinct canonical ID and the declared plan is complete.
- Multi-candidate batches, empty/ambiguous arms, failed/incomplete plans or invalid selection produce zero cards and concise clarification/recovery. No arbitrary subset or candidate union is chosen.
- Confirmation/write/checkout evidence keeps its existing fallback priority. Discovery failures retain their actual failure message when available.

An explicit total that cannot be safely recovered from malformed output is not inferred from per-read candidate budgets.

## M. Tie semantics

The generic prompt asks for one representative per comparison arm when the customer supplied no quantity, using limit 1. Explicit totals, per-group quantities and all-ties requests remain model-owned semantics and must fit the validated selection contract. Multiple tied IDs can be selected when explicitly requested; ties are not expanded automatically. Display remains bounded at 16 and grounded in returned authority rows. The server does not infer an extreme subset from an ambiguous multi-candidate batch.

## N. Canonical identity

Canonical product ID is the deduplication key. Equal names/prices/categories never merge different IDs. Duplicate IDs are rejected in final selections and deduplicated inside batch ID references. Customer-visible order is the final selected order; next-turn product number 2 refers to that order, with hidden candidates absent from its snapshot. Pending configured selections remain preserved.

## O. Offline tests

The new focused file covers parallel and serial extrema, normalized read reuse, malformed final → valid repair, repeated malformed repair → zero/unambiguous cards, provider-final failure, repair at loop-budget end, illicit repair tools, default versus explicit ties, same-name IDs, total/per-group counts, invalid/duplicate/unknown display IDs, single-read browse, selected ordinal continuity, 3+ arms, differing material bases, multiple categories, empty/incomplete authority rows, incomplete declared plans, completed-order UI clearing, write-once repair and durable replay.

The LAN22.4 suite verifies prior-turn confirm binding/recovery, no-ops, scoped profile/location behavior, canonical delivery/pickup behavior, fallback and total display contracts. LAN22.3 wire tests verify exact signature continuation, dynamic surfaces, bounded compatibility retries, request-shape classification and write fences.

Before execution, shared runtime, conftest and wire fixtures were inspected. The runtime uses synthetic credentials, a scripted Gemini client and memory cart/DB/Redis/catalog/options authorities. The launcher blocks sockets, DNS and requests **before test imports**, disables plugin autoload, and removes inherited secret variables. Test fixtures also block alternate clients and HTTP transport. Wire tests restore only the real serializer with scripted HTTP responses; no mock forwards traffic.

## P. Offline command executed

Working directory: `avengers-coffee-system/services/ai-service`. Final invocation:

```sh
.venv/bin/python - <<'PY'
import os, socket, sys
for name in list(os.environ):
    if any(part in name.upper() for part in ('API_KEY', 'SECRET', 'TOKEN', 'PASSWORD')):
        del os.environ[name]
os.environ.update(PYTEST_DISABLE_PLUGIN_AUTOLOAD='1', PYTHONDONTWRITEBYTECODE='1', ENVIRONMENT='test')
sys.dont_write_bytecode = True
def no_network(*args, **kwargs):
    raise RuntimeError('Network forbidden in focused offline regression')
socket.socket.connect = no_network
socket.socket.connect_ex = no_network
socket.create_connection = no_network
socket.getaddrinfo = no_network
import requests
requests.sessions.Session.request = no_network
requests.post = no_network
import pytest
raise SystemExit(pytest.main(['-q', 'tests/test_compound_discovery_contract.py', 'tests/test_checkout_guarded_contract.py', 'tests/test_gemini_guarded_continuation.py', '-p', 'no:cacheprovider', '--tb=short', '--show-capture=no']))
PY
```

Additional read-only checks: `git diff --check`; in-memory Python `compile()` without imports/bytecode; AST comparison of `FakeToolCall`, `_continuation_tool_call` and `GeminiClient` against `git show HEAD:...`; root `.env` allowlist comparison; `git check-ignore .env`; `git ls-files -- .env`; branch/HEAD/status inspection.

## Q. Results

Final focused run: **135 passed** (43 LAN22.5, 72 LAN22.4, 20 LAN22.3). Earlier runs exposed fixture assumptions and the old visible-snapshot capability dependency; those were corrected, and the complete focused suites passed afterward. Existing dependency warnings do not represent transport requests.

Scripted parallel comparison: two inference requests, one tool round, two authority reads, zero failures/cache hits, exactly two cards and tools disabled for final synthesis. Scripted serial comparison: three requests, two tool rounds, two authority reads. Successful format repair: one extra tools-disabled request, repair count 1, final validation issue null. Unresolved multi-candidate repair: zero cards. One distinct result per arm: two safe server-selected cards. UI metrics reflect these final counts.

These are **offline contract results**, not actual Gemini token/latency measurements. No claim of a real latency or token reduction is made. Syntax/diff checks pass; Gemini client/continuation AST is unchanged.

## R. Capability inventory

**19 READ + 14 WRITE = 33.** No capability was added or removed. Final confirmation schema remains `{}` and server-bound. Default surfaces remain context-scoped; candidates unlock the same detail capabilities without becoming visible ordinals.

## S. Provider/API calls

**NOT RUN.** No real inference, quota qualification, model list, catalog, geocoding or `/ai/agent/chat` call was made.

## T. Docker

**NOT RUN.** No build/start/restart/qualification command was executed.

## U. Exactly one manual retest sequence — user only

On the local customer web app after you load this implementation, log in with your test account and create a fresh conversation/session. Send exactly one message, once:

> cho tôi xem món cà phê đắt nhất và rẻ nhất đi

Inspect that response's product cards and the corresponding `[LLMToolTurn]` log. Use a fresh client message identity; do not reuse an earlier turn's identity. This sequence was **not executed** by Codex.

## V. Expected real success signals

`provider_failure_count=0`; `final_synthesis_source=llm` or a safe bounded server selection; `response_validation_issue=null` when the envelope succeeds (including successful repair); `ui_artifacts_created.products` approximately 2 under the default one-per-arm interpretation. No candidate-pool dump and no third identical catalog authority execution. Prefer `request_count` 2–3, `tool_round_count` 1–2 and cache hits 0; a malformed initial final response may require the one reserved repair request. Live values remain unverified.

## W. If real final JSON still fails

Expected behavior is **not 16 products**: either one unambiguous canonical result per arm in batch order, or concise clarification with zero product cards. No tools or writes execute during the one formatting repair.

## X. Final Git status

Branch/HEAD unchanged; unstaged changes only:

```text
 M avengers-coffee-system/services/ai-service/src/agents/llm_tool_orchestrator.py
 M avengers-coffee-system/services/ai-service/src/agents/tool_artifacts.py
 M avengers-coffee-system/services/ai-service/src/agents/tool_capabilities.py
 M avengers-coffee-system/services/ai-service/src/agents/tool_policy.py
 M avengers-coffee-system/services/ai-service/src/common/groq_service.py
 M avengers-coffee-system/services/ai-service/tests/test_checkout_guarded_contract.py
?? avengers-coffee-system/services/ai-service/docs/LAN22_5_IMPLEMENTATION.md
?? avengers-coffee-system/services/ai-service/src/agents/discovery_contract.py
?? avengers-coffee-system/services/ai-service/tests/test_compound_discovery_contract.py
```

## Y. Git actions

**NO COMMIT PERFORMED. NO PUSH PERFORMED.** No merge, rebase, reset, stash or discard was performed.
