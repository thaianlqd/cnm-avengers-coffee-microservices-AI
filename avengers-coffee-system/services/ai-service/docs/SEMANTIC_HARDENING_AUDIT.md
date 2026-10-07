# In-progress protocol audit — 2026-10-07

Start: HEAD `9a0d4b46fa989e2d1e0471efd493004f2f77f434`, branch `branch_thaian`; both unstaged and staged diffs were empty. The unfinished hardening from the preceding session is committed in this HEAD and is retained. Scope is customer `ai-service`; no Data Platform edits.

## Actual production path

API authenticated session/turn → `agent_service.run_agent` (`llm_tools`) → `run_llm_tool_turn` → compact server context/state-only capabilities → one `customer_actions` surface → whole batch validation → commitment/current evidence → canonical grounding → selected business schema/policy → existing executor → full server artifacts and compact model projection → customer-flow renderer → validated final envelope → durable turn replay and compact memory.

| Component | Responsibility and remaining issue at handoff |
|---|---|
| API / run_agent | Actor/turn and mode; legacy parsers are outside the semantic production lane. |
| Orchestrator | Existing provider loop owns language. Prompt is dense; local tool contracts lost important purpose descriptions. Live model omitted evidence and fulfillment, and invented default authorization. |
| Capabilities | State-only tool visibility; reads can unlock entities within a batch. Individual executor schemas remain available for validation. |
| Semantic wire | Typed args; args_json migration retained. Shared union can generate fields belonging to the wrong selected tool. Whole shape validated before mutation, selected schema after grounding. Protocol errors already marked model_repair, but selected-schema/evidence/reference-kind errors are inconsistently classified. |
| Commitment / evidence | Writes need positive commitment and exact current span; final confirmations need AFFIRMED. Substring anchoring is temporal evidence, not independent language understanding. Default authorization currently shares generic selection evidence and needs a distinct semantic decision. |
| Grounding | Exact current server identities, frozen cart ordinals and stable pending indexes. LOCATION literal is distinct from PROFILE_ADDRESS and provider candidates. Unsupported reference kinds can wrongly look like customer ambiguity. |
| Option boundary | Declared aliases normalize before business validation. Required choices, options and defaults use Menu. Provider still sees both vocabularies; this increases output variation. |
| Batches / recovery | Stops dependent work on failed prerequisites and preserves earlier successes. Recovery needs a single targeted budget and an explicit committed-action fence, rather than relying only on argument signatures. |
| Read cache | Business revision and semantic selection/facet included; pure wrapper reads bypass outer write cache. Keep this. |
| Artifacts / presentation | Protocol repair must not become customer ambiguity. A selected-options milestone should return required choices immediately; otherwise model may proceed to defaults. Location precision should stop safely with the geo provider's actual missing-detail message. |
| Product / cart / voucher tools | Authoritative Menu, prices, stock, exact cart lines and fresh vouchers remain unchanged. |
| Fulfillment / geo / branch | Supplied-location avoids saved-profile offer. Missing fulfillment before checkout-location currently lacks targeted repair. Existing address completeness, immutable candidate coordinates, inventory and saved-offer later-turn gates remain. |
| Orders / confirmation | Owned IDs/revisions, prepare-confirm-discard, later-turn affirmation, fingerprint/expiry and uncertain-write reconciliation remain. |
| RAG / reviews | Static approved evidence and live review tools stay separate; facets and factual validation remain. |
| Memory | Compact identities/snapshots/history; no complete menu or database dump. |
| Provider | Existing bounded rounds/attempts and availability fallbacks; no extra classifier. Semantic repair must not rotate keys to seek a lucky answer. |

## Evidence already available

Deployed logs: `kich_co` was dropped while canonical `size` succeeded; new destination was grounded as PROFILE_ADDRESS. The initial semantic fixture suite accepted perfect proposals and missed these variants.

Previous isolated real-Gemini probe (synthetic business authorities, no real writes) failed: product selection generated defaults, option correction used unsupported CART_LINE/recent, and delivery omitted fulfillment. These are unresolved at this audit; no success claim. The prior broad run was 2,510 passed / 113 failed / 1 skipped; its 113 node IDs exactly matched the older `56706ba` baseline. A fresh HEAD baseline is required for this continuation.
