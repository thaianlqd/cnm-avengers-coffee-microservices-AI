Natural-conversation and RAG routing micro-hardening — 1 October 2026

The patch is complete and uncommitted. All 1,270 existing AI tests and 147 new regression cases pass. Order Service passes all 108 tests and builds successfully. Verification is deterministic and local; no browser, live database, map provider, or generation-provider E2E run is claimed.

**A. Actual starting HEAD.** Branch: `branch_thaian`. Actual local HEAD: `231ca11cd5aaabee9f9e8bc872aeb9faf83ff29b`. `origin/branch_thaian` had the same value before and after `git fetch origin`. Starting working tree was clean. Fetch initially encountered the sandbox's read-only `.git/FETCH_HEAD` restriction, then succeeded with approved escalation. Local HEAD is unchanged.

**B. Baseline results.** Before production edits:

| Check | Result |
| --- | --- |
| AI `.venv/bin/python -m pytest tests -q` | 1,270 passed |
| Focused RAG/context/order routing baseline | 151 passed |
| Order `npm test -- --runInBand` inside sandbox | 103 passed; five HTTP tests could not bind loopback (`listen EPERM 127.0.0.1`) |
| Same Order suite with approved loopback access | 108 passed; 11 suites passed |
| Order `npm run build` | Passed |
| `git diff --check` | Passed |

Baseline logs are in `/tmp/natural-ai-baseline.log`, `/tmp/natural-focused-baseline.log`, `/tmp/natural-order-baseline-unrestricted.log`, and `/tmp/natural-build-baseline.log`.

**C. Reproduced natural minimal failures.** The initial 110-case characterization matrix reproduced 82 failures and 28 passes. An isolated copy of starting-HEAD production sources reproduced the same result with unique session IDs, avoiding cross-case rate-limit interference. Failure groups: 48 description/context cases; 22 review/price cases; six authority/polarity cases; three future-purpose browse cases; three location-first cases. Examples include `vị sao?`, `món này ngon k?`, `giá?`, `bao nhiêu?`, browse followed by `để tôi chọn`, and an explicit address followed by a vague future-shopping clause. The baseline source copy and corrected characterization log are in `/tmp/natural-starting-head` and `/tmp/natural-characterization-corrected.log`.

**D. Harness-induced versus production defects.** The attached task supplies the external harness's reported symptoms, but not its script, raw responses, or assertions. No individual external failure can therefore be classified confidently as solely harness-induced. The selected-ID blocker, exclusion polarity, terse product-reference handling, purpose-clause browsing, and location-first rejection are real defects reproduced with deterministic natural-language tests. Verbose harness wording is an artificial test input, but excluding price/stock still has valid semantics and deserves correct handling. No Desktop harness was edited or run.

**E. Selected-product root cause.** `try_knowledge_consultation` returned immediately whenever `selected_product_id` existed. The graph also treated that field as an unconditional add. The backend now passes the ID to canonical product-context resolution for static consultation; product evidence is filtered by the resolved canonical entity. A card add requires positive selection evidence. Price/review/stock questions and pending option answers retain their business owner. Invalid card hints clarify without a write. Frontend request fields are unchanged.

**F. Authority/polarity root cause.** Business ownership previously examined raw normalized topic occurrences, including excluded facts. A small clause parser now removes explicit request exclusions before looking for positive business evidence. Question negation such as `còn hàng không` remains a positive stock question. A separate positive clause still wins, as in `không cần giá, kiểm tra tồn kho`. Review/rating evidence precedes price so `bao nhiêu sao` does not become a price question; voucher authority retains precedence for voucher amount questions.

**G. Browse-versus-selection root cause.** A targetless purpose clause introduced an unaccounted shopping verb into family interpretation. The shared language helper now separates a current request from a structurally future/purpose clause containing only a shopping verb and optional generic object. Named targets, ordinals, options, and deictic targets prevent that stripping. Browse produces the existing canonical visible snapshot and performs no cart write. Real named/ordinal selections continue through the existing add path. A focused deictic target plus a directive particle, such as `món này đi`, also supplies positive selection evidence.

**H. Location-first root cause.** Outside-checkout location ownership rejected any sentence containing transaction vocabulary, even in a vague future clause. The standalone-location check now examines the current clause. The existing location parser also recognizes subjectless `đang ở` and removes a targetless future-shopping suffix from the retained location. Slash/alphanumeric addresses and POIs remain read-only location facts outside checkout. Tests assert no cart mutation, branch selection, delivery-address promotion, or checkout start. Existing delivery-address validation and checkout location handlers remain in place.

**I. Product description/review/price contract.** Description, taste, and slow ingredient questions use RAG. Review/rating questions use the existing `PRODUCT_REVIEW` handler and `get_product_insights`; no-review responses are preserved honestly. Price questions use `PRODUCT_INFO`, including `check_price_and_stock` when a price is absent. Stock consultation uses the same existing authoritative service and reports verified outlet availability or inability to verify. Returned availability must match the requested canonical product and a successful service result. Missing ingredient/allergen evidence remains insufficient; no recipe or absence inference was introduced.

**J. Pending owner preservation.** RAG returns before the business graph. Service-side product reads resolve before card-add or option interpretation, and their renderer does not rewrite focus/snapshots or advance checkout. Full in-memory state equality is asserted for these reads, including pending products, quantity, selected options, voucher, branch candidates, quote, and pending action. The next `size lớn` turn reaches the same option-completion handler after description, review, and price consultations. Existing tests also cover real option completion and explicit final confirmation after policy consultation.

**K. Files changed.** Seven production files under `avengers-coffee-system/services/ai-service`:

- `src/rag/authority.py`
- `src/rag/product_context.py`
- `src/agents/knowledge_consultation.py`
- `src/agents/shopping_language.py`
- `src/agents/location_parser.py`
- `src/agents/order_flow_graph.py`
- `src/function_calling/tools/knowledge_tools.py`

Added: `tests/test_natural_knowledge_routing.py` and this report. No Order Service or frontend production file changed.

**L. New tests.** 147 parameterized regression cases cover canonical names, validated selected IDs, focus, unique visible snapshots, aliases/reference resolution, deictic wording, unknown products, invalid card IDs, multiple pending targets, explicit product namespaces, reviews before cart, short price questions, stock status, purpose-clause browsing with and without a visible product, location entry, exclusion polarity, mixed commands, and pending-owner preservation. Policy interrupts cover `fill_options`, `select_voucher`, `checkout_choices`, `select_checkout_choices`, `confirm_address`, `select_branch`, and `confirm_checkout`.

**M. Old tests modified.** None. The complete pre-existing suite passes unchanged.

**N. Mutation safety assertions.** Read-only tests forbid cart add/edit/remove/clear, voucher apply/remove, transactional branch selection, quote/checkout creation, and final order creation through failure-raising spies. They also compare full business state before/after product and policy reads. Browse may update its canonical visible snapshot; location facts may update read-only conversation context and an existing branch-search offer. Both assert an empty cart and no transactional promotion. Final confirmation, reconciliation/idempotency, voucher, payment, and checkout behavior remain covered by the unchanged existing suites.

**O. Full AI result.** Final `.venv/bin/python -m pytest tests -q`: **1,417 passed**, one existing LangChain pending-deprecation warning, in 9.62 seconds. The focused new/RAG/context/router run passed 298 cases; all of them are also included in the final full run. Log: `/tmp/natural-ai-final.log`.

**P. Order result.** Final `npm test -- --runInBand` with approved loopback access: **108 passed; 11 suites passed**. Log: `/tmp/natural-order-final.log`.

**Q. Build result.** Final Order Service `npm run build`: passed, exit code 0. Log: `/tmp/natural-build-final.log`.

**R. RAG reload/startup result.** Importing `main`, the graph, consultation, authority, and context modules passed; the app and graph exist. Four selected startup/reload smoke tests passed. These include mocked FastAPI startup and reload, retaining the previous healthy snapshot after a failed reload, and atomic reload behavior. These are offline smokes, not proof of live provider/DB startup. Logs: `/tmp/natural-import-smoke.log` and `/tmp/natural-startup-reload-smoke.log`.

**S. `git diff --check`.** Passed before edits and after final production changes. New tests and this report also use clean whitespace.

**T. `git diff --stat`.** Tracked production diff:

```text
 .../src/agents/knowledge_consultation.py           |  7 +--
 .../ai-service/src/agents/location_parser.py       |  5 +-
 .../ai-service/src/agents/order_flow_graph.py      | 56 +++++++++++++++++++---
 .../ai-service/src/agents/shopping_language.py     | 28 ++++++++++-
 .../src/function_calling/tools/knowledge_tools.py  |  5 +-
 .../services/ai-service/src/rag/authority.py       | 37 ++++++++++----
 .../services/ai-service/src/rag/product_context.py | 39 +++++++++++----
 7 files changed, 146 insertions(+), 31 deletions(-)
```

Ordinary `git diff --stat` excludes the untracked 331-line new regression file and this untracked report. Nothing was staged to change that accounting.

**U. Hardcoding audit.** Every changed production line was inspected. An added-line audit found zero task product names, task address/POI names, fixture IDs, demo IDs, or complete demo sentences. The additions are semantic vocabulary and small grammatical patterns operating on existing canonical catalog/context data. No new LLM router, context stack, product/location table, or frontend contract was introduced.

**V. Residual risks.** Finite deterministic grammar cannot cover all Vietnamese discourse. Catalogue/review/stock availability still depends on the live services. The existing `PRODUCT_INFO` behavior uses catalog snapshot prices when present; this patch adds no price freshness/TTL policy. Ingredient evidence depends on ingested descriptions and does not prove a full recipe. RAG evaluation remains a development fixture, not an unbiased production benchmark. Browser/live provider/database behavior remains unverified in this task.

**W. Manual browser checklist — not executed.**

1. On a product detail page, ask `vị sao?`, `có sữa k?`, and `thành phần?`; verify canonical product evidence and honest insufficiency where appropriate.
2. Before adding anything, ask review/rating, price, and stock questions; verify the correct live authority and no cart change.
3. Begin options; ask description, review, and `bao nhiêu?`; then answer `size lớn`. Verify the same product, quantity, prior options, and pending owner.
4. Browse bánh/cà phê/matcha, including `để tôi chọn` and `rồi tôi chọn`; verify visible canonical cards and no implicit add. Then select a real ordinal/name/deictic target.
5. Enter slash/alphanumeric addresses and a POI, including a vague future-shopping clause; verify read-only context and no delivery-address or branch promotion.
6. Ask a static policy question at voucher, checkout choice, saved-address confirmation, branch selection, and final-confirmation gates; verify each gate resumes unchanged.
7. Exercise QR, VNPAY, Wallet, and COD through the existing checkout UI; verify order creation requires explicit final confirmation and retries do not duplicate writes.

**X. Confirmation.** No reset, rebase, merge, pull, forced checkout, commit, or push. No unrelated user changes were overwritten. No Desktop external harness modification. No production rewrite of cart mutation, voucher, checkout, payment, order creation, or final confirmation handlers. Final HEAD and fetched origin reference remain `231ca11cd5aaabee9f9e8bc872aeb9faf83ff29b`. Automated regression evidence is green; manual/live checks remain the checklist above.
