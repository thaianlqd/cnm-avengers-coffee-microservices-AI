# Chatbot shopping and address fixes — 2026-10-06

Scope: `services/ai-service`, its Gemini settings in root `.env` / `.env.example`, and the AI service environment block in `docker-compose.yml`. No Data Platform source, settings or containers are changed.

## Evidence

Read the supplied conversation and the existing `avengers_ai_service` logs. Logs around 14:18–14:20 Vietnam time show `add_to_cart` denied with `product_choice_required`; a request used 63 output tokens, below the unchanged 600-token cap. Later location selection reports `unknown_location_candidate`. These are evidence of selection/state failures; they do not establish a token-limit cause. No new model/API requests were used for diagnosis.

## Changes

- General menu requests read actual sellable Menu categories. Number/name selection filters products by the category's canonical ID.
- Product descriptions retain numbered bold names and the displayed price, with descriptions bound to each canonical entity.
- Preserve the last displayed drink/food lists separately so `nước số 1` survives an intervening cake list.
- Parse a quantity before each labelled ordinal, including `1 bánh số 1 và 1 bánh số 2`.
- Save selected products and their own option schemas as pending drafts. Show all selected products and accept separate option clauses for multiple products in one turn. Every optional group remains visible when size is still missing. Omitted optional fields follow Menu defaults; no prior cart options are copied.
- Remove only the requested unit count for `bỏ 1 ly số 1`; deleting the whole line still requires all its units or a whole-line request.
- For a request for another item, exclude current cart and current suggested product IDs before numbering recommendations.
- Numbered location choices use persisted provider candidates and immutable coordinates. Rejected-but-relevant map suggestions are preserved. Redis fallback assigns the same canonical candidate IDs.
- Recognize alphanumeric house numbers such as `MM18`, building-prefixed street addresses, and administrative abbreviations including `TPHCM`. Missing address components reach the normal clarification path rather than being mistaken for a saved address.
- An explicit apply directive selects a single previously offered voucher. A retrospective correction for a product already in the cart does not add a duplicate matching configuration.

Gemini tiers now try `gemini-3.5-flash-lite` before `gemini-3.1-flash-lite`. Local explicit `AI_AGENT_MODEL` is cleared so it does not override this ordered pool. One existing attempt and part of the existing round deadline are reserved for a later configured model; attempt, timeout and token limit values are unchanged. Other provider defaults are preserved.

Model IDs verified against Google's documentation:
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite

## Validation boundary

Per customer instruction: no pytest, simulations, E2E, provider qualification, benchmarks, or chat calls. Only static Python syntax parsing and `git diff --check` are performed. Building/recreating only `ai-service` applies the patch; it does not establish conversational acceptance. Existing cart contents and existing conversations are not reset.

Deployment: rebuilt/recreated only `ai-service` with `--no-deps`. Startup completed successfully; Gemini uses tier policy and Redis is available. No conversational/runtime acceptance test was performed.

## Follow-up: product-scoped options

Existing container logs at 08:50:15 UTC (15:50 Vietnam time) show a successful direct `add_to_cart`, with zero provider attempts and zero model tokens. The direct handler introduced in the earlier fix read the entire multi-product option message for the first staged product. Logs around 08:53:53 then show `update_cart_item` returning `invalid_option` for the customer's correction question. This was a server-side scoping error.

- Resolve each clause against canonical product names and the staged selection numbers before reading any option values. Preserve topping-list commas/conjunctions within each clause; never split on every `và`.
- Apply the same scoped message in both the direct handler and guarded tool gateway: option evidence, defaults, topping validation and quantities cannot leak across products even when the model proposes a tool call.
- Validate all addressed pending products before writing the first cart line. If any requires clarification, retain valid configurations in their own drafts and report that this turn has not added the batch.
- Persist stable `selection_index` values and expose them in model context and pending prompts. Removing the first pending product does not renumber the next one.
- An explicit whole-product default resets that product's earlier choices using Menu metadata. Optional paid toppings remain empty by default. No product, topping label or price is hardcoded.
- Questions cannot authorize add/update/remove operations. Ambiguous, repeated or unavailable staged references request clarification instead of assigning the entire sentence to the first product. The ambiguity status also ends the model tool step.
- Log scope counts and ambiguity flags without recording the customer's full option text.

The original token limits and Gemini 3.5 Flash Lite → 3.1 Flash Lite order are unchanged. No existing cart or conversation is manually rewritten. Validation remains static syntax parsing and diff checks; no tests or chat/API calls are run.

Follow-up deployment: `docker compose up -d --build --no-deps ai-service` recreated only `avengers_ai_service` at 16:38 Vietnam time. Startup completed at 09:38:36 UTC with `agent_provider=gemini`, `agent_model=tier_policy`, and Redis available. Static syntax parsing passed for the six changed Python modules, and `git diff --check` passed. These checks do not establish conversational acceptance.
