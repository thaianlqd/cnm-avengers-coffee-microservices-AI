# Chatbot shopping and address fixes — 2026-10-06

Scope: `services/ai-service`, its Gemini settings in root `.env` / `.env.example`, and the AI service environment block in `docker-compose.yml`. No Data Platform source, settings or containers are changed.

## Evidence

Read the supplied conversation and the existing `avengers_ai_service` logs. Logs around 14:18–14:20 Vietnam time show `add_to_cart` denied with `product_choice_required`; a request used 63 output tokens, below the unchanged 600-token cap. Later location selection reports `unknown_location_candidate`. These are evidence of selection/state failures; they do not establish a token-limit cause. No new model/API requests were used for diagnosis.

## Changes

- General menu requests read actual sellable Menu categories. Number/name selection filters products by the category's canonical ID.
- Product descriptions retain numbered bold names and the displayed price, with descriptions bound to each canonical entity.
- Preserve the last displayed drink/food lists separately so `nước số 1` survives an intervening cake list.
- Parse a quantity before each labelled ordinal, including `1 bánh số 1 và 1 bánh số 2`.
- Save selected products and their own option schemas as pending drafts. Show all selected products; configure one at a time. Every optional group remains visible when size is still missing. Omitted optional fields follow Menu defaults; no prior cart options are copied.
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
