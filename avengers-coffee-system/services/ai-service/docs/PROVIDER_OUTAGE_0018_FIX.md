# Customer chatbot: timeout and safe retry, 2026-10-08

## Evidence from the reported conversation

Times below are Asia/Ho_Chi_Minh; Docker logged UTC on 2026-10-07.

| Time | Observed result |
| --- | --- |
| 00:18:12.612 | Gemini 3.5 Flash Lite request, 15-second attempt deadline |
| 00:18:27.618 | `ReadTimeout`; no proposal returned |
| 00:18:27.619 | Gemini 3.1 Flash Lite fallback, 14.993 seconds remaining |
| 00:18:42.631 | Second `ReadTimeout` |
| 00:18:42.642 | First turn ends after 30,735.51 ms: 2 attempts, 2 failures, 0 tool rounds, no business operations |
| 00:18:53.742 | Second turn: 0 outbound attempts, 8 configured routes skipped by model cooldown; 1,182.71 ms total |

This was a provider response timeout followed by local cooldown, before semantic interpretation or product-description retrieval could run. The second turn did not send another inference request. Logs contain no HTTP 400/protocol rejection for these two turns. They do not establish why the inference endpoint stalled or prove a global provider outage.

A read-only diagnostic without credentials found DNS resolving and the Google origin answering an unauthenticated HEAD with HTTP 404 in about 200 ms. This checks origin connectivity only; it does not qualify model inference availability. No inference, paid request, or customer key was used during this repair.

## Application changes

- Preserve Gemini-only configuration and ordered 3.5 → 3.1 models, existing bounded attempt deadlines, and shared model cooldowns. No `.env` or DataPlatform AI changes.
- Compute the earliest actual retry window across cooling eligible routes. Log `provider_outage_phase` (`inference_failed` or `cooldown`) and `retry_after_seconds`. The customer message now states an approximate wait; HTTP returns the public delay as well.
- Fix a separate application replay defect discovered offline: a cached provider outage formerly replayed forever for the same `client_message_id`. Only a server-proven failure before **any** tool execution can reopen after its retry deadline. Payload/ownership conflicts are still rejected. Completed business operations and uncertain outcomes cannot reopen.
- Reserve an expired retry atomically under the existing conversation row lock. Concurrent requests do not claim the same retry twice. Never use an old expired outage as completion evidence for an inference retry currently running. A newly persisted result can still reconcile a lost completion write.
- Keep the retry proof private while preserving it in durable replay metadata. No customer-language regex, product-specific fallback, invented recommendation, automatic checkout, credential rotation expansion, or additional provider was introduced.

The application can recover when a configured Gemini model responds again; it cannot manufacture a semantic answer while both configured models remain unavailable. This change does not establish that remote timeouts have ceased. Existing historical outage records without server proof stay closed; they can be followed by a new customer turn without rewriting stored history.

## Offline verification

Regression reproduction before the implementation: 6 failures. Focused provider/retry/HTTP group after repair: **89 passed**, 1 existing dependency warning, 2.49 seconds, Docker `--network none`.

Full `tests` suite: **2,863 passed, 1 skipped, 2 dependency warnings**, 18.99 seconds, Docker `--network none`. Log: `/private/tmp/chatbot-outage-full.log`. `git diff --check` passed.

New coverage includes exact overlapping cooldown delays, retry through both session and durable caches, same-ID successful replay, malformed/unknown/write-bearing retry-proof rejection, serialization of two concurrent claims, private proof sanitization, public HTTP delay, in-flight retry versus old outage cache, acquiring a retry during HTTP wait, and lost-completion-write reconciliation.

Live inference calls in this repair: **0**. OpenAI fallback remains disabled as explicitly requested. Earlier live qualification remains incomplete and is not upgraded by these offline checks.

## Runtime update

Built and recreated only `ai-service` using `docker compose up -d --no-deps ai-service`. Internal `/ai/health` returned HTTP 200, `llm_tools`, provider `gemini`, fallback allowlist `gemini`, and Redis available. Six production source files, including `main.py` and the new retry helper, exactly matched the workspace hashes. This verifies local application deployment and dependencies, not Gemini inference health. No customer chat request was sent for deployment verification.
