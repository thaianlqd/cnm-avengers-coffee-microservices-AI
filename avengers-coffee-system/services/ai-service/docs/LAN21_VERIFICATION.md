# LAN21 — LLM-first demo readiness verification

Date: 2026-10-02, Asia/Ho_Chi_Minh.

## A. Actual branch / HEAD / remote

Branch `branch_thaian`; local HEAD and `origin/branch_thaian` are `30c5a03105558ee85297277559f34099cb365ecf` (`mong la xong chatbot`). Parent is `a4c2b1bc5031792ed741e857ef30e16b3ba0ae95`; `origin/main` is `dc872e72ba29cac71b2395763a6776b7e6719f35`. `git fetch origin` succeeded before edits. The initial worktree was clean and no `AGENTS.md` was found.

## B. Why the user's manual test was legacy, not LAN20

The running container explicitly had `AI_CHAT_ORCHESTRATOR_MODE=legacy`; its logs showed `src.agents.order_flow_graph`. The greeting and globally appended stale-voucher sentence therefore exercised the rollback graph, not `run_llm_tool_turn`.

## C. Exact runtime configuration root cause

Compose defaulted the mode to `legacy`, and neither the root `.env` nor an AI-service `.env` supplied a mode override. LAN20's new path existed but ordinary local/demo startup selected the old path.

## D. Runtime/default configuration fix

Root `.env.example` and Compose now default normal demo startup to `AI_CHAT_ORCHESTRATOR_MODE=llm_tools`, `AI_AGENT_PROVIDER=openai`, and `AI_AGENT_MODEL=gpt-4o-mini`. Explicit `legacy` rollback and `shadow` remain supported. The unconfigured direct-library fallback stays `legacy` for compatibility with rollback-oriented callers and tests.

## E. Voucher notice root cause

Authoritative cart synchronization could set `voucher_invalidated` as legitimate housekeeping. Legacy `_render()` then appended that notice to every response, regardless of current operation, which let an old cart event hijack social and knowledge turns.

## F. Voucher/state relevance fix

The state correction is preserved. The notice is surfaced and cleared only on a cart, voucher, or checkout-owned turn, determined from structured intent/tool provenance. Unrelated turns retain the metadata for the next relevant response. Existing voucher eligibility/apply/remove calculations were not changed.

## G. Conversation isolation findings

Redis memory remains keyed by the server-scoped customer/conversation identity and stores bounded recent turns, visible snapshots, focus, and candidates. A second conversation does not inherit the first conversation's focus or pending ownership. Both conversations still resolve to the same customer-scoped authoritative Order Service cart. No cart authority was moved into Redis and a greeting does not clear the customer cart.

## H. Provider/model selection before

The agent loop inherited the global compatible-client order and selected whichever configured key appeared first. LAN20 happened to qualify `gpt-4o-mini-2024-07-18`; that was not an explicit demo policy. The OpenAI and Gemini compatibility wrappers also ignored the caller's requested model in some paths.

## I. Provider/model selection after

`AI_AGENT_PROVIDER` now deliberately orders the compatible clients and `AI_AGENT_MODEL` selects the model for that provider across the tool loop. Compatible provider fallback is retained for provider outage/rate limits and never falls through to the legacy business graph. Provider wrappers honor the supplied model. Runtime/startup/health expose only the non-sensitive preference and resolved memory availability.

## J. Real-model qualification by provider/model

The intended demo provider, OpenAI `gpt-4o-mini-2024-07-18`, completed one controlled **28/28** qualification run. The run used the real provider/tool protocol with isolated in-memory business authorities; it made no customer/order writes. The matrix covered social, catalog ranking/constraints, generic food/drink, review, RAG, price/stock, pending options, add/edit/remove, voucher/choices, location/branch, summary interruption/re-render, payment, and final confirmation. Later repeated qualification attempts exhausted provider quota; their downstream `All LLM clients failed` rows are classified as provider-rate-limit evidence, not semantic acceptance runs. Gemini was explicitly probed because its credential was configured: `gemini-3.6-flash` completed the first authoritative read but could not complete the final social response after the compatible provider chain was rate-limited, so no Gemini matrix pass is claimed.

## K. Generic-food root cause/fix

Review lookup previously accepted a broad fuzzy term that a backend could map to its first product. `get_product_insights` now requires one exact concrete canonical identity and rejects recommendation, RAG, price, and inventory owners. Catalog/recommendation owns broad discovery; current-message category evidence prevents an older category from leaking into a new broad request.

## L. Taste-vs-review root cause/fix

The model could use customer ratings for a static taste/description question. Existing knowledge authority is now reused only as a safety validator: static product facets reject review authority and dynamic price rejects RAG. A known focused/pending product forces an authoritative RAG read instead of an unnecessary clarification. Actual customer-review questions still use `get_product_insights`. Read-only interruptions preserve pending options.

## M. Wrong-cart-row root cause/fix

The old gateway checked only whether the model's ID and ordinal agreed with each other. It now independently parses explicit cart-line ordinal/name evidence and compares it with the current authoritative cart. Wrong row, named-product mismatch, ambiguous duplicate configurations, wrong explicit quantity, and operation switching after denial are rejected before a write. Structured recovery includes the expected canonical line. A recoverable denial forces an immediate same-operation tool repair; a successful repair forces a tools-disabled final response, preventing a second mutation while prose is composed.

## N. RAG response-quality changes

Normal static answers may keep a natural paraphrase only when the model supplies a valid full-document evidence quote and the public reply visibly overlaps approved evidence. Missing/invalid grounding and ingredient/allergen questions retain conservative evidence text. Dynamic facts still require their service tools. A pending checkout summary must be re-rendered with `request_checkout`; cart/quote reads cannot fabricate the canonical confirmation UI.

## O. Files changed

- Root: `.env.example`, `docker-compose.yml`.
- AI runtime: `main.py`, `src/agents/agent_memory.py`, `agent_service.py`, `llm_tool_orchestrator.py`, `order_flow_graph.py`, `selection_language.py`, `shopping_language.py`, `tool_artifacts.py`, `tool_capabilities.py`, `tool_policy.py`, and `src/common/groq_service.py`.
- Documentation/tests: `docs/LLM_TOOL_ORCHESTRATOR.md`, this report, and `tests/test_lan21_demo_readiness.py`.
- No Web or Order source changed. No secret `.env`, generated root report, or `/tmp` artifact was added.

## P. Tests added

`test_lan21_demo_readiness.py` covers demo defaults and rollback, provider/model selection, social/meta turns, stale voucher relevance, review/RAG/price authority, forced evidence repair, current-scope category correction, exact cart target and quantity checks, same-operation recovery, rejection of an unrelated successful read as write-repair completion, post-repair tool lock, staged quantity, checkout choice validation, natural RAG grounding, summary re-render requirements, and conversation isolation/customer cart ownership.

## Q. New LAN21 focused results

Final focused safety/orchestrator selection: **205 passed**, one existing LangGraph warning. A broader focused boundary run during the pass reached **260 passed** before the final repair tests were added; the final full suite below includes every test.

## R. Real-model semantic result

**28/28 passed** in one controlled OpenAI run. Later attempts reached 27/28, 23/28, and 15/28 before provider rate limiting cascaded through their remaining turns. These incomplete attempts do not replace the completed result and were not retried until random output passed; concrete protocol defects found before quota exhaustion were fixed generically and covered deterministically. The explicit Gemini probe also ended on provider availability, so it has no semantic matrix score.

## S. Full AI result

Local `.venv/bin/python -m pytest -q tests`: **1,836 passed, 1 skipped**, one LangGraph warning, **12.56 seconds**. The skip is the opt-in real Redis test. Final container suite with that Redis check enabled: **1,837 passed**, two existing warnings, **273.55 seconds**. The container test process explicitly used `legacy` as its baseline, blank provider/model/API-key settings, `ENVIRONMENT=test`, and local HTTP 404 endpoints for external Order/Menu reads; these overrides did not alter the running service environment. Because the AI Docker build context excludes the repo-level contract and configuration files used by two tests, a temporary correctly nested test tree received `customer-availability-cases.json`, `docker-compose.yml`, and `.env.example`. Earlier container attempts exposed these environment/fixture issues and one accidental set of overlapping pytest processes; the container was restarted, verified clean, and the final single run completed with exit 0.

## T. Web result/build

Unchanged Web Customer: **28/28 Node tests**, **3/3 Nearby groups**, **11/11 Checkout groups** passed. Vite production build passed in **3.17 seconds**. Existing null-input, Browserslist-age, and large-chunk notices remain.

## U. Order result/build

Unchanged Order Service: **11/11 suites, 108/108 tests** passed; Nest build exited 0. Localhost-binding permission was used for its HTTP tests.

## V. Runtime `llm_tools` proof

Ordinary `docker compose up -d --no-deps --build ai-service` produced container `3b94363f1c209b79d6da50971cab4189fcb1c104713baaa7e6bd0f6eb29e0c64`, image `sha256:391e21c2f9ee3dc59bd03e5c56fc1bbc193993f32c26b4a709797375246748f9`, finally restarted clean at `2026-10-02 05:22:14` local, with zero mounts. Environment reports `llm_tools`, `openai`, `gpt-4o-mini`. Startup logged `[AIStartup] ... redis_available=true`; `/ai/health` returned HTTP 200 with the same fields after the container suite. All **54 `/app/src` Python modules plus `main.py`** match checkout SHA-256 bytes, and `docker top` shows only Docker init and one Uvicorn process. A live conversation log contains `[LLMToolTurn]` and no `order_flow_graph` lifecycle for that turn.

## W. Redis proof

The isolated real-Redis test passed in **1.28 seconds** using a random conversation key. It verified ping, write/load, one-second TTL expiry, reset/removal, and graceful degradation against an unavailable endpoint. The full container result includes this test. Startup and health both report Redis available.

## X. Manual smoke result

Earlier after activation, a live guest social turn through port 3000 returned a natural greeting, zero tools, and `[LLMToolTurn]`. The final runtime health proof passed. After repeated real-model qualification consumed provider quota, the later guest smoke entered the provider fallback chain and ended with `All LLM clients failed`; it still proved `LLMToolTurn` was the primary router but is not counted as a green conversational smoke. A targeted post-fix real-provider cart edit selected canonical line `800` and executed exactly one isolated fake update before quota blocked final prose. The completed 28/28 isolated-provider run supplies the semantic evidence while provider quota recovers.

## Y. Authenticated E2E result

**NOT RUN.** `E2E_EMAIL` and `E2E_PASSWORD` are absent from both process environment and root `.env`; values were never printed. The previously used `/Users/thaian/Desktop/avengers_e2e_natural_rag_3_scenarios.py` is also currently absent. Required command shape after restoring the harness and credentials:

```sh
test "$(docker exec avengers_ai_service printenv AI_CHAT_ORCHESTRATOR_MODE)" = llm_tools && \
E2E_EMAIL="$E2E_EMAIL" E2E_PASSWORD="$E2E_PASSWORD" \
python /Users/thaian/Desktop/avengers_e2e_natural_rag_3_scenarios.py
```

## Z. Token/latency measurements

Successful 28/28 OpenAI run; system prompt **4,776 chars**, tool schema **13,427 chars**:

| Turn | Context chars | Input/output tokens | Tool rounds / requests | LLM / total latency |
| --- | ---: | ---: | ---: | ---: |
| Social | 1,086 | 2,928 / 31 | 0 / 1 | 1,516 / 1,525 ms |
| Top-2 catalog | 1,558 | 6,436 / 158 | 1 / 2 | 3,226 / 3,237 ms |
| Product RAG | 2,229 | 6,860 / 104 | 1 / 2 | 3,209 / 3,245 ms |
| Cart quantity edit | 2,610 | 7,207 / 143 | 1 / 2 | 3,190 / 3,203 ms |
| Checkout summary | 3,998 | 19,155 / 240 | 2 / 4 | 6,167 / 6,211 ms |
| Summary after interruption | 3,926 | 22,972 / 334 | 2 / 5 | 7,956 / 7,976 ms |

## AA. Hardcoding audit

Production diff contains none of the prohibited exact demo utterances/entities, branch IDs, product IDs, or stale voucher code. The only API-key-like diff match is the existing `.env.example` placeholder. Language parsing changes are narrow mutation-safety validators (`ly` cart namespace, accented `đầu`, explicit unit quantity), not primary routing. No secrets were added.

## AB. Residual risks

Authenticated three-scenario order creation remains unverified because credentials and the external harness are unavailable. Current provider quota/rate limiting can make live demo turns unavailable until provider capacity recovers; the system reports this without replaying through legacy. Gemini is configured but did not complete its explicit probe under the same availability condition. Real-model latency and token use are highest for summary re-render repairs. Direct unconfigured library calls still default to legacy by compatibility design; Compose/runtime explicitly select `llm_tools`.

## AC. Exact git status

Tracked modifications: `.env.example`, `docker-compose.yml`, the eleven AI runtime files listed in O, and `docs/LLM_TOOL_ORCHESTRATOR.md`. Untracked: `docs/LAN21_VERIFICATION.md` and `tests/test_lan21_demo_readiness.py`. `git diff --check` passes. Nothing is staged.

## AD. Explicit confirmation

**NO COMMIT PERFORMED**

**NO PUSH PERFORMED**
