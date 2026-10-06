# Runtime provider failure — 2026-10-06

## Evidence

The existing Analytics API Docker log records three failed `propose-plan` requests at 04:06:18, 04:06:25 and 04:06:37 UTC. The web proxy forwarded all three requests and received HTTP 200. The API response body, however, has `status: error` and `error_category: provider_unavailable`.

The supplied response shows Gemini `gemini-3.5-flash-lite` and Groq `openai/gpt-oss-120b` both failed with `provider_http` in round 1. Semantic calls, analytical calls and DB query counts are all zero. This failure happens before natural-language decisions or SQL generation. Both provider keys are present in the running API container and offline mode is unset; key values were not printed. The old adapter did not record upstream HTTP status, so the original response cannot distinguish missing model, authentication, access, quota or service failures.

## Changes

- Record upstream HTTP status and distinguish 400/schema, 401/authentication, 403/access, 404/model and 429/rate-limit failures. Timeout and connection errors have separate categories. Log only provider/model/status/category/latency; never provider response text, request URL/key or exception text.
- Expose specific provider failures as service errors, rather than implying the analytical question itself could not be understood.
- Respect one configured alternative Gemini model after a first-model 404. Cap this recovery to two configured Gemini models; authentication/quota/schema/other failures go directly to Groq. Pin a successful model for subsequent rounds to preserve signed continuation. There are at most three transport attempts in the initial 404 recovery round; normal subsequent rounds use the pinned model or Groq. The configured model list is unchanged.
- Only a `status: success` report can show the green ready banner. Clear an old response when starting a new proposal. Errors and clarification responses cannot become a report shortcut.
- Label a failed operation “Chưa thể hoàn tất phân tích”, with the service-specific explanation.

## Validation / local runtime update

- Backend: **273/273**, 29.373 seconds, offline/mock transports.
- UI: **21/21**; ready-banner regression includes error, clarification, proposal and successful report responses.
- Frontend Vite build: PASS, 61 modules, 1.63 seconds.
- Scoped whitespace check: PASS, existing CRLF preserved.
- Backend regression verifies status-specific errors and absence of private response/key text in logs; tests first-model 404 recovery, bounded alternative selection and model pinning.
- Analytics API uses an `/app` mount and automatically reloaded the changed code. No explicit API/DB restart was performed.
- Built frontend assets were copied into the existing Analytics web container; index checksum matches the local build. Reload the browser to load the new bundle. Future container recreation must build from the updated source to retain the frontend change.
- The agent did not invoke a real model request for this verification. Existing user-initiated failures were inspected read-only. Live recovery still needs a user retry; the new Docker log will reveal upstream status if it fails again.

## Read the new failure log

```sh
docker logs --tail 100 avengers_analytics_api
```

Look for `Native provider failed ... http_status=... category=...`. HTTP 200 from `propose-plan` only means the API returned its structured response; success must be determined from the JSON `status`.

## Follow-up: confirmed authentication failure

The user's retry and Analytics API Docker log at 11:17:54–11:18:16 Asia/Saigon confirm **401 for both Gemini and Groq**, categorized `provider_auth`. No semantic tool or analytical SQL was invoked.

Read-only checks scoped to `analytics-api` confirm:

- Both keys are configured; offline mode is unset. No explicit HTTP/HTTPS proxy variable exists in the container.
- The running container's provider credentials match the currently rendered Compose service configuration. Neither shell variable overrides these provider keys. Recreating the container from that configuration would load the same credentials again.
- The Python provider module's credentials equal the container environment, with no whitespace/quote/assignment wrapper observed.
- A mocked comparison of V2.1 `call_bounded_llm` and V2.2 `NativeAgentProvider` verifies identical provider endpoints and authentication arguments for both providers. No external requests were made for that comparison.
- The current Gemini credential does not have the conventional `AIza` prefix. This is a configuration clue, not proof of why the upstream returned 401. The Groq credential has its conventional prefix, but that does not establish validity.

Recovery requires the user's valid provider credential/configuration source, or clarification of an intentional provider gateway that should replace the direct provider endpoints. No key was printed, invented, copied from another application or changed. No ordering-chatbot configuration was inspected. A successful provider-backed request is not yet verified.

## Dedicated Data Platform credentials — configured at user's request

The user subsequently supplied a separate provider set for Data Platform and explicitly required leaving the running chatbot's credentials intact. Setup now uses:

- `data-platform/.env`: Gemini/Groq/Anthropic keys and Gemini model list supplied by the user. The private file is ignored by Git and has mode 0600. Credential values are never included in this document or tracked example.
- `data-platform/.env.example`: empty-key setup template.
- `docker-compose.data.yml`: only `analytics-api` loads the dedicated env file. Its four shared provider-variable entries were removed from `environment`, since those entries would override `env_file` values.

Only `analytics-api` was recreated using `--no-deps --force-recreate`. It is running and healthy. All four provider variables in the new container match the dedicated file; the loaded Gemini/Groq Python variables match the container environment. Both Gemini and Groq credentials differ from the currently running chatbot's credentials.

Checksum/identity checks confirm the repository-root `.env`, chatbot Compose file, chatbot container identity and all three chatbot credentials remained unchanged. No chatbot container was restarted. No provider inference request was made by the agent; successful authentication of the newly separated credentials still needs the user's retry.

Future Data Platform credential edits go in `data-platform/.env`; nạp lại riêng API:

```sh
docker compose -f docker-compose.data.yml up -d --no-deps --force-recreate analytics-api
```

## Nginx 502 after API recreation — fixed

At 12:01:30–12:01:54 Asia/Saigon, Nginx reported `connect() failed (113: Host is unreachable)` for its cached upstream `172.20.0.10:8000`. The recreated, healthy Analytics API had address `172.20.0.9`. Nginx's previous literal-host proxy resolved the hostname at startup and retained the old address. This affected all API routes, including `propose-plan`; no provider request reached the API during those 502 failures.

`data-platform/web-ui/nginx.conf` now uses Docker DNS `127.0.0.11` with a 10-second cache, a variable upstream hostname and the original `$request_uri` (retaining the `/api/` path and query string). Future API IP changes are resolved without requiring a web restart.

Executed:

```sh
docker compose -f docker-compose.data.yml build web-ui
docker compose -f docker-compose.data.yml up -d --no-deps --force-recreate web-ui
```

Validation: 21/21 UI tests; local Vite build PASS (1.63 s); Docker frontend build PASS (1.99 s Vite build); running-container `nginx -t` PASS. Requests through Nginx now return HTTP 200 for `/api/ai/status?proxy_check=dns-refresh` and the expected FastAPI HTTP 405 for GET `/api/ai/propose-plan?proxy_check=read-only`, proving preserved path/query forwarding without executing inference or analytical SQL. The agent did not issue a POST to the model-backed endpoint. Chatbot container identity and credentials remain unchanged.

## Gemini-only follow-up

The user's 12:05 retry reached the API. Gemini returned **400** at 05:05:20 UTC; Groq subsequently returned **429** at 05:05:24 UTC. The old classifier treated every 400 as a schema error, so this evidence does not establish the underlying reason for Gemini's rejection. The displayed quota error was the fallback Groq error.

At the user's request, `data-platform/.env` now sets `AI_AGENT_GROQ_FALLBACK=0`. The native agent stays on Gemini; it cannot mask a Gemini failure with a Groq quota error. The supplied model order and credentials are unchanged. The existing one-alternative model recovery remains bounded and only applies to a missing/unsupported model, never to authentication, quota or generic schema failures.

Gemini wire tool schemas now declare the properties of `ask_clarification.known_query` and scalar/list types for filter values. Previously these came from Pydantic `dict` and `Any`, producing an object without properties and a value without a type. The clarification draft includes only the seven fields consumed by the existing parser, with no required draft fields. Server-side contract validation, catalog grounding and SQL validation are unchanged. Initial Gemini tool declarations measure 3,615 compact characters (not tokens); no full catalog or additional inference round is introduced. Per-attempt `tool_schema_chars` measures the actual Gemini wire declarations separately from the agent's logical schema budget.

HTTP error classification now distinguishes a Gemini 400 invalid/expired key from a schema failure using structured error reasons. Diagnostics/logs retain only fixed reason/status/keyword values; provider messages, arbitrary metadata and credentials are discarded. This also prevents unexpected nested JSON types from escaping into diagnostics.

Validation: full backend suite **276/276**, 25.008 s, then **4/4** focused tests after the additional malformed-error-body guard/regression. All transports are mocked. The Analytics API image is rebuilt and the API container recreated to load the Gemini-only policy. The frontend had already been rebuilt for the preceding Nginx fix and needs no additional code change here. Live Gemini recovery requires the user's retry; no real model call was made by the agent.

### 12:45–12:46 retry: root cause remains unclassified

The user's next retry still returned Gemini HTTP 400 / `INVALID_ARGUMENT` in round 1, with no semantic, analytical or SQL calls. The log contained no recognized error reason or schema keyword. Therefore the earlier wire-schema correction is not evidence that the current rejection is a schema problem.

Unclassified HTTP 400 now maps to `provider_bad_request`, with a generic provider-service explanation. Only a recognized schema/continuation error maps to `provider_schema_invalid`; recognized key/model errors retain their specific categories. Four focused offline regressions pass (0.374 s). The original request explicitly prohibits real Gemini calls, so a bounded diagnostic request requires the user's authorization before execution. No direct provider request has been made by the agent at this point.

## Read-only chatbot configuration comparison — Data Platform change only

The user explicitly authorized reading the chatbot provider configuration without changing its logic. Its transport uses Google's `/v1beta/openai/chat/completions` endpoint, `Authorization: Bearer ...`, OpenAI-compatible native function calls and `max_tokens`, without forcing JSON response format. Its default model is `gemini-3.6-flash`; a read-only environment check confirmed the running chatbot's standard model pool is `gemini-3.6-flash` with no single-model override. The Analytics transport previously used `/v1beta/models/{model}:generateContent` with a query-string key and `gemini-3.5-flash-lite`. These are observed configuration differences, not proof of which caused the prior rejection.

Data Platform now has a selectable `GEMINI_API_STYLE=openai` transport and its dedicated `.env` selects `GEMINI_MODELS=gemini-3.6-flash`. `AI_AGENT_GROQ_FALLBACK=0` remains set. None of its four provider keys changed, and no chatbot key was copied. `native` remains available for the existing direct Gemini adapter. Unknown API styles fail before a transport request.

The compatible adapter still uses native `tool_calls`; it does not parse analytical decisions from prose. It preserves each original function-argument string and only Google's opaque `extra_content.google.thought_signature` for subsequent Gemini inference. Signatures, arbitrary extra content and thought/reasoning text do not enter normalized calls, public reports, diagnostics or Groq history. Reset clears the private continuation state. The compiler, semantic catalog, SQL/result validation and analytical loop are unchanged. Actual Gemini token usage comes from OpenAI-compatible `usage` fields; each attempt exposes `api_style` and actual wire tool-schema size.

Backend validation: **280/280** full offline tests (25.100 s), plus the new array-shaped Google error regression **1/1** (0.028 s). Coverage includes endpoint/Bearer/model request shape, exact signed continuation, Gemini-only failure handling and an end-to-end mocked two-round grounded report with one validated executor call and no leaked signatures. The Google-compatible array error envelope is classified safely without retaining provider prose.

Only the Analytics API image is rebuilt/container recreated to load this configuration. Checksums confirm the three referenced chatbot transport/configuration files, root `.env` and chatbot Compose file are unchanged. The agent has not executed a real Gemini request; successful live recovery is still to be established by a user retry.

### Subsequent live probes authorized by the user

The user retried the new adapter and it still returned 400 / `INVALID_ARGUMENT` (06:17:54 UTC). They then explicitly allowed live API testing. Automatic approval review rejected a diagnostic payload containing the application's system prompt and internal schemas: that export was not explicit in the permission for a small probe. That rejected command sent no request. Three safer probes containing only generic public text/schema were run instead, with no database access or chatbot invocation:

1. `Reply OK.`, output cap 8: **HTTP 200**. Reported usage: prompt 4, completion 0, total 9.
2. `return_result(value: string)`, `tool_choice=required`, output cap 64: **HTTP 503 / UNAVAILABLE**, with Google's temporary high-demand message. No usage was returned.
3. `return_result(value: string | null)`, `tool_choice=required`, output cap 64: **HTTP 200**, native function call present. Reported usage: prompt 61, completion 16, total 132.

Thus the dedicated Gemini credential/model and simple function calling including nullable `anyOf` are live-verified. This does not establish that the application system/schema payload is accepted or identify the cause of its 400. No further real request is made under the three-probe authorization. Permission for one exact application-payload diagnostic was requested separately; the underlying application failure remains unresolved until that payload can be inspected or the user supplies its provider error.

The user then explicitly authorized **one** full application-payload diagnostic. With the current system instruction, three initial tools, a sample question and output cap 64, Gemini returned **400 / INVALID_ARGUMENT**, with the exact safe error `Request contains an invalid argument.` It gave no field-level explanation. No DB query was executed. The four authorized real requests are now used; additional direct calls need fresh authorization.

The next compatibility change reduces the Gemini wire schema to structural/type/enum/required/item/union/description fields, omitting validation-dialect keywords such as regex, length and numeric bounds. Dates retain an explicit ISO-date description. Logical contracts and all server validation retain the original restrictions. This is a compatibility hypothesis, not a proven explanation of the generic rejection. Tests verify that source schemas are not mutated and the server still rejects excessive query length/limit and extra SQL fields. All **164/164** agent tests pass (18.535 s). Initial OpenAI-compatible tool declarations shrink from 3,678 to 3,068 compact characters. Live acceptance of this revision remains unverified.

### Successful live confirmation of the reduced schema

After reviewing the built/deployed revision, the user explicitly authorized **one additional confirmation request** using the same system instruction, initial three tools, sample question and output cap 64. This request returned **HTTP 200** with a valid native function call. `NativeAgentProvider` classified it `success` using `gemini-3.6-flash` / `api_style=openai`, with 3,068 wire tool-schema characters and 3,130.94 ms latency. Google reported prompt tokens 1,270, completion tokens 20 and total tokens 1,364; these are reported values, not inferred token totals.

The before/after full-payload probes verify that the reduced wire schema is accepted where the preceding schema was rejected. Google's generic 400 did not identify an individual offending validation keyword, so no single keyword is claimed as the proven cause. No warehouse data or SQL was involved in either probe. The real-provider authorization totals **five requests** (three generic probes, one original application-schema diagnostic and one reduced-schema confirmation), and no further model request is made. Live Gemini transport/function-call acceptance is verified; a complete warehouse-backed plan/report remains a separate user UI evaluation. Offline full-pipeline grounding/validation/report tests continue to pass.

## 13:32 retry: successful Gemini calls exhaust discovery rounds

The supplied response and API log at 06:32:03 UTC show `agent_budget`: all six Gemini `gemini-3.6-flash` OpenAI-compatible calls succeeded, but there were six semantic calls and no analytical calls or queries. Historical diagnostics did not record tool names, so the exact discovery sequence cannot be reconstructed. This is distinct from the resolved first-round HTTP 400 rejection.

Changes for this failure:

- Semantic search now returns bounded, physically validated business summaries including metric subject, grain, compatible dimension IDs, unit and business filters. It reuses the existing description projection, with at most six items per paged field. Expressions, physical names, joins and SQL remain excluded.
- Enum dimension descriptions include at most eight authoritative canonical values and an explicit completeness flag. Lookup dimensions do not expose row values or trigger a row lookup during discovery. Server-side value validation still applies.
- The prompt permits directly using returned canonical values, asks the model to batch independent discoveries, and discourages describing information already returned by search. The initial request states the round/tool budget; tool results state remaining rounds and registered query count. The default six-round budget is unchanged.
- A bounded diagnostic tool trace logs only whitelisted tool name/status, round, cache hit and registered query count. It contains no arguments, enum values, query text or provider signatures. Budget failures now explain that the allowed processing rounds were exhausted.

Validation: **284/284 backend tests**, 26.313 seconds, offline transports. The new three-round city comparison proposal test registers a validated query and finishes without analytical SQL or row lookups. Discovery tests check semantic grounding, pagination, projection size and enum caps; the repeated-discovery regression checks cache trace and the explicit budget error. Scripted provider tests verify orchestration, not Gemini language quality. No additional live provider request has been made for this follow-up; the five previously authorized requests were already consumed.

Runtime update: rebuilt the Analytics API image and recreated only `analytics-api` with `--no-deps --force-recreate`. The API is running and healthy; a read-only GET through the web proxy returns valid JSON. The AI status endpoint reports `unavailable` immediately after recreation because its metadata cache has not yet been loaded; this endpoint does not test Gemini. Repository-root env and chatbot Compose/transport hashes and chatbot container identity all match the isolation baseline. Backend whitespace check passes; pre-existing CRLF lines in frontend/Compose were preserved.

## 13:45 retry: Gemini upstream 503

The rebuilt API was active. At 06:45:28 and 06:45:40 UTC, the user's requests received Gemini HTTP 503 with structured status `UNAVAILABLE` in round one, before semantic tools. These are upstream temporary failures, distinct from the earlier six successful discovery rounds exhausting the agent budget.

The transport now retries exactly once after 0.5 seconds on Gemini HTTP 503, using the same model, endpoint and signed continuation. Recovery is bounded once per logical round, across any configured missing-model recovery; all HTTP attempts remain visible in diagnostics. It does not retry schema/auth/quota failures, add analytical executions or increase the six logical rounds. The current deployment remains Gemini-only. A provider outage can still outlast this bounded retry.

Backend **286/286**, 26.585 seconds, offline. Native and OpenAI-compatible continuation regressions verify identical request payloads for recovery and signature privacy; persistent 503 is capped at two requests, and 400/401/429/500 are not retried. The unrelated fallback test uses HTTP 500 to isolate its behavior.

The input header previously displayed a hardcoded green “Hệ thống AI sẵn sàng” regardless of provider state. It now says “Sẵn sàng nhận câu hỏi” in blue, or “Phân tích đang gặp lỗi” in amber after an error; it no longer claims verified provider health.

Rebuilt and recreated only `analytics-api` and `web-ui`, with `--no-deps`. API health is healthy. Frontend Vite build passes (1.39 s local, 2.35 s Docker), and 11/11 AI agent frontend tests pass. A proposal contract check inside the new API container using actual local database schema metadata and a scripted provider returns `proposal_ready` in three rounds, with zero analytical queries, zero row lookups and zero provider HTTP requests. This confirms compilation against current metadata; it does not verify Gemini's decisions or upstream availability. Live bounded-plan validation remains pending the user's new permission.

## Live confirmation and requested model order

User authorized one bounded plan validation up to six HTTP requests, 1,024 output tokens each, with system/tool definitions and projected semantic summaries, no warehouse rows, analytical SQL or row lookup. Four requests were used: Gemini 503, same-model retry success (1,403 input/43 output tokens, two semantic searches), next round 429, then confirmation 429. The structured quota failure reports **20 requests per day** and retry delay **61,603 seconds**. This confirms a daily request cap, not a token limit. Complete live proposal validation remains blocked by provider quota. No additional live request was made.

Daily quota failures now preserve only fixed quota unit/window, bounded numeric limit and retry delay; provider prose, project IDs and arbitrary quota names remain private. HTTP error messages distinguish daily quota and show the supplied request limit and waiting time. Offline suite before model-order change: 288/288, 25.976 seconds.

At the user's subsequent request, dedicated Data Platform env/example now configure `gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash`, in that order. Initial selection tries up to these three configured models on explicit daily quota or 404 only. After a model succeeds, signed continuation remains pinned; a later quota failure is reported rather than replayed on another model. Groq fallback remains disabled. Credentials are unchanged; no chatbot configuration was changed. Availability or a larger quota for these model names has not been verified with new provider requests.
