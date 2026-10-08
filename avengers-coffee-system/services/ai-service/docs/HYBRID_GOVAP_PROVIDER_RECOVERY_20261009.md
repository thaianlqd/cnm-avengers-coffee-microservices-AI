# Gò Vấp demo: provider outages and compound fulfillment repair

## Runtime evidence

The customer's October 9, 2026 messages at 00:07–00:13 ICT were traced in the local AI logs. The two unsuccessful interpretations made **zero business operations**, rather than failing Menu or branch grounding:

- 00:07: Gemini 3.5 Flash Lite hit its 15-second transport timeout; Gemini 3.1 Flash Lite returned HTTP 503. Result: PROVIDER_UNAVAILABLE/provider_transient, two attempts and zero tools.
- 00:09: the primary timed out again, then the secondary successfully interpreted SET_FULFILLMENT plus READ_STORE_INFO. Both business operations succeeded. The profile-address offer was emitted because the orchestrator recognized only PROVIDE_LOCATION as an already supplied location, overlooking the adjacent area-scoped store list.
- 00:10: primary timeout followed by secondary 503; zero tools. The immediately repeated turn then made zero provider attempts because both models were still cooling. Its generic “try again” reply hid the actual condition.
- 00:12–00:13: the secondary succeeded after another primary timeout. SELECT_BRANCH and DISCOVER_PRODUCTS both completed correctly. The branch acknowledgment asked the customer to browse a menu despite the already requested coffee-family search. The result also reported 2/5 matches although the customer had not asked for five products.

Runtime settings were inspected using a non-secret whitelist: preferred provider Gemini, no explicit model override, standard pool gemini-3.5-flash-lite/gemini-3.1-flash-lite, permitted fallback provider Gemini only. No provider/key configuration was changed.

## Repairs

A successful same-provider model fallback after a model-wide timeout/5xx is temporarily prioritized for subsequent turns. The default recovery window is 180 seconds, configurable within 30–300 seconds. Healthy turns do not perpetually extend it. Expiry restores configured priority, failure clears the hint, explicit model overrides remain authoritative, and pinned semantic repair takes precedence. The hint stores provider/model/expiry, never credentials or customer content. It does not add requests, change providers, increase timeout/attempt limits, sleep, or replay business operations.

Hybrid now distinguishes provider unavailability from interpretation errors in the customer answer and presents the scheduler's retry delay. For known timeout/503 failures with no tool execution, no write started and no checkout artifact, it records the existing server-owned retry proof. The same message ID can recover after this delay through the existing durable HTTP claim/replay protection. Before expiry, completed failures remain replayable. Successful, partially executed and uncertain turns are not reopened. Provider outages receive a separate diagnostics counter.

Explicit area-scoped store reads, branch choices and profile-address choices in a compound fulfillment turn count as supplied location evidence. This suppresses unnecessary saved-profile offers. Generic fulfillment without supplied location keeps its established profile offer. Confirmed pickup/dine-in branch selection also clears a superseded profile-origin question, while preserving unrelated pending owners and delivery-address requirements.

Branch selection followed by product discovery receives a concise acknowledgment before the requested products. An implicit server page limit no longer appears as a customer-requested count; explicit N-item requests still report genuine shortfalls. No product variant is guessed or automatically selected.

## Verification and deployment

The complete network-disabled AI suite passed: **5,952 passed, 1 existing skipped, 2 dependency warnings, 35.26 seconds**. Added scripted regressions cover timeout/503 messages, exact all-cooling retry delay without another request, same-ID failure recovery and replay fences, explicit area with dine-in/pickup, retained generic profile offers, compound branch/coffee browse, count presentation, fallback preference expiry, failure recovery, explicit overrides and repair-route pins. Existing provider-expiry tests now assert both short circuit expiry and the longer finite healthy-recovery window.

These tests used synthetic keys and mocked transports. No live LLM/API requests were made with the user's keys. Read-only inspection of actual Gò Vấp stores/product evidence and final deployed source/health verification are recorded below. External timeouts/503 responses can still occur when all configured models are unavailable; the repair improves recovery and explains that condition rather than claiming guaranteed provider availability.

Only AI-service is rebuilt/recreated. No frontend, DataPlatform, Order-service, credential, database record or customer session is changed by deployment. Existing uncommitted work remains intact. No commit/reset/staging/orphan removal is performed.

Final deployed verification:

- /avengers_ai_service 9e645afd189a386c6d8f4bbdf3bbeb3bb2996770038c6beac6fc9c87d3d7a956 sha256:ec4f15824ad76bb6cbd15416e785910a57de90db9135c97f159d70e499b7f640 2026-10-08T17:21:49.128885554Z
- /avengers_web_customer c7fe71fb49cd7e0a39b1a475659c1a3a8840ef6fba722eeb8fcacee91cbc5dbb sha256:9e6443a01ede83effc837af1be57a44d79364c98f526fadf66aaeaa09b0339e4 2026-10-08T16:57:41.655942426Z
- /avengers_analytics_api 59d6c8748227fc9a53e69771a5c446bc227e15c0b522b9a34b45cdaee93b2f96 sha256:7395b8df111952f7c95e51c3cc562a6fffba53ddaeb6485f8fab24d1e297a7f1 2026-10-08T15:42:28.334141712Z
- /avengers_order_service d24bcff99b9431b9e452801e23a5eaebe5c79389140e76b1c034cee0ba93b95c sha256:53e3e4feb942102fb67cec9557460692bcb2224a5d265dcef9df7b15e3bed64c 2026-10-08T14:55:46.438730346Z

AI health returned HTTP 200, status ok, Hybrid commerce mode and Redis available. All 30 changed/new AI source files matched their tested host hashes. Actual area lookup returned the three recorded active Gò Vấp branches, and actual Menu search returned Cà Phê Sữa Đá and Cà Phê Sữa Nóng at 39,000 VND each. These provider reads made zero LLM requests and no customer cart/order writes. Only the AI container ID changed; all 21 prior DataPlatform hashes remained unchanged. `git diff --check` passed.
