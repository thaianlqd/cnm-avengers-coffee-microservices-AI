# Customer chatbot: named purchases and menu protocol, 2026-10-08

## Production evidence

Times use Asia/Ho_Chi_Minh. Read the reported conversation's existing logs and stored tool records without sending any inference request.

- 01:34:44–01:34:52: cool/sweet drink request returned approved product-description recommendations. A malformed initial structured proposal was corrected; no provider failure occurred.
- 01:35:08–01:35:15: new purchase request for `cà phê sữa` invoked `get_recommendations` with `criteria=preferences`, `preference_query="cà phê sữa"`, `preference_concepts=["cà phê sữa"]`, empty `search_text`, category default `all`. Description retrieval ranked black-coffee descriptions containing a comparative mention of milk coffee first. No Menu name lookup constrained this query. This was the wrong authority for the named purchase, not a timeout or missing product in Menu.
- 01:36:42–01:36:49: generic menu request twice failed structured-action validation; retained failed action was `get_menu_categories`, `args={}`, SELECTED. Stored diagnostics do not preserve the exact second wire proposal, so its precise formatting defect cannot be established retrospectively.
- 01:36:57–01:37:05: repeated menu request used `filter_catalog` with `category=all`. The adapter incorrectly required `search_text` despite the underlying catalog's optional search. Repair then supplied the two-character string `''`, which became a literal name filter and returned no matches. The same read action was marked SUCCEEDED with no remaining actions, but the outer protocol loop incorrectly returned `semantic_repair_exhausted` because an empty successful repair was not recognized as completion.

## Changes

- Add an authoritative Menu-name lookup when the structured recommendation query consists of one identical declared concept and no separate family filter. Matching active Menu names take precedence over incidental mentions in descriptions. This uses current Menu data, not a coffee-name map, raw-customer regex, extra classifier, or provider call. Without matching names, approved description retrieval remains available. Structured named purchases are also documented as catalog operations in the model tool contract.
- Render Menu-name results as ordinary product choices, without claiming description-based suitability. Multiple matches require customer selection. A unique selected match still requires canonical product options; no defaults or cart writes are inferred. Prior suggestion cards are replaced by the newest query's results.
- Remove the artificial required name-search field for category browsing. Normalize the explicit empty-string wire literals `''` and `""` to an empty filter. All other filters remain literal and authoritative.
- Accept omitted `args` only for registered READ capabilities with no argument properties/requirements. Normalize misplaced selected-tool fields only if their declared values are consistent. Preserve unknown fields and reject conflicts. No missing write arguments are inferred.
- Carry explicit proof that the same known READ action was repaired and its journal has no pending actions. The outer loop recognizes that completion, including `not_found`, without accepting an unrelated read as completion of a missing/unknown/write operation. Product selection continuations remain enabled. Completed category reads can render their authoritative menu immediately.

## Offline verification

New tests initially reproduced **6 failures, 1 pass**. Initial focused group after repair: **223 passed**, 1 dependency warning, 2.93 seconds. Additional tests cover changing from taste suggestions to a named family, unique-match option staging, flat-field conflict denial, and a corrected empty read. An existing unknown-operation safety regression caught overly broad read completion; the final implementation requires the repaired original operation to be a known READ.

Final full suite: **2,887 passed, 1 skipped, 2 dependency warnings**, 18.66 seconds, Docker `--network none`. Log `/private/tmp/chatbot-0134-full.log`. `git diff --check` passed. Tests use synthetic providers/Menu data, both the reported Vietnamese product family and an unrelated English family.

Live inference requests made for this repair: **0**. Preserve Gemini-only 3.5 → 3.1 order, credentials, and DataPlatform AI. These checks establish deterministic protocol behavior; future Gemini proposals and remote availability are not live-qualified by this repair.

## Runtime and real Menu read verification

Rebuilt and recreated only `ai-service` with `--no-deps`. Internal health returned HTTP 200, `llm_tools`, provider/fallback `gemini`, Redis available. Twelve production source files matched workspace hashes exactly. Read-only calls to actual Menu authority returned exactly **Cà Phê Sữa Đá** and **Cà Phê Sữa Nóng** for `search_text="cà phê sữa"`, plus **14 menu categories** with status `ok`. These calls read business data; no chat, inference, key test, cart mutation or real order was executed.
