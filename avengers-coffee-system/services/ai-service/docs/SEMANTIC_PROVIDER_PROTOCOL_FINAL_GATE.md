# Semantic provider protocol final gate

## 1. STARTING_HEAD

`da32860e99a715cae6e4ce5248b28d55c698bebd` (`suy`), branch `branch_thaian`.
Historical stable reference `460e8abd01f0c186ab98bee1c304b7f9e2dd288d` was not reset, reverted or cherry-picked.

## 2. Actual worktree

Phase 0 inspected status, branch, HEAD, ten commits, working and staged diffs. Starting worktree was clean. Changes remain uncommitted, entirely under `avengers-coffee-system/services/ai-service`. DataPlatform and other services are outside this change. No user work was discarded.

Production retains existing TurnContract, SemanticPlan and business executors. There is no new intent classifier, language router, judge call or conversation FSM. The new boundary module owns structural normalization, diagnostics, provider projection and server authorization only.

## 3. Fresh baseline

| Run | Passed | Failed | Skipped | Warnings | Pytest duration | Failing IDs |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Focused registry/ownership/snapshot/repair/Gemini/resilience/wait | 746 | 0 | 0 | 1 | 3.39s | none |
| Complete `tests` directory | 5444 | 0 | 1 | 2 | 25.40s | none |

Fresh logs: `/private/tmp/provider-protocol-focused-baseline.log`, `/private/tmp/provider-protocol-full-baseline.log`. Docker ran with `--network none`, fake providers and no real provider keys. The pre-existing skip is the opt-in Redis integration test. Existing warnings concern LangChain `allowed_objects` and Starlette `BlockingPortal`.

## 4. Reported live failure class

The handoff reports normal Gemini output without an acceptable envelope, followed by one-tool envelope repair, then semantic wire repair, ending NEEDS_REPAIR after approximately three requests. Frozen products and mutation safety held. This is provider-envelope / semantic-wire fragility. Exact original rejected argument bytes were unavailable; this report does not invent a proven old failed field. Structural fixtures reproduce these classes offline.

Diagnostics were implemented and seven diagnostics tests passed before behavior changes. No live reproduction was attempted.

## 5. Exact old SELECT_PRODUCT provider schema

Exported from the actual starting worktree before behavior edits:

```json
{
  "type": "function",
  "function": {
    "name": "semantic_select_product",
    "description": "Choose a canonical product and stage it; inspect Menu choices without committing cart.",
    "parameters": {
      "type": "object",
      "properties": {
        "commitment": {
          "type": "string",
          "enum": [
            "SELECTED",
            "AFFIRMED",
            "CORRECTION"
          ]
        },
        "evidence": {
          "type": "string",
          "minLength": 1
        },
        "quantity": {
          "type": "integer",
          "minimum": 1,
          "maximum": 999
        },
        "reference": {
          "type": "object",
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "id",
                "name",
                "ordinal",
                "focus",
                "singleton"
              ]
            },
            "value": {
              "type": "string",
              "minLength": 1
            },
            "index": {
              "type": "integer",
              "minimum": 1
            },
            "scope": {
              "type": "string",
              "enum": [
                "drink",
                "food"
              ]
            }
          },
          "required": [
            "kind"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "commitment",
        "evidence",
        "reference"
      ],
      "additionalProperties": false
    }
  }
}
```

## 6. Exact new provider selection schema

```json
{
  "type": "function",
  "function": {
    "name": "semantic_select_products",
    "description": "Select one or more products in ONE call. Resolve references from the current displayed list. Never configure or add to cart.",
    "parameters": {
      "type": "object",
      "properties": {
        "selections": {
          "type": "array",
          "minItems": 1,
          "maxItems": 16,
          "items": {
            "type": "object",
            "properties": {
              "quantity": {
                "type": "integer",
                "minimum": 1,
                "maximum": 999
              },
              "reference": {
                "type": "object",
                "properties": {
                  "kind": {
                    "type": "string",
                    "enum": [
                      "id",
                      "name",
                      "ordinal",
                      "focus",
                      "singleton"
                    ]
                  },
                  "value": {
                    "type": "string",
                    "minLength": 1
                  },
                  "index": {
                    "type": "integer",
                    "minimum": 1
                  },
                  "scope": {
                    "type": "string",
                    "enum": [
                      "drink",
                      "food"
                    ]
                  }
                },
                "required": [
                  "kind"
                ],
                "additionalProperties": false
              }
            },
            "required": [
              "reference"
            ],
            "additionalProperties": false
          }
        }
      },
      "required": [
        "selections"
      ],
      "additionalProperties": false
    }
  }
}
```

Conditional reference grammar also requires `index` for ordinal, `value` for id/name, and rejects extraneous index/value on other reference kinds. All objects are closed. One array represents 1–16 selections; quantity is optional, bounded 1–999. Selection does not authorize Menu defaults or commit a cart line.

The singular provider name is unavailable. The private `semantic_calls` / `materialize_operation` migration adapter retains old singular contracts for internal characterization; production tool execution goes through `provider_calls`.

## 7. Evidence ownership

Provider WRITE schemas no longer contain `evidence`. An exact quote did not independently verify selection versus question or negation. Production materialization inserts a private compatibility placeholder `[server-authorized]`; the verified provider lane never compares it to customer text. It is not an authority token and carries no language classification. Legacy private adapters keep their old quote checks.

Models still choose READ/ASK for questions and hypothetical discussion, SELECT/SET for choices, and explicit discard/remove or no write for negation. A malicious or mistaken model can still misclassify business meaning; server authorization proves provenance and deterministic permission, not natural-language truth. Scripted READ and social no-write fixtures preserve state; an incorrect final checkout call without pending confirmation is rejected. Existing final-write gates remain independently tested.

## 8. Current-turn authorization

The server issues an immutable TurnAuthorization per semantic request surface with conversation ID, client message ID, user-turn hash, TurnContract ID, monotonically increasing surface request sequence, monotonic issued time and schema-surface fingerprint. It stays in a gateway-local ledger. The model sees neither the record nor an echo field.

Materialized actions receive opaque random IDs bound to their exact action hash and provider operation. Verification checks issued ledger membership, active conversation/client/turn/contract, 300-second expiry, exact action identity, consumption and TurnContract eligibility. Already accepted pending compound siblings retain their exact journal authorization during repair. The existing durable client-message claim provides cross-request idempotency; ledger consumption prevents in-loop replay. Surface sequence counts semantic request rounds; transport failover attempts are counted separately for the total request budget.

WRITE calls must be advertised on the issued current surface. A deliberately retained existing normal-mode READ consultation compatibility path permits a registered, exposed, capability-allowed READ outside the narrow goal surface. It never admits SELECT_PRODUCT/WRITE/FINAL_WRITE and closes completely during repair. It is not a mutation authorization exception. Tightening that unrelated consultation behavior broke existing payment/voucher questions, so this protocol pass preserves it explicitly.

Tests cover missing proof, other gateway/surface, changed client turn, expired proof, replay, action-payload tampering, model-supplied forged metadata, duplicate responses, and repair-surface violations. Internal authorization fields are recursively removed before provider history/UI results.

Checkout and order confirmation still require their existing pending action, later user turn, valid action ID, current fingerprints/state, expiry, ownership and idempotency. Same-turn prepare+confirm remains denied. No missing payment, address, fulfillment or option is invented.

## 9. Commitment ownership and complete static surface audit

Registry metadata supplies QUESTION for reads, SELECTED for selections/settings, CORRECTION for product/cart edits, REJECTED for discard/skip/remove-voucher, and AFFIRMED for final writes. Existing private enum acceptance remains as migration characterization; it is not the provider surface.

Three explicit provider variants preserve previously distinct behavior: `semantic_reset_product_defaults` uses CORRECTION to reset prior options, `semantic_decline_profile_address` uses REJECTED, and `semantic_change_profile_address` uses CORRECTION. Their existing business guards remain. They map to existing canonical operations; no extra FSM roles were added.

Full machine-readable audit: [SEMANTIC_PROVIDER_SURFACE_AUDIT.json](SEMANTIC_PROVIDER_SURFACE_AUDIT.json). It records all 51 provider semantic operations plus the control interrupt, required/all fields, server fields, exact reference shapes, commitment, chars, exposure predicates and representative states. Regenerate with `PYTHONPATH=. python scripts/audit_semantic_provider_protocol.py --baseline <starting-schema-export.json> --output docs/SEMANTIC_PROVIDER_SURFACE_AUDIT.json` in a network-blocked container.

Server-owned fields for every business operation are TurnAuthorization, canonical identity and business state; WRITE additionally owns commitment, with no provider evidence requirement. The table abbreviates `semantic_` and references by allowed kinds. `—` means no required top-level field/reference. State exposure is illustrative; runtime capability/contract and repair locks narrow it further.

| Function (semantic_) | Goal | Access | Required provider fields | Server commitment | Reference kinds | Before→after chars | Exposure predicate |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| discover_products | DISCOVERY | READ | scope | QUESTION | id,name,ordinal,focus,singleton | 975→975 | always |
| recommend_by_preference | DISCOVERY | READ | scope, concepts | QUESTION | — | 671→671 | always |
| rank_by_sales | DISCOVERY | READ | scope, period | QUESTION | — | 564→564 | always |
| rank_by_price | DISCOVERY | READ | scope, direction | QUESTION | — | 527→527 | always |
| discover_new_products | DISCOVERY | READ | scope | QUESTION | — | 467→467 | always |
| rank_by_rating | DISCOVERY | READ | scope | QUESTION | — | 453→453 | always |
| read_menu | DISCOVERY | READ | — | QUESTION | — | 176→176 | always |
| select_products | PRODUCT_SELECTION | WRITE | selections | SELECTED | id,name,ordinal,focus,singleton | 765→815 | draft_selection |
| ask_product_options | PRODUCT_CONFIGURATION | READ | reference | QUESTION | id,name,ordinal,focus,singleton | 547→547 | always |
| configure_product | PRODUCT_CONFIGURATION | WRITE | — | CORRECTION | id,name,ordinal,focus,singleton,pending | 975→834 | pending_product |
| use_product_defaults | PRODUCT_CONFIGURATION | WRITE | — | SELECTED | id,name,ordinal,focus,singleton,pending | 694→553 | pending_product |
| reset_product_defaults | PRODUCT_CONFIGURATION | WRITE | — | CORRECTION | id,name,ordinal,focus,singleton,pending | 694→538 | pending_product |
| discard_product_selection | PRODUCT_SELECTION | WRITE | reference | REJECTED | id,name,ordinal,focus,singleton | 670→517 | pending_product |
| ask_product_fact | GENERIC_CONSULTATION | READ | facet, reference | QUESTION | id,name,ordinal,focus,singleton | 614→614 | always |
| ask_product_review | REVIEW | READ | reference | QUESTION | id,name,ordinal,focus,singleton | 503→503 | always |
| ask_product_price | GENERIC_CONSULTATION | READ | reference | QUESTION | id,name,ordinal,focus,singleton | 696→696 | always |
| ask_knowledge | RAG_KNOWLEDGE | READ | query, domain | QUESTION | — | 447→447 | always |
| read_cart | CART_EDIT | READ | — | QUESTION | — | 176→176 | always |
| read_cart_total | CART_EDIT | READ | — | QUESTION | — | 188→188 | always |
| update_cart_line | CART_EDIT | WRITE | desired_state, reference | CORRECTION | id,name,ordinal,focus,singleton | 906→764 | always |
| remove_cart_line | CART_EDIT | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton | 647→505 | always |
| finish_cart | VOUCHER | WRITE | — | SELECTED | — | 320→180 | always |
| read_eligible_vouchers | VOUCHER | READ | — | QUESTION | — | 202→202 | always |
| choose_voucher | VOUCHER | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton,best | 594→452 | always |
| skip_voucher | VOUCHER | WRITE | — | REJECTED | — | 333→182 | always |
| remove_voucher | VOUCHER | WRITE | — | REJECTED | — | 337→186 | always |
| read_payment_options | PAYMENT | READ | — | QUESTION | — | 198→198 | always |
| set_payment | PAYMENT | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton | 581→439 | always |
| set_fulfillment | FULFILLMENT | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton | 628→486 | always |
| read_profile_addresses | LOCATION | READ | — | QUESTION | — | 202→202 | always |
| resolve_new_location | LOCATION | WRITE | kind, for_checkout, reference | SELECTED | literal | 649→507 | always |
| select_profile_address | LOCATION | WRITE | kind, for_checkout, reference | SELECTED | id,name,ordinal,focus,singleton | 727→574 | saved_addresses |
| decline_profile_address | LOCATION | WRITE | kind, for_checkout, reference | REJECTED | id,name,ordinal,focus,singleton | 727→598 | saved_addresses |
| change_profile_address | LOCATION | WRITE | kind, for_checkout, reference | CORRECTION | id,name,ordinal,focus,singleton | 727→618 | saved_addresses |
| select_location_candidate | LOCATION | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton | 609→467 | location_candidates |
| find_nearby_branches | LOCATION | READ | location | QUESTION | — | 236→236 | always |
| read_branches | LOCATION | READ | — | QUESTION | — | 184→184 | always |
| select_branch | LOCATION | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton | 585→443 | branch_candidates |
| read_branch_ratings | REVIEW | READ | — | QUESTION | — | 196→196 | always |
| ask_branch_review | REVIEW | READ | reference | QUESTION | id,name,ordinal,focus,singleton | 451→451 | always |
| compare_branch_reviews | REVIEW | READ | branch_ids | QUESTION | — | 295→295 | always |
| prepare_checkout | CHECKOUT | WRITE | — | SELECTED | — | 365→224 | always |
| confirm_checkout | CHECKOUT | FINAL_WRITE | — | AFFIRMED | — | 306→190 | always |
| read_order_history | ORDER_READ | READ | — | QUESTION | — | 245→245 | always |
| read_order | ORDER_READ | READ | reference | QUESTION | id,name,ordinal,focus,singleton,recent | 446→446 | always |
| track_order | ORDER_READ | READ | reference | QUESTION | id,name,ordinal,focus,singleton,recent | 448→448 | always |
| prepare_order_cancel | ORDER_CHANGE | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton,recent | 635→493 | owned_order |
| prepare_order_update | ORDER_CHANGE | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton,recent | 1907→1765 | owned_order |
| prepare_reorder | ORDER_CHANGE | WRITE | reference | SELECTED | id,name,ordinal,focus,singleton,recent | 598→456 | owned_order |
| confirm_order_change | ORDER_CHANGE | FINAL_WRITE | — | AFFIRMED | — | 314→198 | order_preview |
| discard_order_change | ORDER_CHANGE | WRITE | — | REJECTED | — | 349→198 | order_draft |
| interrupt | CONTROL | CONTROL | target_domain | — | — | new→806 | one interrupt; no locked snapshot, repair target or committed write |

No provider commitment/evidence echoes remain. Optional `supplied_location`, READ query/filter fields and typed Menu choices remain meaningful semantic inputs; they do not choose server IDs/state. Explicit variants have distinct behavior; there are no overlapping singular/batch selection functions.

Schema size uses compact sorted JSON, Unicode preserved, characters rather than bytes. Old singular selection: 765 chars, 2 object schemas, required `commitment,evidence,reference`. New batch: 815 chars, 3 object schemas, required `selections`, with each item requiring only `reference`. The batch wrapper adds 50 chars while removing two authority degrees of freedom and representing multiple products in one call. No claim is made that every schema became shorter.

| Representative normal state | Before functions | After functions | Before chars | After chars |
| --- | ---: | ---: | ---: | ---: |
| browsing | 21 | 21 | 9972 | 9880 |
| products | 15 | 15 | 8056 | 8106 |
| pending_product | 9 | 10 | 5953 | 6107 |
| cart | 18 | 18 | 9800 | 9566 |
| voucher | 8 | 8 | 3861 | 3284 |
| location | 9 | 9 | 4504 | 3794 |
| payment_needed | 9 | 9 | 4504 | 3794 |
| summary | 15 | 15 | 7098 | 5847 |
| order_change | 9 | 9 | 5758 | 5065 |

## 10. Exhaustive lossless normalization audit

| Rule | Input shape | Output shape | Why meaning is identical | Applicable operations | Tests |
| --- | --- | --- | --- | --- | --- |
| json_object | JSON string containing object | Parsed object | Decodes the same JSON fields; duplicate keys, nonfinite constants and malformed JSON rejected | All operations | production shape fixtures; duplicate_json_key; diagnostics |
| canonical_integer | Canonical base-10 string at integer schema field, length ≤20 | Exact integer | Same numeric identity; no leading zero, plus, fraction, whitespace or boolean coercion | All declared integer fields | integer_normalizer; canonical_string_ordinal; quantity batch |
| selection_singleton | Object at `/selections` | One-item array | Exactly one unchanged selection | semantic_select_products only | singleton_object; structural_normalization |

There are no wrapper aliases, unknown-field dropping, arbitrary JSON repair or semantic defaults. Missing targets stay missing. Normalization occurs once before strict validation and grounding. Normalizer assertions reject undocumented rule IDs; fixture audit requires the exact three-rule set, coverage of all rules and these report rows. Changes to the normalization registry require corresponding documentation and tests.

## 11. Diagnostics and failure taxonomy

`[SemanticProtocolValidation]` emits: turn_contract_id, operation_name, validation_stage, schema_valid, json_parse_valid, argument_keys, argument_type_summary, unknown_argument_keys, missing_required_keys, reference_present, reference_kind, reference_index_type, commitment_present, commitment_value, evidence_present, evidence_exact_match, normalization_applied, normalization_rules, failure_code, failure_field, failure_json_pointer, repair_target_operation, entry_snapshot_id, entry_snapshot_fingerprint, and failure_class.

String arguments expose type/length/hash, not raw values. Reference kind and commitment are logged only from fixed enums. Unsafe unknown key names are hashed. Nested reference values, raw evidence/customer messages, addresses, credentials, provider bodies and full order payloads are absent. Batch reference summary describes the first reference; exact failure pointer identifies any failed item. `schema_valid=true` may coexist with grounding failure.

Four classes remain distinct: PROVIDER_ENVELOPE_PROTOCOL, SEMANTIC_WIRE_PROTOCOL, SEMANTIC_GROUNDING, BUSINESS_POLICY. Examples are missing_envelope, invalid_json, missing_required_field, unknown_field, invalid_reference_kind, invalid_ordinal_type, duplicate_canonical_target, canonical_target_unresolved, canonical_target_changed, current_turn_authorization_missing. Each event has one first deterministic failure code/pointer.

Sanitized illustrative event (not a live capture):

```json
{"operation_name":"semantic_select_products","validation_stage":"wire","schema_valid":false,"json_parse_valid":true,"failure_class":"SEMANTIC_WIRE_PROTOCOL","failure_code":"missing_required_field","failure_field":"reference","failure_json_pointer":"/selections/1/reference","normalization_applied":true,"normalization_rules":["json_object"],"entry_snapshot_fingerprint":"<sha256>"}
```

Repair feedback names the exact function, failure pointer and code, preserves selection count, known canonical targets and siblings, and permits only advertised fields. It does not ask for customer-text quotes. Customer fallback can remain concise; diagnostics distinguish the cause.

## 12. Provider capabilities and Gemini decision

| Transport | Required | Named | Parallel support | response_format with tools | One-tool repair |
| --- | --- | --- | --- | --- | --- |
| OpenAI | yes | yes | yes | yes | named function |
| Groq | yes | yes | yes | yes | named function |
| OpenRouter | yes | yes | yes | yes | named function |
| Gemini OpenAI compatibility | unverified→false | unverified→false | unverified→false | conservative false | explicit auto fallback |
| Cerebras | yes | yes | yes | unverified→false | named function |

These are API/transport capability projections, not guarantees for every configured model. Unsupported model routes remain subject to existing compatibility/failover policy. `parallel` is a declared support flag; batch selection itself uses one function call and does not require parallel dispatch.

Official references consulted without inference: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Groq API](https://console.groq.com/docs/api-reference), [OpenRouter tool calling](https://openrouter.ai/docs/guides/features/tool-calling), [Cerebras Chat Completions](https://inference-docs.cerebras.ai/api-reference/chat-completions).

[Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai) documents auto examples; this pass could not establish reliable required/named forcing for the deployed compatibility endpoint/model without a forbidden live call. Native Gemini ANY is not proof for that route. Parallel transport support is also conservatively marked unverified/false; the server can still process multiple returned calls, while selection uses one batch. Accordingly Gemini uses `auto_fallback_forcing_unverified`, logs `tool_choice_forced=false`, and omits response_format with tools. No hidden `gemini_semantic_repair_auto` branch remains. Fake transport tests cover all five routes, one-tool count, exact named/required-only/auto choice, compatible formatting, and sanitized request diagnostics. Existing history/thought-signature probes remain.

## 13. Repair budget

Simple selection has a hard total of two actual inference transport attempts, including failover: normal plus at most one envelope OR wire repair. Envelope repair followed by invalid wire fails closed without request three. Repeated malformed wire also stops after two. Zero tools execute for rejected malformed batches; snapshot and existing customer state remain.

Complex prerequisite flows retain existing bounded continuation. Each request records normal, provider_envelope_repair, semantic_wire_repair, final_envelope_repair or contract_continuation; transport alternatives record their transport reason. New selected-product presentation uses existing deterministic facts/options, with zero final-synthesis calls when sufficient.

## 14. Request counts before/after

| Scenario | Before (handoff live observation) | After (offline production loop) |
| --- | --- | --- |
| Failed normal envelope then failed wire repair | approximately 3 requests | exactly 2; fail closed |
| Healthy one/two/three products | not freshly measured live | 1 |
| Bad envelope then valid selection | not freshly measured live | 2 |
| Canonical numeric strings / singleton selection | could trigger strict repair | 1, normalized |
| Correct selection followed by scripted malformed final | final response risk | 1; final script is never requested |

Offline fixtures prove request structure/bounds and state, not real-model success rate or latency. No live performance claims are made.

## 15. Sanitized structural fixtures

`tests/fixtures/semantic_provider_shapes.json` contains synthetic sanitized structural reproductions of the reported failure classes, not captured raw Gemini payloads. Exact original private arguments were not available. They contain provider/function/shape, failure, normalization and expected server behavior. Future sanitized captures can use the same format. No private messages or credentials are stored.

| Fixture | First expected failure | Requests | Selected canonical IDs | Result |
| --- | --- | ---: | --- | --- |
| prose_without_envelope | missing_envelope | 2 | 101,103 | success |
| no_final_or_tool | missing_envelope | 2 | 101,103 | success |
| invalid_json | invalid_json | 2 | 101,103 | success |
| wrong_argument_shape | invalid_argument_shape | 2 | 101,103 | success |
| canonical_string_ordinal | none | 1 | 101,103 | success |
| one_selection | none | 1 | 101 | success |
| multi_selection | none | 1 | 101,103 | success |
| three_selections | none | 1 | 101,102,103 | success |
| singleton_object | none | 1 | 103 | success |
| duplicate_targets | duplicate_canonical_target | 2 | none | semantic_repair_exhausted |
| unknown_field | unknown_field | 2 | 101,103 | success |
| missing_second_reference | missing_required_field | 2 | 101,103 | success |
| invalid_reference_kind | invalid_reference_kind | 2 | 101,103 | success |
| mixed_invalid_grounding | canonical_target_unresolved | 2 | none | semantic_repair_exhausted |
| legacy_multiple_calls | operation_not_exposed | 2 | 101,103 | success |
| repeated_bad_repair | missing_required_field | 2 | none | semantic_repair_exhausted |
| envelope_then_bad_wire | missing_required_field | 2 | none | semantic_repair_exhausted |
| malformed_final_after_selection | none | 1 | 101,103 | success |
| forged_authorization | unknown_field | 2 | 101,103 | success |
| duplicate_json_key | invalid_json | 2 | 101,103 | success |

## 16. Frozen snapshot and atomic batch proof

Production tests instrument the first staging handler and assert that **every** SemanticPlan row already has its expected canonical ID and the same entry snapshot fingerprint. Alpha #1 and Gamma #3 bind to 101/103 before staging. Tests cover #1, #1+#3, #1+#2+#4, independent quantities 2+1, name+ordinal, focus+ordinal, malformed second reference, #99, unknown nested field, and duplicate canonical target.

All batch fields validate before any plan is created. All references resolve before any staging occurs. A malformed or unresolvable second item leaves no plan/draft/cart write. Duplicate canonical targets are rejected; quantity is never silently merged. Repair retains the original count and every known target, and cannot change known canonical IDs. No unrelated discovery replaces the entry snapshot.

Valid batches expand to existing SELECT_PRODUCT actions. Configurable selections preserve independent pending drafts; existing end-to-end tests configure first, second and third separately without losing remaining products or leaking options. Deterministic presenter names pending products/options without a synthesis request. Existing compound partial **business** behavior is retained; malformed nonselection members can enter the existing journal with valid siblings, but do not execute until repaired. Atomicity described here is provider-batch preflight, not a new distributed business transaction.

## 17. Ordered focused qualification

<!-- GATE_RESULTS_START -->
| # | Group | Passed | Failed | Skipped | Warnings | Deselected by focused filter | Pytest seconds | Failing IDs |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | registry | 270 | 0 | 0 | 0 | 0 | 1.26 | none |
| 2 | diagnostics | 9 | 0 | 0 | 0 | 0 | 0.24 | none |
| 3 | normalization | 7 | 0 | 0 | 0 | 26 | 0.80 | none |
| 4 | turn_authorization | 10 | 0 | 0 | 0 | 23 | 0.91 | none |
| 5 | selection_batch | 33 | 0 | 0 | 1 | 0 | 1.27 | none |
| 6 | product_snapshot | 16 | 0 | 0 | 1 | 0 | 1.29 | none |
| 7 | goal_ownership | 419 | 0 | 0 | 0 | 0 | 1.34 | none |
| 8 | prerequisites | 29 | 0 | 0 | 0 | 0 | 0.59 | none |
| 9 | repair_modes | 846 | 0 | 0 | 1 | 0 | 3.88 | none |
| 10 | provider_request_shapes | 35 | 0 | 0 | 1 | 0 | 1.05 | none |
| 11 | provider_shape_fixtures | 21 | 0 | 0 | 0 | 0 | 1.07 | none |
| 12 | product_configuration | 37 | 0 | 0 | 1 | 0 | 2.76 | none |
| 13 | cart | 44 | 0 | 0 | 1 | 0 | 1.10 | none |
| 14 | compound_cart | 22 | 0 | 0 | 1 | 0 | 0.89 | none |
| 15 | voucher | 153 | 0 | 0 | 1 | 0 | 2.43 | none |
| 16 | fulfillment | 110 | 0 | 0 | 1 | 0 | 1.32 | none |
| 17 | location | 66 | 0 | 0 | 1 | 0 | 1.09 | none |
| 18 | payment | 60 | 0 | 0 | 1 | 0 | 0.95 | none |
| 19 | checkout_confirmation | 94 | 0 | 0 | 1 | 0 | 3.26 | none |
| 20 | order | 142 | 0 | 0 | 1 | 0 | 1.73 | none |
| 21 | rag_recommendation | 134 | 0 | 0 | 2 | 0 | 2.41 | none |
| 22 | provider_resilience | 79 | 0 | 0 | 1 | 0 | 1.80 | none |
| 23 | full_suite | 5514 | 0 | 1 | 2 | 0 | 26.23 | none |
<!-- GATE_RESULTS_END -->

The runner `scripts/qualify_semantic_provider_protocol.py` executes the requested 23 groups sequentially and stops on failure. Final logs and JSON counts are in `/private/tmp/provider-final-gate-final`; stdout is `/private/tmp/provider-final-gate-final-run.log`. Focused filters deselect unrelated tests in groups 3/4; the complete suite executes them. Group counts overlap and must not be summed as unique tests. Docker blocks network; fake transports substitute all inference.

Historical customer_actions/business-tool characterization modules opt into an explicit **test-only** `private_migration_loop` adapter. It invokes private compatibility methods and preserves historical multi-round expectations. New wire, fixture, request-shape and selection-loop tests run the production provider boundary without this adapter. No failing tests were deleted or newly skipped; the single existing Redis integration skip remains. Old typed fixtures were migrated to minimal provider arguments or explicit typed domain switches where required.

## 18. Complete offline suite

<!-- FULL_RESULTS_START -->
**5514 passed, 0 failed, 1 skipped, 2 warnings in 26.23s.** Exit 0; no failing IDs. Full suite loaded final production code and the final typed failure assertions.
<!-- FULL_RESULTS_END -->

An earlier whole-suite run passed 5505 tests before the final audit/matrix additions. Final counts above supersede it. A diagnostic invocation accidentally omitted the `tests` directory and collected the root manual Gemini smoke script; it exited during collection because no key existed, inside `--network none`. No provider request occurred. The qualification runner always explicitly targets `tests`.

## 19. Docker build and restart

<!-- BUILD_RESULTS_START -->
`docker compose build ai-service` completed with exit 0. Image: `cnm-avengers-coffee-microservices-ai-ai-service:latest`, ID `sha256:f58ba718d44d63f3b0b5084ffc3025485d62d26a9222c1ec5d11faee681012f3`.

`docker compose up -d --no-deps ai-service` completed with exit 0. Container `avengers_ai_service` is running; inspected start time `2026-10-08T04:27:02.993304918Z`. Logs: `/private/tmp/provider-protocol-build.log`, `/private/tmp/provider-protocol-up.log`. No dependency restart/removal command was used.
<!-- BUILD_RESULTS_END -->

Only `docker compose build ai-service` and `docker compose up -d --no-deps ai-service` are authorized here. No compose down, orphan/volume removal or dependency restart. Startup lifespan performs DB/storage and local collaborative-filtering/forecast training, with no inference call.

## 20. Health

<!-- HEALTH_RESULTS_START -->
After rebuild/restart, `GET http://127.0.0.1:8009/ai/health` returned **HTTP 200** with local `status=ok`. Container state is `running`; no Docker HEALTHCHECK is configured, so the acceptance check is the HTTP endpoint. No chat/UI request was sent.
<!-- HEALTH_RESULTS_END -->

`GET /ai/health` reads local service/configuration availability and Redis status; it does not perform inference.

## 21. Remaining limitations and final diff audit

Real Gemini/Vietnamese semantic quality is not qualified by scripted tests. Gemini forcing remains explicitly unverified. Model-owned language meaning can still be wrong; TurnAuthorization is not a second semantic judge. Normal-mode registered READ compatibility and private migration tests are disclosed above. The provider-facing batch is slightly larger in JSON chars while eliminating redundant authority fields and multiple-call requirements. Gateway proof is in-process; durable replay protection remains the existing HTTP/client claim. Business failures after valid grounding use existing compound semantics and unknown-write reconciliation.

Final `git diff --check` passed. Python syntax parsing passed for changed production modules; schema/report/scope assertions passed. HEAD and branch remain the starting values, with no commit. Final production diff contains no added `re.search`, Vietnamese intent-keyword arrays or raw-language routing. Added regex fullmatches recognize only canonical decimal integer spelling and safe log-key identifier grammar; neither examines customer meaning. Existing provider-error classification regex remains unchanged. Vietnamese strings in presenters are output text, and multilingual fixtures are scripted semantic test inputs. Existing business price/stock/options/voucher/address/payment/ownership/fingerprint/reconciliation boundaries remain under regression tests.

## 22. Human qualification matrix — prepare only

Do not execute these automatically. Request counts below are per selection/current action turn, excluding preceding recommendation. Simple selections use 1 healthy / at most 2 on one repair. Complex flows may require registered prerequisite requests; each must have a logged deterministic reason, within the existing cap.

| # | Manual scenario | Expected operation(s) | Expected requests | Expected canonical state | Forbidden behavior | Inspect logs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Recommendation → one ordinal | semantic_select_products, one item | 1 healthy / ≤2 repaired | entry snapshot product #1 pending | rediscovery, auto defaults/cart commit | SemanticProtocolValidation; ProductSnapshotGrounding; synthesis=0 |
| 2 | Recommendation → #1 + #3 | semantic_select_products, two items | 1 / ≤2 | both entry IDs frozen before staging | losing first/second; partial bad batch | snapshot fingerprints; bound IDs; provider attempts |
| 3 | Recommendation → #1 + #2 + #4 | semantic_select_products, three items | 1 / ≤2 | three exact pending IDs | ordinal reinterpretation; request three lottery | plan IDs/targets; request reasons |
| 4 | Named product selection | semantic_select_products reference name | 1 / ≤2 if known; typed failure if unresolved | canonical Menu identity | fuzzy guessing or invented ID | grounding stage/failure pointer |
| 5 | Contextual focus selection | semantic_select_products reference focus | 1 / ≤2 when valid focus | entry focus identity | guessing missing focus | snapshot ID and grounding event |
| 6 | Two configurable products | semantic_select_products | 1 / ≤2 | two distinct pending drafts | collapsing drafts; automatic add | pending identities; deterministic options |
| 7 | Configure each independently | semantic_configure_product, explicit target | 1 healthy each; bounded prerequisites if needed | A/B options remain isolated | leaking A options into B | canonical target, Menu guard, SemanticAction |
| 8 | Compound cart edit | semantic_update_cart_line / semantic_remove_cart_line | 1 batch when complete; bounded exact repair | frozen entry cart-line IDs | shifted ordinal targeting; replayed write | SemanticPlan, business results, idempotency |
| 9 | Change of mind | semantic_interrupt only for genuine domain switch; discard or discovery then selection as appropriate | bounded; log each continuation | original state preserved until explicit choice | same-domain repair escape; unrelated rediscovery | TurnContract eligibility, interrupt count |
| 10 | Voucher question then choice | semantic_read_eligible_vouchers; semantic_choose_voucher or semantic_skip_voucher | 1 each healthy; prerequisite if missing facts | chosen eligible voucher only | applying on question; fabricated best code | canonical voucher ID, BUSINESS_POLICY |
| 11 | Fulfillment choice | semantic_set_fulfillment | 1 healthy; bounded exact repair | chosen delivery type | choosing payment/address implicitly | operation facet, checkout state |
| 12 | Location candidate | semantic_resolve_new_location then semantic_select_location_candidate as separate explicit choices | bounded geocoding prerequisites | selected opaque candidate, immutable destination | profile overwrite; invented candidate | canonical location identity, state guard |
| 13 | Payment question then selection | semantic_read_payment_options; semantic_set_payment | 1 each healthy; allowed prerequisite | available selected payment | silent COD; fulfillment change | payment reference, wallet availability |
| 14 | Checkout summary | semantic_prepare_checkout | 1 healthy or bounded prerequisite continuation | summary/action ID + current fingerprints | creating order immediately | checkout fingerprint, pending confirmation |
| 15 | Later confirmation | semantic_confirm_checkout; order changes use semantic_confirm_order_change | 1 healthy after valid later turn | one owned confirmed mutation | same-turn commit; stale summary; duplicate create | later-turn/action/fingerprint gate; reconciliation |

## 23. Explicit acceptance answers

| Question | Answer |
| --- | --- |
| Must model quote current text to authorize SELECT_PRODUCT? | NO |
| Redundant provider commitment required for selection? | NO |
| Can one semantic provider call select #1 and #3? | YES |
| Are both ordinals grounded before execution? | YES |
| Can malformed second item partially select first? | NO |
| Can canonical numeric string ordinal "3" normalize without extra inference? | YES |
| Can missing target be guessed? | NO |
| Can missing payment become COD? | NO |
| Can simple failed format repeatedly retry Gemini until lucky? | NO |
| Do logs show exact failed field/stage? | YES |
| Was raw-text language routing introduced? | NO |
| Were live provider requests performed? | NO |

**LIVE_PROVIDER_REQUESTS = 0**
