# Customer chatbot semantic state hardening — 2026-10-07 to 2026-10-08

**Offline regression gate: GREEN. Live qualification: NOT QUALIFIED / incomplete.**
The source fixes were tested offline and deployed only to `ai-service`.
The initial real-model run consumed 24 calls; the user then explicitly approved
up to 16 additional calls. That additional run stopped after **3** sends because
of two consecutive provider failures. A subsequent canonical-choice safeguard
was tested offline only. There has been **no complete real Gemini qualification
of the final source**. Do not interpret the
offline result or healthy container as end-to-end live acceptance.

## Reference and scope

- Branch: `branch_thaian`.
- CURRENT_HEAD before edits and final HEAD: `af720274c48d2aeea49b02d0820d13662114dfc1` (`test chatbot cap nhat`). Changes remain in the working tree; no commit created.
- Historical comparison anchor: `460e8abd01f0c186ab98bee1c304b7f9e2dd288d`. Used for inspection only. No checkout/reset/rebase/revert/cherry-pick performed.
- Phase 0 inspected status, branch, HEAD, recent history, migration diffs, relevant semantic/legacy/business/RAG code and existing regression suites before editing. The root-cause table was also shown to the user before edits.
- Customer chatbot only. No changed paths under `data-platform/`.
- Existing local provider resilience changes were retained, including `.env.example`, `docker-compose.yml`, `agent_provider_policy.py`, provider-loop compatibility, provider tests and `PROVIDER_RESILIENCE_FIX.md`. These are not all new changes from this hardening task.
- No credentials, auth headers or provider thought signatures in the attached qualification artifacts. Messages, products, addresses, sessions and writes in live qualification are isolated fictional fixtures. Gemini alone was real.

## Root causes

| Symptom | Model understanding | Contract / grounding | Orchestration / business / retrieval | Server boundary owning fix |
|---|---|---|---|---|
| A: remove + quantity update becomes only remove | Partial/correct initial intent, malformed first args | Redundant identity/schema representation; ordinals must be frozen | Repair replaced the batch and erased pending siblings | Server action journal; bind original cart IDs before any mutation; repair one slot |
| B: destination request commits payment | Fulfillment understood; payment overfilled | One quotation previously authorized all combined args | Combined checkout setter accepted payment along with delivery | Separate fulfillment/payment tools, closed selected-tool schemas, current PAYMENT reference and choice evidence |
| C: selected map candidate becomes another address | Candidate ordinal correctly understood and grounded | Correct provider candidate was transient | Legacy location confirmation adapter vetoed semantic selection; later profile continuation could replace destination | Persist immutable destination; exact coordinates to branch provider; refuse profile overwrite and summary drift |
| D: needs/taste returns not_found | Preference intent understood | Approved corpus contained descriptions | Long-description/title TF-IDF cosine diluted short concepts below threshold | Content-only concept coverage, approved evidence and current Menu validation |
| Live: root `messages` extra loses update during repair | Two intents present in initial proposal | Root schema correctly rejected extras | Rejection occurred before journal creation; repaired one-action batch became the whole request | Reject root/no writes, but stage bounded proposals and retain siblings internally |
| Live: flat quantity / metadata inside args churn | Correct three cart targets / defaults intent | Wrong wire placement | Repeated repairs exhausted a turn | Mechanical typed normalization, conflict rejection, then real selected-tool schema validation |
| Live: actions placed in prose JSON | Typed intents present, success claims unexecuted | Wrong transport envelope | Ordinary response repair had no retained plan | Stage only, ignore prose success claims, request bounded tool repair |
| Live: ready address shows branch choices again | Destination correct | Provider returned branch alternatives | Presentation preferred alternatives over next missing payment | Hide alternatives after server confirms delivery branch; ask next missing requirement |

## Architecture before / after

Before: a model batch was dispatched directly; subsequent repair could replace
that batch. A compound setter could carry unrelated checkout choices. A map
selection passed through conversational legacy adapters and lacked an immutable
checkout destination binding.

After: structured proposal → bounded server journal → canonical grounding →
selected-tool schema and commitment/evidence checks → guarded business tools →
authoritative state/result → deterministic customer presentation.

`SemanticPlan` generates a plan ID and action IDs, original indexes,
conservative dependencies and PENDING/EXECUTING/SUCCEEDED/ALREADY_PROCESSED/
NEEDS_REPAIR/BLOCKED states. Model IDs are not execution authority. Every cart
target binds to the authoritative **entry** snapshot before writes. Repair
replaces only the failed slot and preserves bound identity, successes and
unexecuted siblings. Successful writes are not replayed. Same-target legitimate
pending patches take precedence over duplicate-replay filtering.

Invalid roots still fail closed. Their bounded action list may be stored as
unexecuted intent, but no writes occur until a strict tool repair. Malformed
action JSON also retains siblings. Misplaced actions inside final JSON are
staged only; unverified prose and mutation claims are discarded. Repairs remain
bounded. An exhausted repair or business clarification retains partial state
and presents unresolved work rather than claiming full completion.

Wire normalization moves declared action metadata to its owning action and
maps selected `update_cart_item` flat patch fields to `desired_state`. It never
guesses language meaning, IDs, options, payment or defaults evidence. Conflicting
representations are rejected. Irrelevant business args and invalid values,
including zero remove quantity, are still rejected by the selected tool's actual
schema. A valid positive remove quantity retains its existing unit-removal meaning.

The model-facing surface excludes combined `set_checkout_choices` and exposes
closed one-field `set_fulfillment_choice` / `set_payment_choice` contracts.
Facet ownership follows the dedicated tool; explicitly conflicting facets fail.
Named payment must ground to canonical supported options and quote the named
choice in current evidence. Ordinals require the displayed PAYMENT owner.
If fulfillment evidence quotes a literal canonical business choice label, its
enum must agree; a different enum is refused, never silently corrected. This
uses the supplied choice inventory, not a customer-language phrase table.
Generic acknowledgments require a unique prior pending choice; delivery evidence
does not establish a payment choice. Wallet eligibility is checked separately.

Selected delivery candidates persist canonical identity/provider reference,
address, finite provider coordinates, source and fingerprint. Obsolete offers
and candidate snapshots are cleared; profile reads cannot replace the confirmed
destination. Branch resolution uses that exact candidate. Address/coordinate
drift refuses summary/confirmation; returned summaries must match the confirmed
address. Missing payment is asked for after destination/branch readiness.

Confirmation fingerprints bind owned cart-line identities, quantities/options,
branch, fulfillment, payment, destination, voucher and totals. Individual quoted
line prices/options are also compared with a fresh quote, catching offsetting
price changes even when the total stays equal. Later-turn explicit confirmation,
ownership, expiry, fresh stock/price/voucher checks and idempotency remain.

## Payment assignment audit

Global searches found these assignment classes:

| Location | Classification |
|---|---|
| `tool_policy._set_payment_choice` → internal setter | Explicit current semantic choice with PAYMENT grounding/evidence; no fulfillment fields accepted |
| `cart_manager.set_checkout_prefs`, cart/session restore | Storage/restored authoritative state; not an implicit choice |
| `cart_tools.execute_request_checkout` | Explicit internal argument or existing prefs; missing method refuses checkout |
| `cart_tools` wallet invalidation, `order_flow_graph` resets | Clears choices; does not choose a default |
| `agent_service._explicit_checkout_choices` | Legacy parser only; semantic lane does not use it as choice authority |
| `groq_service` legacy intent prompt | Legacy declaration surface, not the semantic execution path |

No new COD fallback was added. The combined internal setter remains for legacy
callers and is denied as a semantic operation.

## Retrieval diagnostic

See [SEMANTIC_DESCRIPTION_DIAGNOSTIC.json](SEMANTIC_DESCRIPTION_DIAGNOSTIC.json).
The saved public approved-description export has **117** accepted records and
**0** additional rejected records in the diagnostic input. An earlier ingestion
inspection reported one malformed source record before that approved export;
these are distinct counts.

The original long weather query's highest legacy score was approximately
**0.1315**, below the unchanged **0.30** threshold. Even short concepts were
diluted by long documents and repeated title terms. Concepts from the existing
semantic model call (`mát lạnh`, `ngọt nhẹ`) now score content evidence separately.
Unknown query terms stay in the coverage denominator; every requested concept
needs at least 0.5 lexical coverage. Ranking combines coverage and content word
cosine; generic word/character RAG remains unchanged. No taste phrase/synonym
table was added, no bestseller fallback, and threshold was not lowered.

The top evidence candidates 54/58/57/56 scored 0.8339/0.8248/0.8244/0.8239 with
coverage `[1,1]`. These are **description candidates**, not an assertion that
each is currently active/available. Runtime revalidates IDs, category, price and
active membership through Menu before presentation. Title-only taste, inactive
products, unrelated hot/bitter descriptions and unknown concepts are covered by
regressions. Lexically distant synonyms may still return honest not_found.

## Changed files

New production modules:

- `src/agents/semantic_plan.py`: execution continuity and stable internal IDs.
- `src/agents/confirmed_destination.py`: canonical destination fingerprint/drift.

Changed production modules in this task:

- `src/agents/tool_policy.py`, `semantic_control.py`, `tool_capabilities.py`: journal, frozen targets, split authorization, location persistence, bounded repair.
- `src/agents/agent_context.py`, `agent_memory.py`: authoritative location snapshot/state projection and provider identity retention.
- `src/agents/agent_service.py`, `order_flow_graph.py`: server-authorized semantic bridge, candidate snapshot and no duplicate checkout promotion.
- `src/agents/llm_tool_orchestrator.py`, `tool_artifacts.py`, `customer_flow_presentation.py`: staging callback, bounded completion, partial work and next missing requirement.
- `src/common/groq_service.py`: optional semantic staging/repair completion, preserving existing provider resilience and legacy behavior.
- `src/common/cart_manager.py`, `src/function_calling/tools/cart_tools.py`: identity/destination/quote confirmation binding and drift refusal.
- `src/function_calling/tools/branch_tools.py`: canonical resolved destination return.
- `src/function_calling/tools/product_tools.py`, `description_recommendations.py`, `src/rag/rag_service.py`, `retrievers.py`: approved compositional retrieval and current Menu validation.

New diagnostics/qualification scripts: `scripts/diagnose_description_retrieval.py`,
`qualification_transport.py`, `qualify_semantic_state.py`.

New tests: `test_semantic_state_hardening.py`, `test_qualification_transport.py`,
`test_qualification_harness.py`. Existing semantic, provider-wire, description,
checkout and inventory tests were extended/migrated to the split surface. No
tests were deleted or newly skipped to obtain green. Pre-existing provider
resilience test edits remain in the working diff.

## Deterministic validation

All Docker test runs used `--network none` and in-memory/fake service/provider
authorities. No Gemini sends in offline runs.

Common command prefix from repository root:

```sh
docker run --rm --network none \
  -v "$PWD/avengers-coffee-system:/repo/avengers-coffee-system" \
  -v "$PWD/docker-compose.yml:/repo/docker-compose.yml:ro" \
  -v "$PWD/.env.example:/repo/.env.example:ro" \
  -w /repo/avengers-coffee-system/services/ai-service \
  cnm-avengers-coffee-microservices-ai-ai-service:latest \
  python -m pytest tests -q --tb=short
```

| Run | Passed | Failed | Skipped | Duration |
|---|---:|---:|---:|---:|
| Actual current baseline before edits | 2788 | 0 | 1 | 17.08s |
| Initial new state reproduction | 8 | 13 | 0 | 0.50s |
| Offline gate immediately before live qualification | 2841 | 0 | 1 | 17.61s |
| Added live-failure regressions before follow-up fixes | 33 | 4 | 0 | 0.60s |
| Focused serializer/state/harness after follow-up fixes | 83 | 0 | 0 | 2.13s |
| Complete suite before supplemental run | 2850 | 0 | 1 | 22.77s |
| Supplemental canonical-choice/budget/state focused gate | 193 | 0 | 0 | 2.83s |
| **Final complete suite after supplemental fixes** | **2852** | **0** | **1** | **18.04s** |

Focused command uses the same Docker prefix with:

```sh
python -m pytest tests/test_semantic_state_hardening.py \
  tests/test_gemini_guarded_continuation.py \
  tests/test_qualification_harness.py -q --tb=short
```

Supplemental focused command uses the same prefix with:

```sh
python -m pytest tests/test_semantic_state_hardening.py \
  tests/test_semantic_control.py tests/test_qualification_transport.py \
  tests/test_qualification_harness.py -q --tb=short
```

Final failing IDs: **none**. Baseline failing IDs: **none**. The existing skipped
module `tests/test_agent_redis_integration.py` requires
`AI_AGENT_REDIS_INTEGRATION=1` and a dedicated Redis integration environment.
Two existing deprecation warnings remain (LangGraph/LangChain serializer and
Starlette/AnyIO); no new runtime test failures remain.

Initial exact failing IDs (all in `tests/test_semantic_state_hardening.py`):

- `test_repair_preserves_original_three_action_plan[0]`, `[1]`, `[2]` (reverse-order parametrization was added subsequently).
- `test_fulfillment_cannot_smuggle_payment`.
- `test_non_commitments_never_write[set_fulfillment_choice-args0-fulfillment-QUESTION]`, `[set_fulfillment_choice-args0-fulfillment-NEGATED]`, `[set_fulfillment_choice-args0-fulfillment-HYPOTHETICAL]`, `[set_fulfillment_choice-args0-fulfillment-CONDITIONAL]`.
- `test_non_commitments_never_write[set_payment_choice-args1-payment-QUESTION]`, `[set_payment_choice-args1-payment-NEGATED]`, `[set_payment_choice-args1-payment-HYPOTHETICAL]`, `[set_payment_choice-args1-payment-CONDITIONAL]`.
- `test_model_surface_splits_checkout_facets`.

Follow-up reproduction failing IDs in that module:
`test_root_extras_reject_writes_but_retain_compound_intent`,
`test_flat_update_wire_fields_are_typed_patch_not_new_intent`,
`test_prose_proposal_is_staged_without_authorizing_false_claim`,
`test_recommendation_read_does_not_imply_product_purchase`.

Two additional verification failures were investigated and fixed rather than
hidden: the new serializer staging test exposed successful writes incorrectly
ending as repair exhausted; `test_checkout_guarded_contract.py::test_invalid_confirm_schema_repairs_only_confirm_then_stops`
then exposed a changed legacy final-call sequence. Auto-completion was restricted
to the semantic journal, preserving the legacy contract. The final full suite
includes both tests and passes.

Coverage includes three-action repairs in every position and reverse order,
wrong target repair, malformed JSON/root retention, independent payment facets,
16 typed negative commitment combinations, selected geo B versus profile A,
immutable branch query coordinates, summary drift, changing line identity,
offsetting quoted price changes, approved compositional retrieval, unknown
preferences, transport caps and business-authority isolation. The full serializer
test demonstrates prose staging → one tool repair → both writes → deterministic
reply in **2 fake provider calls**, with zero writes before tool repair.

## Controlled live qualification — pre-final-fix run

See [SEMANTIC_STATE_LIVE_QUALIFICATION.json](SEMANTIC_STATE_LIVE_QUALIFICATION.json)
for each raw fictional message, expected facets, generated proposals, canonical
tool results, recorded writes, final state and reply. This is a diagnostic run,
not evidence that final production source is live-qualified.

Command (configured credentials remain inside the container):

```sh
docker compose run --rm --no-deps -T \
  -v "$PWD/avengers-coffee-system:/qualification/avengers-coffee-system:ro" \
  -v /private/tmp:/qualification-output \
  -w /qualification/avengers-coffee-system/services/ai-service \
  -e PYTHONPATH=/qualification/avengers-coffee-system/services/ai-service \
  ai-service python scripts/qualify_semantic_state.py --live \
  --output /qualification-output/chatbot-semantic-live.json
```

Run-wide transport counted **24 actual outbound sends**, including all repairs.
Sequential minimum four-second spacing; all 24 used Gemini 3.5 Flash Lite and
returned HTTP 200. No actual timeout/429 occurred. Two attempted continuations
were refused locally after the fence; they are not extra provider sends. The
stop reason is budget exhausted. No real cart/order/SQL/geo business writes.

| Case | Actual sends | Reported protocol repairs* | Elapsed seconds | Manual result |
|---|---:|---:|---:|---|
| needs/taste | 4 | 0 | 20.92 | Correct evidence-backed suggestion; unnecessary continuation/format repair |
| contextual ordinal | 3 | 1 | 17.31 | Correct pending product; malformed first proposal repaired |
| configuration | 3 | 1 | 20.74 | FAILED; prose actions / unrelated repair, no writes |
| multi-add | 4 | 2 | 23.99 | FAILED; misplaced defaults metadata, no writes |
| compound remove + quantity | 2 | 1 | 11.48 | FAILED; correct remove but silent update loss after root rejection |
| three cart edits | 2 | 2 | 12.04 | FAILED; correct two writes, third flat patch unresolved |
| delivery only | 2 | 1 | 11.76 | Delivery recorded, payment unset; asks address precision |
| address follow-up | 1 | 0 | 5.84 | State correct, **reply incorrect**: showed branch alternatives again |
| candidate selection | 1 | 0 | 5.81 | Correct destination/coordinates, payment unset and requested |
| candidate + payment | 2 | 1 | 12.98 | FAILED; malformed proposals then budget fence, no writes |
| explicit fulfillment + QR | 0 | — | — | NOT RUN in initial run; supplemental failed below |
| payment question | 0 | — | — | NOT RUN |
| payment negation | 0 | — | — | NOT RUN |
| checkout review | 0 | — | — | NOT RUN |
| later confirmation | 0 | — | — | NOT RUN |

*Per-turn telemetry counts attempted recovery faults; it is not a second count
of outbound calls. Final source retains the bounded repair policy. The original
state-only assessor marked address-followup passed; manual reply inspection
overrides that label here. It must not be counted as a complete live pass.

Observed business-write records: **3** (correct removal of 801, correct update of
802 to quantity 2, correct removal of 801 in a separate isolated case). Wrong
executed cart mutations: **0/3**, a small diagnostic sample. No observed payment
default or address drift in the tested state transitions. Silent action loss:
**1 case**, not zero. Incomplete/failed requests are separate from wrong writes.
Questions/negations and final confirmation were not live-tested in this run.

### User-authorized additional run

The user explicitly approved **up to 16 additional sends**, aggregate cap **40**.
The harness accepted `--budget 16` and prioritized five initially unrun cases
before regression reruns. A fake-transport regression proves the smaller cap
does not reset to the default 24.

See [SEMANTIC_STATE_ADDITIONAL_QUALIFICATION.json](SEMANTIC_STATE_ADDITIONAL_QUALIFICATION.json).
Actual supplemental sends: **3**; aggregate actual sends: **27/40**, with **13
unused**. No subsequent live restart/send occurred. The stop rule on repeated
provider errors takes precedence over spending the remaining budget.

| Supplemental send | Model | Outcome | Latency |
|---|---|---|---:|
| 1 | Gemini 3.5 Flash Lite | HTTP 200; malformed fulfillment + QR batch | 1.79s |
| 2 | Gemini 3.5 Flash Lite | ReadTimeout during protocol repair | 15.03s |
| 3 | Gemini 3.1 Flash Lite | HTTP 503 on fallback | 2.66s |

The batch had an undeclared `payment_payment_method` field and was rejected
before any writes. It also proposed TAI_CHO for the quoted canonical pickup
label. A new generic canonical-label/enum conflict check was subsequently added
and tested using **changed English fixture labels**, proving it is not tied to
the reported Vietnamese phrase. It refuses the different enum instead of
choosing another method. Production remains bounded/fail-closed on malformed
model proposals; this supplemental attempt did not establish a live pass.

Supplemental fulfillment+QR case elapsed **27.81s** (transport sum **19.47s**;
four-second pacing and orchestration account for the rest), 3 actual sends,
1 protocol-repair denial, error `provider_transient`, **zero writes and zero
fulfillment/payment changes**. Four planned cases (payment question, negation,
review, later confirmation) remain completely unrun live; the fifth was attempted
but failed. Supplemental successful-response usage: **4394 input / 115 output /
4509 total tokens**. Timeout/503 usage is unavailable, not asserted as zero.

Aggregate reported usage for successful responses: **92017 input / 3322 output /
95339 total tokens**; **27 actual sends**, sum transport latency **69.08s**.
The final source still needs qualification after provider recovery. No provider
keys, auth headers or signature fields were saved in this supplemental artifact.

Post-run fixes above were validated offline; the run's generated proposals and
safe state traces informed the added regressions. Zero remove quantity still
needs a valid typed repair; unrelated read/prose repair and semantic model
misclassification can still cause an honest blocked turn. No claim of complete
live elimination is justified without qualification of final source.

## Performance / token comparison

| Measurement | Before | Final / recorded run |
|---|---:|---:|
| System prompt characters | 6330 | 6386 (+56, approximately 0.9%) |
| All-capability semantic schema characters, same JSON encoding | 11480 | 11919 (+439, approximately 3.8%) |
| Extra always-on classifier calls | 0 | 0 |
| Live context chars | No comparable fresh baseline | 7629–13042 |
| Live dynamic schema chars* | No comparable fresh baseline | 2–9187 |
| Live provider sends | No comparable fresh baseline | 24 across 10 cases |
| Live input/output tokens | No comparable fresh baseline | 87623 / 3207 (90830 total) |
| Sum actual send latency | No comparable fresh baseline | 49.60s |
| Sum case elapsed, including pacing/loops | No comparable fresh baseline | 142.88s |

*Live harness schema metric uses Python string representation, while the static
comparison uses JSON; compare within each metric, not between them. `2` is an
empty tools list during final synthesis. Reported round protocol faults occurred
in 7/10 cases; final-format/read repairs are additional categories. A measured
post-fix real-model repair rate or latency is **unavailable** because the cap was
exhausted. Claims that production normally takes one call are not established
by this failed diagnostic run. Offline serializer coverage proves deterministic
completion after a valid batch and bounded two-call staging repair.

## Manual boundary audit

| Required invariant | Final source boundary / evidence | Qualification limit |
|---|---|---|
| Hallucinated ID reaches write? | Canonical namespace grounding, owned cart/order state and Menu validation; unknown/conflicting IDs denied | Wrong semantic selection of a valid entity still depends on model meaning |
| One quote authorizes unrelated checkout fields? | Split closed facets; PAYMENT target/evidence verification; independent defaults evidence | Exact quotations establish provenance, not a universal proof of meaning |
| Repair erases siblings? | Stable journal slot replacement; malformed roots/text stage without execution | Turn-scoped; does not automatically replay unresolved writes on a later user turn |
| Delete renumbers later intent? | Entry cart snapshot; all cart targets bound before writes | Tested every repair position and reverse order |
| Profile overwrites candidate? | Confirmed destination blocks profile offer/substitution | New explicit correction may replace it through geo validation |
| Summary contains unconfirmed/wrong address? | Missing prerequisites, address confirmation and canonical destination/summary drift gates | Actual provider geocoding precision depends on provider data |
| COD default without choice? | Dedicated payment tool with canonical current choice; missing payment blocks summary | No new silent default; model falsely labeling a question as AFFIRMED is not formally solved by provenance alone |
| Typed question/negation/hypothetical writes? | Commitment gate rejects before dispatch; 16 negative combinations | Final-source real-model negative cases remain unrun |
| Unsupported taste claims? | Approved content evidence, per-concept coverage, active Menu filter and deterministic recommendation reply | Lexical retrieval may miss distant paraphrases |
| New raw-language regex authority? | No new customer-language phrase router; JSON fence handling and canonical label/structural checks only | Existing legacy modules remain for explicit legacy callers |
| Always-on extra model call? | One existing semantic inference loop; optional bounded repair only | Model protocol errors can still consume repair budget |
| DataPlatform changed? | No changed DataPlatform paths; compose build/up only `ai-service`, `--no-deps` | None |

## Explicit outcome and remaining work

- **Silent action loss:** the identified journal/root-envelope/prose repair paths
  are fixed and regression-tested; the pre-final live run did observe one loss.
  Global live elimination on final source is **not yet demonstrated**.
- **Silent payment default:** combined semantic overfill is blocked, no implicit
  COD fallback remains on the audited semantic path; tested offline and no
  defaults observed live. A falsely AFFIRMED model interpretation is an explicit
  remaining semantic-model risk, not something exact-string provenance proves.
- **Address drift:** selected-candidate persistence and summary/confirmation
  drift refusal are implemented/tested; no drift observed in executed live cases.
  Final-source live end-to-end checkout remains unqualified.
- **Wrong mutation rate observed live:** zero among 3 isolated cart writes; do
  not extrapolate to unrun cases or all real customers.
- Four planned live cases remain completely unrun; explicit fulfillment+QR was
  attempted but failed. Post-run fixes need controlled qualification. The user
  approved 16 additional sends, of which 3 were used; **27/40 aggregate used**.
Live work stopped on consecutive timeout/503 failures. Do not start another
  retry loop to spend the unused 13 during the same provider failure episode.
- The journal is bounded and turn-scoped. Blocked requests receive explicit
  partial-completion/clarification rather than unreviewed cross-turn replay.
- The configuration live proposal included an unrequested topping in prose.
  Prose itself cannot mutate; current evidence/commitment contracts still depend
  on the model for option semantics. This failure is not evidence of successful
  final-source configuration, and must be included in future qualification.
- Qualification uses real model plus isolated business/geo authorities; it does
  not prove real service/provider availability, stock changes, delivery radius
  or a real order submission. These remain protected by existing business gates.

Rollback must preserve pre-existing local provider work. Review/revert this
task's specific file changes from a saved diff or a later reviewed commit;
**do not reset the repository to the historical anchor**.

## Runtime verification

Built successfully with `docker compose build ai-service` and recreated with
`docker compose up -d --no-deps ai-service`; no orphan removal or dependency
restart. `/ai/health` returned HTTP **200**, status **ok**, provider **gemini**,
Redis available **true**. **21 production source files** were compared between
working tree and `/app` in the running container: **zero hash mismatches**.
The first verification probe used `/health` and received 404; checking the actual
registered `/ai/health` endpoint confirmed readiness. No inference call was made
for deployment verification. `git diff --check` passes.
The configured orchestrator is **llm_tools**, model is **tier_policy**, and
model tiering is enabled. The retained route policy prefers Gemini 3.5 Flash Lite
before 3.1 Flash Lite. Initial qualification did not exercise failover; the
supplemental run exercised 3.5 timeout → 3.1 fallback and stopped on its 503.
