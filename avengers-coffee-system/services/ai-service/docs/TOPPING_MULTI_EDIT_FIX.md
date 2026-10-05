# Named cart topping edits

Starting state: `branch_thaian`, HEAD `8f969f9aea748a13b45f1973e72eb5721a247d9d`, clean working tree.

Scope: the active pasted attachment's coffee chatbot bug. The separate Data Platform AI V2 redesign was not implemented in this pass.

## Evidence and limitations

The running container's source fingerprints matched the local source before this change. Its retained console logs began after the pasted incident and contain no matching topping turn. A read-only query of `ai_turn_log` found no topping-related records. Therefore the exact historical provider proposal cannot be established from the available logs.

The existing 28 topping tests already cover the reported named cake/coffee request, partial success, ambiguity between available topping variants, and retaining the resolved topping choice across the follow-up. These passed before modification.

An additional offline reproduction identified a remaining guard failure: models can propose a complete cart line, repeating unchanged size, sweetness and quantity alongside the requested change. The multi-edit guard rejected every unrequested field, including values identical to the current line. This prevented the request from reaching Menu validation and its topping clarification.

## Change

For a multi-item edit with known requested fields, discard only unrequested fields equal to the current cart line. Continue rejecting any actual unrequested change. Keep requested fields even when unchanged so completion evidence remains accurate. Menu validation, exact cart targets, explicit quantity validation, write idempotency and partial-success rendering remain in place.

No customer phrase or topping value was added to production routing. Test examples use fake Menu options.

## Verification

Eight additional parameterized cases cover full-line proposals in either operation order, ambiguous and explicit topping choices, rejecting actual unrequested configuration changes, and a provider omitting the coffee edit after completing the cake quantity.

Run from `avengers-coffee-system/services/ai-service`:

```sh
.venv/bin/python -m pytest tests/test_named_cart_toppings.py tests/test_checkout_guarded_contract.py tests/test_llm_tool_orchestrator.py -q
```

Result: **151 passed**. Syntax compilation and `git diff --check` passed. No real provider or embedding calls were made. New topping tests block network transport and use scripted providers and fake cart writes.

A broader run also included `test_chat_flow_safety.py`: 194 passed and 3 failed before the final two additional parameterized cases. All three failures reproduced with the original HEAD `tool_policy.py` loaded in memory: `test_inventory_requires_a_row_and_enough_quantity`, `test_branch_selection_rejects_unknown_inventory_until_stock_is_confirmed`, and `test_pickup_lists_five_nearest_and_marks_d9_matcha_unavailable`. These are existing inventory/branch fixture failures outside this change.

## Manual retest

1. With the named cake and coffee in the cart, request cake quantity 2 and coffee toppings including one ambiguous topping family. Expect cake quantity 2, a partial-success response, and a choice of available Menu variants; no guessed coffee topping write.
2. Answer with the precise topping variant. Expect both saved and newly resolved toppings on the same coffee line, with its quantity, size and sweetness unchanged.
3. Repeat using explicit topping names in the first request. Expect both edits to complete.
4. Confirm the chatbot cannot report all edits complete if one edit is omitted or denied.

No commit or push was performed.
