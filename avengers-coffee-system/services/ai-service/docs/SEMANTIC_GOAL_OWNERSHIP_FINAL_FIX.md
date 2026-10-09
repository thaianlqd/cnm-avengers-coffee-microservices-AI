# Semantic goal ownership — final orchestration fix

## 1. Starting HEAD

`STARTING_HEAD = 1f562b107e64f765584b7cb5b1d1c92acf664283` (`feat: van sai`), branch `branch_thaian`.
Before editing, inspected status, branch, HEAD, last ten commits, unstaged and staged diffs. The starting worktree was clean. The historical `460e8ab` anchor was not reset, reverted or cherry-picked.

## 2. Actual current HEAD and worktree

HEAD remains `1f562b107e64f765584b7cb5b1d1c92acf664283`; this task's changes are uncommitted. All changed/new files are under `avengers-coffee-system/services/ai-service`. DataPlatform, credentials and environment configuration were not modified. No agents were delegated, no UI qualification was run, and no messages were sent externally.

Production changes: `turn_contract.py`, `semantic_prerequisites.py`, `product_snapshot.py`, `semantic_control.py`, `semantic_plan.py`, `semantic_progress.py`, `semantic_registry.py`, `tool_policy.py`, `tool_artifacts.py`, `customer_flow_presentation.py`, `llm_tool_orchestrator.py`, `groq_service.py`.

Reproducible evidence: [ordered qualification](SEMANTIC_GOAL_OWNERSHIP_QUALIFICATION.json), [static inventory](SEMANTIC_GOAL_OWNERSHIP_STATIC_AUDIT.json), `scripts/qualify_goal_ownership.py`, `scripts/audit_goal_ownership.py`. Qualification ran in Docker with `--network none` and scripted/fake providers; real credentials were not supplied to test containers.

## 3. Fresh baseline tests

| Baseline | Passed | Failed | Skipped | Warnings | Duration | Failing IDs |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Focused continuity baseline | 1777 | 0 | 0 | 1 | 9.93s | None |
| Complete `tests/` baseline | 4990 | 0 | 1 | 2 | 28.27s | None |

Focused modules: `test_turn_contract`, `test_turn_repair_surface`, `test_turn_semantic_drift`, `test_turn_continuity_provider`, `test_semantic_registry_contract`, `test_semantic_repair_modes`, `test_typed_semantic_journeys`.
Logs: `/private/tmp/goal-ownership-focused-baseline.log`, `/private/tmp/goal-ownership-full-baseline.log`. These are fresh measurements at the actual starting worktree, not previous report counts.

## 4. Root cause

The gateway auto-bound the first operation after `INTERRUPT_PENDING`. `TurnContract.is_prerequisite()` then treated equality with `bound_operation` as primary status. A same-domain interrupt could therefore turn supporting discovery into selection completion and publish a replacement product list. Ordinal selection lacked a distinct immutable product-display authority, and deterministic presentation selected only the last draft's options.

This fix uses typed semantic operations and server state. No Vietnamese phrase, keyword classifier, new routing regex, judge or additional unconditional model request was introduced.

## 5. Old TurnContract ownership problem

`bound_operation` simultaneously meant the goal owner, exact retry operation and boundary between primary/supporting work. Interrupt acceptance, retry binding and completion consequently changed one another. Successful READ status and journal closure could be mistaken for primary completion. Static prerequisite lists admitted reads even when the needed canonical state was already available.

## 6. New goal-owner versus repair-target model

`goal_family` identifies the active semantic domain. `goal_owner_operation` is restricted to registry PRIMARY/FINALIZATION operations. `repair_target_operation` identifies the exact failed operation; the migration alias `bound_operation` has retry-only meaning. `consultation_operation` records an explicit standalone read without relabeling its registry role. `primary_state_obligation` is server workflow state, not a classifier for new user intent.

A prerequisite cannot acquire ownership through observation, interrupt order or retry binding. The first repair of a supporting operation preserves an existing primary owner, including when that supporting operation is PRIMARY in another domain. An accepted compound journal may establish its failed primary on first entry into repair; subsequent recovery cannot redefine it through a prerequisite.

Batch eligibility is validated before owner observation, so the first accepted primary cannot invalidate an already accepted same-domain sibling during the gateway's second validation pass.

## 7. Interrupt rules

An accepted interrupt changes to a different registered domain, preserves business state, clears obsolete retry bindings and returns `INTERRUPT_PENDING` with `continuation_required=true`. It never completes the turn. The next operation must be a target-domain primary/finalization, an explicit read-only consultation goal, or an exact state-needed prerequisite for that domain's primary.

There is at most one accepted interrupt per turn. Unfinished journals, committed writes and final-envelope-only repair reject switching. No automatic next-operation binding remains. Normal typed topic changes and pending-product change-of-mind scenarios remain supported.

## 8. Same-domain interrupt protection

All 15 goal families reject `G -> interrupt(G)` with `same_domain_interrupt` before any mutation. Goal, owner, retry target, scoped-domain flag, progress, budgets and surface remain unchanged. Gateway rejection executes no business tool, publishes no artifacts and returns `continuation_required=false`. A rejected proposal may still consume the existing bounded protocol-repair mechanism; it does not create a successful domain continuation or consume the interrupt budget.

## 9. Prerequisite role design

Role comes from registry metadata plus its exact relationship to the active primary. For example, DISCOVER_PRODUCTS remains PRIMARY for DISCOVERY but supporting work for SELECT_PRODUCT. Binding it never makes it selection's owner. All 48 business operations retain explicit goal family, progress role, terminal flag and prerequisites.

Generated checks cover 210 distinct cross-domain transitions with wrong next operations, every same-domain transition, all 23 prerequisite edges under three retry-binding variants, registry-wide role invariants, support-to-primary completion and first repair of every supporting edge. Existing repeated-prerequisite, repeated-interrupt, committed-write, quarantine and sibling-replay regressions also run. A real gateway/provider-loop fixture proves interrupt -> discovery prerequisite -> primary selection. Another gateway fixture proves malformed payment prerequisite -> repaired prerequisite -> SET_PAYMENT.

## 10. State-aware prerequisite design

`semantic_prerequisites.py` defines all 23 exact edges as immutable policies containing owner, operation, named predicate and reason. Registry validation rejects missing or mismatched policies. Predicates inspect trusted display/candidate state, pending option schemas, canonical option caches, cart verification, voucher/payment/address/branch/location offers, fulfillment choice and successful owned-order/price reads.

A usable frozen selection snapshot suppresses discovery and redundant options reads. An unresolved named reference can still require canonical Menu discovery. SELECT_PRODUCT itself obtains canonical options for an already resolvable product. Known configuration options suppress ASK_PRODUCT_OPTIONS; genuinely missing options enable it. Read facts are assembled by the gateway, not accepted from model output.

Only successfully completed support consumes the one-prerequisite continuation budget. A malformed supporting response uses the existing protocol-repair budget; it cannot permanently occupy that budget before supplying any facts. Repairing a same-family prerequisite after an interrupt leaves the primary available.

## 11. Frozen visible product snapshot design

`ProductDisplaySnapshot` captures the ordered canonical product rows, drink/food group ordering and entry focus before the turn executes. It has a server-generated snapshot ID, SHA-256 fingerprint, source `turn_entry_display` and version 1. Encoded immutable contents are returned through defensive copies. Product IDs come from canonical displayed state, never generated model identity.

Typed display ordinals read this snapshot even if mutable candidates, visible cards, entry compatibility lists or focus later change. Replacing the snapshot object or its entry identity fails closed for display ordinal grounding.

## 12. Multi-product selection design

One response can contain SELECT_PRODUCT for two or three displayed products. Each becomes a separate SemanticPlan action with its canonical product ID. Every selected configurable product keeps its own pending draft, quantity, stable `selection_index`, option schema and missing fields. Required options are not silently defaulted and selection does not falsely claim cart insertion.

Deterministic presentation renders all staged drafts and each draft's options. Tests configure the first draft, then the second stable ordinal, then the unique remaining draft through explicit defaults. Canonical IDs and option values remain separate throughout.

## 13. Ordinal grounding lifecycle

At entry capture snapshot S. Materialize the entire semantic response. Ground every usable reference against S before executing the first action. Store `bound_target`, `bound_product_id`, snapshot ID and fingerprint in the journal/projection. Execute in dependency order. Repair changes only the failed proposal and preserves all sibling identities.

If a malformed reference could not initially be grounded, freeze its corrected canonical target before executing the repaired action. Existing sibling bindings remain intact. Display ordinals and pending-configuration ordinals use distinct authorities; CART_LINE ordinals retain their separate existing frozen cart authority.

Logs include `entry_snapshot_id`, `grounding_snapshot_id`, entry/grounding fingerprints, canonical product ID and reference authority, without secrets. The compound Alpha/Gamma regression binds both before an evidence failure on the first action and retains Gamma through repair.

## 14. Artifact quarantine

Wrong-domain and unneeded discovery are rejected during whole-response preflight, before execution or artifact collection. Tests assert no read/write, no changed focus/cards, and no journal creation on rejection. Existing ToolArtifacts continuity gates quarantine evidence from incomplete constrained turns.

Necessary accepted discovery can supply internal canonical candidates while the primary remains unfinished. Once the legitimate primary completes, relevant accepted candidates may be displayed; this does not authorize rejected or unrelated discovery. A genuine accepted DISCOVERY interrupt can publish new cards while the historical turn-entry snapshot remains immutable.

## 15. Completion proof

Constrained primary completion requires a compatible PRIMARY/FINALIZATION with terminal metadata, authoritative executor evidence and a closed journal. Supporting reads return `PREREQUISITE_COMPLETED`, require continuation and cannot present primary success. Explicit standalone read requests remain consultation goals; completing such a read is not payment selection, configuration or order mutation.

SELECT_PRODUCT proves every intended plan target exists in canonical pending/cart state. Configuration checks changed pending/cart state, payment and fulfillment check explicit choices, branch selection checks canonical branch, and checkout preparation checks a summary milestone. Existing geo precision, later-turn checkout confirmation, owned-order preview/confirmation, Menu options/defaults, write reconciliation and idempotency gates remain authoritative. Business clarification can stop at `BLOCKED` without claiming a completed write.

## 16. Provider-call budget before and after

The reported failure used approximately five live requests; this historical observation was supplied by the user and was not reproduced with a live provider.

| Offline structural fixture | Requests | Interrupts | Prerequisites | Final synthesis requests |
| --- | ---: | ---: | ---: | ---: |
| Healthy existing-snapshot selection, 1/2/3 products | 1 | 0 | 0 | 0 |
| One malformed first response, then correct 1/2/3 selections | 2 | 0 | 0 | 0 |
| Malformed first response, rejected same/cross-domain escape, then correct selection | 3 | 0 | 0 | 0 |
| Legitimate interrupt with missing candidates, discovery prerequisite, selection | 3 | 1 | 1 | 0 |

These are real orchestrator loops with scripted providers. Metrics retain request/repair counts and add owner, retry target, interrupt count, prerequisite count, final-synthesis count and entry snapshot. The global bounded repair/tool/provider policies remain; two requests is a regression target for simple deterministic selection, not a universal ceiling for every business journey.

## 17. Focused tests, in required order

Each group below passed with exit code 0, zero failures/errors and no failing IDs. Groups overlap; do not sum them. Focused `-k` deselection partitions the ordered qualification and does not skip the final complete suite. Logs are under `/private/tmp/goal-ownership-qualification/`.

| Order | Group | Exact pytest result |
| ---: | --- | --- |
| 1 | ownership | 437 passed in 1.41s |
| 2 | same_domain_interrupt | 30 passed, 389 deselected in 0.66s |
| 3 | interrupt_transitions | 319 passed, 184 deselected, 1 warning in 2.04s |
| 4 | prerequisite_roles | 189 passed, 280 deselected in 0.76s |
| 5 | state_dependent_prerequisites | 29 passed in 0.59s |
| 6 | frozen_product_snapshot | 16 passed, 1 warning in 1.22s |
| 7 | multi_product_selection | 9 passed, 23 deselected, 1 warning in 1.30s |
| 8 | repair_and_ordinals | 77 passed, 227 deselected in 1.76s |
| 9 | artifact_quarantine | 93 passed, 1360 deselected, 1 warning in 1.35s |
| 10 | provider_call_budget | 13 passed, 71 deselected, 1 warning in 1.36s |
| 11 | semantic_plan | 291 passed, 1 warning in 3.93s |
| 12 | frozen_cart_ordinals | 47 passed, 223 deselected, 1 warning in 1.20s |
| 13 | product_configuration | 108 passed, 1 warning in 3.54s |
| 14 | recommendation | 118 passed, 1 warning in 2.69s |
| 15 | payment_location_checkout | 360 passed, 1 warning in 4.15s |
| 16 | order | 142 passed, 1 warning in 1.75s |
| 17 | provider_resilience | 99 passed, 1 warning in 2.11s |
| 18 | full_ai_service | 5444 passed, 1 skipped, 2 warnings in 25.85s |

464 new generated/example cases were added in `test_goal_ownership_contract.py`, `test_goal_prerequisite_state.py`, `test_product_display_snapshot.py`. Existing fixtures now distinguish missing/available prerequisites and establish genuine topic changes before an untyped malformed response. Every original test function remains; no skip was added. Ten formerly generated “wrong operation” cases are now valid consultation operations for read-only goals and are covered positively by the all-goal compatibility matrix. Thus `4990 + 464 - 10 = 5444` passing cases.

## 18. Full suite result

Final complete `python -m pytest tests -q --tb=short`: **5444 passed, 0 failed, 1 skipped, 2 warnings in 25.85s**. Failing IDs: none.

The existing skip is `test_agent_redis_integration.py`, opt-in `AI_AGENT_REDIS_INTEGRATION=1` with reason “explicit existing-Redis integration only”. It was already skipped in the fresh baseline. Existing warnings are LangChain's future `allowed_objects` default and Starlette/AnyIO's deprecated BlockingPortal alias.

Static verification: all changed Python files parse; `git diff --check` passes; zero removed test functions; zero new skip decorators/calls; zero added production routing regex sites; no unconditional classifier/judge call; ai-service-only scope.

## 19. Docker build

After all 18 final groups were green, `docker compose build ai-service` succeeded, then `docker compose up -d --no-deps ai-service` succeeded. No compose down, orphan removal, volume removal or dependency recreation was performed.

Running container: `a9f77169ea6a084478825c4e15ce28bcefd1b157996f97789a642362e7549f65`, started `2026-10-08T03:25:37.192453462Z`.
Image/runtime image ID: `sha256:0dedb6cdf9f31f0dc672f412269e92ca476e16c6d239d734f96d161440d7c730`.
All 12 changed production files in `/app` match worktree SHA-256 hashes. All 22 unrelated service containers kept their IDs. The task's own `--rm` offline test container exited normally.
Logs: `/private/tmp/goal-ownership-build.log`, `/private/tmp/goal-ownership-recreate.log`; hash evidence: `/private/tmp/goal-ownership-runtime-hashes.json`.

## 20. Health

`GET http://127.0.0.1:8009/ai/health` returned **HTTP 200**, JSON `status=ok`, after recreation. This is a health-only request, not chat inference. Evidence: `/private/tmp/goal-ownership-health.json`, `/private/tmp/goal-ownership-verification.json`.

## 21. Remaining limitations and explicit invariant answers

When the first response is completely malformed, it contains no trusted semantic direction. To prevent the reported selection goal from silently escaping through a cross-domain discovery, PRE_TOOL repair with a usable display snapshot and no stronger workflow obligation locks the selection corridor and exposes SELECT_PRODUCT only. It conservatively rejects interrupt with `frozen_selection_goal` and omits unusable interrupt from that repair surface. A genuinely new topic must be expressed by a valid normal typed transition before that lock, or in a subsequent user turn. Normal first-round topic changes and pending-configuration change-of-mind remain supported. Distinguishing those meanings after total format loss would require additional trusted semantic evidence; this implementation deliberately adds no raw-language classifier or judge request.

Scripted qualification proves server orchestration, identity, state, presentation and budgets. It does not measure real providers' language accuracy or predict all live outputs. Provider outages, genuine ambiguity, missing required options and incomplete addresses still follow existing bounded repair/clarification policies. Snapshot IDs are turn-scoped server data; they are not a replacement for canonical Menu identity or an authorization token.

| Question | Answer |
| --- | --- |
| Can PRODUCT_SELECTION interrupt to PRODUCT_SELECTION? | NO |
| Can DISCOVER_PRODUCTS become primary just because it is bound? | NO |
| Can a prerequisite alone mark PRODUCT_SELECTION complete? | NO |
| Can repair replace the ordinal snapshot before grounding? | NO |
| Can two displayed ordinals be canonically bound in one turn? | YES |
| Can genuine user change domain? | YES, through a valid typed safe transition; conservative total-format-loss exception above |
| Can rejected discovery overwrite visible cards? | NO |
| Can ordinals resolve against a newer display snapshot? | NO |
| Can an interrupt auto-bind an arbitrary next operation? | NO |
| Can a committed compound plan be abandoned by interrupt? | NO |
| Did this add raw-text semantic routing? | NO |
| Did this use any live provider? | NO |

## 22. Manual human-test matrix — prepared only, NOT executed

The user can run these later. The phrases illustrate goals; typed provider output remains the semantic input to the server.

| # | User goal | Expected semantic family | Expected canonical state | Forbidden behavior | Important log invariant |
| ---: | --- | --- | --- | --- | --- |
| 1 | Preference recommendation, e.g. lightly sweet drink | DISCOVERY | Canonical sellable candidates supported by approved descriptions | Sales fallback or invented taste/temperature | Requested count, evidence and accepted discovery scope |
| 2 | Select displayed ordinal 1 | PRODUCT_SELECTION | Original snapshot product 1 staged with its own options | Rediscovery, auto-default or false cart success | Entry/grounding fingerprint equal; canonical ID 1 |
| 3 | Select displayed ordinals 1 and 2 | PRODUCT_SELECTION | Both original IDs bound before execution; two pending drafts | Last draft overwrites first; replacement cards | Two frozen plan targets; request budget 1, or 2 after simple format repair |
| 4 | Refer to the previously focused item | PRODUCT_SELECTION | Frozen entry focus grounds one canonical product | Later read reinterprets “that item” | Entry snapshot/focus authority and canonical target |
| 5 | Configure a selected product | PRODUCT_CONFIGURATION | Exact pending ID committed only with valid Menu options | Silent required defaults or duplicate write | Primary owner, option authority, write reconciliation |
| 6 | Select/configure multiple products, first then remaining | PRODUCT_SELECTION / PRODUCT_CONFIGURATION | Independent drafts and stable selection indices | Options cross-contaminate; wrong remaining item | Bound IDs and selection_index remain stable |
| 7 | Remove original cart #2 and update original #3 | CART_EDIT | Original cart-line IDs applied once each | Reindex after removal; replay a successful sibling | Frozen cart targets, retained action IDs |
| 8 | Change mind while a product is pending; discover another family | PRODUCT_CONFIGURATION -> DISCOVERY | Pending draft retained; new cards after accepted switch | Same-domain escape, discarded draft, interrupt completes turn | One interrupt, INTERRUPT_PENDING then valid discovery |
| 9 | Choose eligible voucher or explicitly skip | VOUCHER | Canonical eligible code or explicit skip decision | Generic acknowledgment becomes voucher selection | Read is support; voucher primary establishes decision |
| 10 | Delivery choice plus destination | FULFILLMENT / LOCATION | Explicit delivery type, precise confirmed destination, compatible branch | POI/area treated as precise delivery address | Destination source, precision and authoritative branch milestone |
| 11 | Choose payment after reading available methods | PAYMENT | Explicit canonical payment_method updated | READ_PAYMENT_OPTIONS alone completes payment selection | PREREQUISITE_COMPLETED before SET_PAYMENT completion |
| 12 | Review checkout, then confirm in a later turn | CHECKOUT | Fresh summary/action first; later owned action commits once | Read/preparation equals confirmation; replayed order | Prior-turn action/fingerprint, FINALIZATION and reconciliation |

## 23. Live provider requests

**LIVE_PROVIDER_REQUESTS = 0**

No Gemini, Google AI Studio, Groq, OpenAI, OpenRouter, Cerebras or other external LLM was called. Tests used fake/scripted output in network-isolated containers. No user API key was used, no secrets were printed, and no human/UI tests were executed. The only runtime verification request was the local health endpoint; Docker build/recreation did not invoke a model.
