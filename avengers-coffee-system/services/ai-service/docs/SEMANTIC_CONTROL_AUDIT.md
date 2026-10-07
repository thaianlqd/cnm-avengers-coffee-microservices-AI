# Customer semantic control audit — 2026-10-07

Baseline: branch_thaian, c7d7536. No chatbot working-tree changes at audit entry. Data Platform working-tree changes belong to other work and are excluded. Audit completed before implementation.

## Root cause and lifecycle

`POST /ai/agent/chat` authenticates and durably claims/replays a turn, then calls `agent_service.run_agent` → `run_llm_tool_turn` → context/memory projection → capability-filtered model/tool loop → GuardedToolGateway → existing authoritative executor → ToolArtifacts → final validation/presentation → durable response/memory. The configured llm_tools lane nevertheless runs shopping/order/review language shortcuts, parses raw text again inside guards, and gates order/review capabilities using phrase detection. An understood semantic request can be unavailable, vetoed, rewritten or presented as a different unresolved operation.

Categories: A language semantics; B structure; C canonical grounding; D business policy; E factual authority; F presentation; G security/protocol.

| Component | Domains / responsibility | Class | Re-reads language / veto? | Decision and risk |
|---|---|---|---|---|
| main.agent_chat, ConversationMemory, mutation_operation_context | actor, turn claim, replay, stale/outcome unknown | D/G | No semantic veto | Keep; changing risks duplicate writes |
| agent_service legacy, tier1, pending_context, order_flow_graph.run_order_flow | handwritten intent/confirmation/state routing | A/D | Yes | Isolate to explicit legacy lane; do not call as fallback from semantic lane |
| llm_tool_orchestrator direct shopping/order/review controls | pre-model meaning, compound execution | A/C/F | Yes, preempts model | Replace production routing with existing model's structured evidence; retain only server UI selection |
| tool_capabilities.capabilities_for_context | state/legal tool exposure, order/review text flags | A/D | Flags hide correct tools | Remove text-based gates; retain authentication, stage, pending, cart/preview constraints |
| shopping_language, shopping_turn_control, product_option_scope | discovery, selection, per-product option language | A/B/C | Yes | Keep legacy/structural APIs; semantic lane uses canonical references and per-action attributes instead |
| selection_language, numbered snapshots | ordinal and namespace parsing | B/C with A verb heuristics | Yes | Keep strict indexes/IDs; semantic grounder does not use verb heuristics |
| tool_policy discovery/_read | category correction, review-vs-RAG authority, alternative recommendations | A/E | Yes, changes model args | Semantic action owns request fields; tool owner owns facts, canonical name checks stay |
| tool_policy add/options/cart | choice, defaults, quantities, topping edits, target permission | A/C/D/E | Yes | Use typed commitment/attributes plus exact canonical schema; preserve pricing, stock, ownership, replay |
| customer_choice_authority, payment_intent, checkout-choice helpers | voucher/default/payment/profile meaning | A/B/C | Yes | Replace raw semantic veto in model lane; keep current eligibility, wallet and enum validation |
| location_parser, resolve_location, profile helpers | extract address/area/POI, saved reference and confirmation | A/B/C/D/E | Yes | Model supplies location kind/purpose; exact saved rows/candidates and address completeness remain server/provider-owned |
| order_management, order_edit_dialogue | order references, action and confirmation vs prepared preview | A/C/D/E | Yes | Typed order refs and structured edits; keep owned service reads, revision, later-turn preview and wallet/order-state checks |
| branch_reviews | review intent and displayed comparison selection | A/C/E | Yes | Model chooses scoped review reads; exact branch identity remains server-bound |
| rag.authority, knowledge_tools, product_context | keyword authority routing, canonical retrieval, evidence sanitation | A/C/E/G | Yes | Typed static domain/facet bypasses only duplicate routing; keep approved sources, exact entities, no live claims from static evidence |
| tool_artifacts | factual envelope, display evidence, fallback | A/F/G | Raw question may trigger irrelevant display clarification | Typed failures take precedence; preserve quote/price/UI validation and compaction |
| provider policy, groq_agent_chat | budgets, bounded loops, tool sequential execution/repair | D/G | No | Keep; semantic metadata travels in same model response, no classifier call |

## Minimal target

Existing model proposes a bounded `customer_actions` batch, each action naming an existing tool, commitment, optional canonical reference and existing args. One shared schema avoids repeating evidence schemas on every tool. Ordinary read tools remain available; entity reads needing selection or facets use the same batch. Server validates the complete proposal shape, grounds references against frozen cart/displayed/pending/focus and canonical tool results, checks commitment, then invokes the existing gateway in dependency order. Missing/ambiguous targets clarify. A read-only question cannot become a write. Negation, hypothetical/conditional and unknown commitments do not authorize writes; rejection only authorizes explicit discard/skip operations. Final confirmation requires AFFIRMED plus existing prior-turn action/revision/expiry checks.

The wrapper is an orchestration adapter, not a business tool or an NLP classifier. No production phrase vocabulary determines the evidence. Legacy direct gateway APIs retain their existing behavior for explicit legacy callers; model executors cannot reach that compatibility path without semantic evidence.

## Keep unchanged

Catalog, recommendations, product options, prices/stock, cart business executors, voucher providers, wallet/payment validation, profile/geo providers, inventory, RAG ingestion/retrieval, order service protocol, authentication, turn persistence, idempotency, caching/revision, compact history/context, provider limits and model order. Two adapter seams may change: knowledge retrieval accepts a validated static route instead of reparsing language; prepared-order confirmation accepts typed evidence instead of reparsing confirmation. Their business checks stay intact.

## Expected files

- New `src/agents/semantic_control.py` (compact evidence contract and namespace grounding).
- `tool_capabilities.py`, `tool_policy.py`, `llm_tool_orchestrator.py` (semantic tool boundary, policy and state-only exposure).
- `tool_artifacts.py`, `customer_flow_presentation.py` (typed recovery, compound completion).
- `agent_context.py` (minimal profile/focus reference projection if required).
- `order_management.py`, `src/function_calling/tools/knowledge_tools.py` (adapter seams only).
- Regression tests, shared scripted-provider fixture and this audit/report.

## Verification and safety

First run focused fake-provider boundary tests, then all ai-service/tests. Preserve old tests and distinguish obsolete raw-phrase contracts from real safety regressions. Add matrix coverage for products/menu/options/cart/voucher/fulfillment/payment/location/profile/branch/orders/RAG/confirmations/compound/social and malformed/unowned targets. Fakes supply semantic output independently of production language; no live provider calls.

No extra provider call. A small shared batch schema and semantic arguments add bounded protocol tokens; shorten duplicate system instructions to offset them, measure prompt/schema characters before/after. History/context and all configured provider budgets remain unchanged. Multi-action execution uses existing sequential tools and may incur only necessary existing business reads. No claim that syntax/tests prove real model language quality or absolute latency.

Safety invariants: server actor/auth, namespace and visible ownership, exact options, positive bounded quantity, exact current line, canonical price/stock/eligibility, wallet/payment capability, immutable geo coordinates, complete delivery address, inventory, owned order revision, later-turn confirmation, lock/fingerprint/expiry, operation ID/replay and uncertain-write reconciliation. Semantic evidence is untrusted and validated, never authority for a factual value or permission to skip a precondition.
