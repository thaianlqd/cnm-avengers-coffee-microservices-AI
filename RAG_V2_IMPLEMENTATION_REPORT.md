# RAG V2 implementation report

Implemented the bounded, read-only sparse RAG V2 scope. Dense retrieval is deliberately deferred. The deterministic Order BPM remains the transactional owner. No commit or push was made.

## A. Repository baseline

- Branch: `branch_thaian`.
- Actual local HEAD and rollback reference: `bde817a3fbdee9d571eb10e6e2f6ee6845058068` (`bde817a sua chatbot lan 11`).
- `git fetch origin` completed with filesystem/network permission; `origin/branch_thaian` matches that HEAD.
- Initial working tree: only the user's untracked `RAG_V2_END_TO_END_IMPLEMENTATION.md`. It was preserved.
- Baseline AI suite: **1,217 passed**. Baseline Order Service: **108 passed, 11 suites**. HTTP tests needed permission to bind localhost; the first sandbox attempt failed for that environmental reason and the permitted rerun passed.
- Pre-change characterization: sparse search/absence and pending option ownership tests passed before production edits.

## B. Current RAG architecture: audited baseline

At task start: static JSON lists plus a read-only `menu.san_pham` description query → unvalidated `{id,title,content}` documents → accent-folded title twice plus content → scikit-learn TF-IDF word unigrams/bigrams, 5,000-feature cap → cosine similarity → fixed `0.05` cutoff → string context or document list → knowledge tool → tool-result messages in the Groq agent loop → LLM answer.

`retrieve` and `search` defaulted to top 3; the tool requested 5. No chunks, entity metadata, domain filtering, reranking, dense embeddings or vector database existed. The index was lazy, in memory, and refreshed only by load/reload. DB failure retained the static documents. Errors collapsed into empty results in retrieval; the tool distinguished unavailable/not-found/error. Reload could partially replace live fields and always returned success at the HTTP boundary.

## C. Current conversation/order integration: audited baseline

The public agent delegates to `run_order_flow`, which owns pending selection, options, vouchers, fulfillment/payment, location, branches, quote and confirmation. General/model fallback could call the registered knowledge tool. The agent prompt requested knowledge lookups for static questions, but also included promotion wording. There was no dedicated observational RAG interrupt before pending-owner interpretation. RAG was already outside mandatory checkout; that remains true.

## D. Confirmed technical debt

| Item | Audit result | Implemented resolution |
|---|---|---|
| Duplicate logging import | CONFIRMED | Removed in retrieval rewrite |
| Fixed `0.05` cutoff | CONFIRMED | Configurable, evaluated `0.30` default |
| Top-k mismatch | CONFIRMED | Shared default 3, validated override 1–10 |
| Keyword-only tool instruction | CONFIRMED | Full natural question and structured filters |
| More-than-10-word truncation | CONFIRMED | Removed |
| Named-product debug SQL/logging | CONFIRMED | Removed; one generic description query |
| No metadata/chunking/filtering | CONFIRMED | Schema, chunk units and strict filters |
| Payment/promotion authority conflicts | CONFIRMED | Source cleanup and business-owner gate |
| Vietnamese `đ` normalization gap | CONFIRMED | Generic normalization handles `đ` |
| Unsafe partial reload | CONFIRMED | Build privately, publish one snapshot |

## E. Knowledge authority audit

Every original JSON record was reviewed. Repository documentation is the source of these excerpts; it is not independently verified corporate/legal policy. Numerical promises and unsupported capability claims were removed rather than promoted to runtime truth.

| Original source / record | Classification | Final disposition |
|---|---|---|
| `brand_values.json`: `brand_001` | Static brand | Retained core values; removed unverifiable sourcing/certification/daily-roasting/funding claims |
| `brand_values.json`: `brand_002` | Static vision | Retained general vision; removed dated numerical growth promise |
| `company.json`: `company_about` | Static company | Removed founding year, store-count and historical growth assertions |
| `company.json`: `company_careers` | Static careers documentation | Removed current salaries, benefits and open-position guarantees |
| `company.json`: `company_franchise` | Static franchise documentation | Retained descriptive cooperation topics; removed package prices, revenue percentages and investment assurances |
| `contact.json`: `contact_001` | Static contact | Narrowed to dedicated Contact-page hotline and UI email; removed office address, response SLA and 24/7 promises. UI phone values differ elsewhere; the dedicated Contact page is the cited source |
| `forms.json`: `survey_001` | Unsupported rewards/capability | Removed; no automatic survey reward evidence established |
| `gift_card.json`: `gift_card_001` | Slow gift-card guidance | Rewritten from actual gift-card service and collection UI: claim card, then transfer balance to wallet; no invented direct checkout/physical-card redemption or expiry promises |
| `gift_card.json`: `gift_card_002` | Unsupported security/operational promise | Removed SSL/OTP/emergency-lock assertions |
| `knowledge_base.json`: `policy_privacy_001` | Static privacy excerpt | Removed named external partners, compliance certification and automatic operational promises |
| `knowledge_base.json`: `faq_general_001` | Static FAQ | Removed universal ingredient/allergen/child-safety and paid milk-substitution assertions; explicitly requires product evidence |
| `membership.json`: `membership_001` | Slow membership guidance | Rewritten from Identity/UI contract; removed BEANS conversion, invented tiers and benefit/voucher/freeship guarantees |
| `ordering.json`: `ordering_policy_001` | Static ordering guidance | Replaced geography, delivery-time and fee/freeship claims with deterministic flow documentation |
| `ordering.json`: `ordering_policy_002` | Dynamic payment capability | Removed; runtime capability contract remains authoritative |
| `ordering.json`: `ordering_policy_003` | Static refund excerpt | Kept problem reporting and verification; removed conflicting deadlines, automatic 100% refunds and settlement SLA |

Added `promotion_policy_001` from existing voucher tools to explain general validation without asserting active promotions. The final static corpus has **13 documents / 13 chunks**. Product descriptions add DB-backed slow knowledge at runtime; none were copied into production JSON. Obvious transactional statements embedded in otherwise approved document bodies are also rejected during normalization.

## F. RAG vs transactional ownership matrix

| Information/action | Owner |
|---|---|
| Company, values, contact, general privacy/refund/careers/franchise/FAQ | Read-only RAG |
| Membership/gift-card general instructions | Read-only RAG |
| Product description/taste/explicit ingredient evidence | RAG, constrained to canonical product |
| Product identities, discovery, categories, recommendations, options | Existing Menu/catalog/product tools |
| Prices and branch stock | Existing product/inventory tools |
| Voucher list, applicability, apply/remove/replace, discount | Voucher tools and authoritative quote |
| Delivery fees/totals | Order Service quote |
| Location, branch choice/distance/availability | Existing location and branch tools |
| Runtime payment methods, QR/VNPAY/Wallet/COD, payment status | Existing checkout/payment authority |
| Cart mutation, order creation/update/cancel/status, profile changes | Existing deterministic BPM and enterprise services |

The knowledge lane has no tool executor loop and cannot invoke business writes.

## G. Implemented target architecture

Approved sources → schema validation/authority screening → normalized documents → bounded chunks → replaceable sparse retriever → domain/entity/source/authority filter → scored evidence and explicit status → tools-free LLM evidence selection → server-validated sourced sentences, or deterministic evidence/insufficient-information fallback.

Conversation routing forks into this observational lane only for positive knowledge evidence. Dynamic/mixed selections remain in the existing graph. No checkout step was added.

## H. Product consultation mapping

Existing catalog/suggestion snapshots resolve product names and ordinals. Deictic references use a unique pending product or canonical focus. Explicit names override pending focus; ambiguous/unresolved names or invalid ordinals ask for clarification. Exact normalized catalog names are used, with strict substring disambiguation; retrieval never creates or fuzzy-guesses an identity. Product evidence is filtered to `entity_type=product` and canonical `entity_id`. Conflicting supplied IDs return not-found; explicit product-domain filters are preserved.

Discovery and recommendation contracts were not changed. DB ingestion preserves `ma_san_pham` as the entity ID and selects only identifier, name and description.

## I. Active-order side-question/resume design

A six-line hook in `run_order_flow` returns knowledge consultation before the graph interprets or repairs pending owners. Existing business replay checks still run first. Clear selections, confirmations, catalog-discovery requests and mixed transactional evidence retain graph ownership. Product option values are read from existing option metadata.

Consultation does not clear, replace, refresh or consume pending state. No cart synchronization, quote creation or checkout write is executed by this lane. Tests compare the entire stored session, including cart, pending products/options/edit, voucher state, fulfillment/payment, saved-address state, branches, quote, confirmation and order ID. The existing pending TTL remains unchanged. A subsequent `L đi bạn` resumes the original option owner when L is a real option. A full checkout test demonstrates voucher skip, checkout selection, address confirmation, branch selection and one-time final order confirmation after intervening knowledge questions.

## J. Implemented normalized document schema

`id`, `title`, `content`, `source`, `domain`, `entity_type`, `entity_id`, `tags`, `volatility`, `authority`, `updated_at`.

Identity/title/content, approved domain, matching static/slow volatility and knowledge authority are validated. Product records require canonical entity metadata. Optional fields remain nullable: unknown timestamps are not fabricated. Sources name the actual repository document or DB column. Duplicate IDs/content are detected deterministically; identical descriptions for distinct product entities remain separate.

## K. Chunking design

Short records retain their document ID as one unit. Long records pack natural paragraphs/sentences into at most 1,200 content characters; oversized single lines split at word boundaries. Long chunks have deterministic `parent::chunk:NNN` IDs, `parent_id`, `chunk_index` and preserved metadata. Detected markdown/numbered section headings remain attached as `section_title`; product/document titles remain attached to every chunk and indexed. There is no artificial overlap for these structured records. All 13 current curated static records fit in one chunk each; synthetic long-policy tests exercise actual splitting and heading continuity.

## L. Retrieval V2 design

`Retriever` protocol with an injectable backend factory. Word TF-IDF unigrams/bigrams remain the baseline, capped at 12,000 features. Character word-boundary 3–5-grams add typo assistance, capped at 20,000 features. Scores combine 80% word and 20% character cosine relevance; a failed optional character build falls back to word TF-IDF. Ties sort by document ID. No neural reranker exists or is claimed.

## M. Dense/hybrid feasibility decision

**OPTION 1 IMPLEMENTED; dense backend DEFERRED.** The actual Docker image uses Python 3.11 slim; local verification uses the existing Python 3.9 environment. Compose limits AI memory to 1,024 MB. There is no established embedding provider/model/cache integration or measured dense-versus-sparse retrieval advantage in the repository. Sparse V2 passes the bounded fixture without a model download, new dependency or vector service. Adding sentence-transformers/FAISS/Chroma/Qdrant would introduce unmeasured cold-start, cache, network and memory costs. No candidate dense model is claimed as selected or benchmarked. The factory/protocol leaves a tested integration boundary for a later measured backend.

## N. Metadata filtering design

The retrieval API supports exact `domain`, `entity_type`, `entity_id`, `authority`, `source` filters and internal domain sets. Candidates are constrained before ranking/top-k, so excluded documents cannot crowd out allowed evidence. The tool always requests knowledge authority; product consults additionally enforce entity isolation. Invalid filters return an explicit error. Public tool schema exposes natural query and optional domain/entity/source context.

## O. Query handling design

Preserves the entire natural question. Normalization handles accents, `đ`, punctuation, whitespace and generic exaggerated spelling. Controlled topic/facet vocabulary lives in `knowledge_domains.json`, shared by routing and domain-alias expansion. Domain aliases augment the query; they do not replace or truncate it. Grammar separates informational product questions from exploration/discovery and imperative selections. There are no named-product, location, voucher-code or payment-provider branches in new production RAG code. Domain concepts are finite; no demo-question map was introduced.

## P. Confidence/not-found design and evaluation

`ok`, `not_found`, `unavailable`, `error`, plus tool-level `authority_required` for business-owned facts. Scores are relevance measures, not probabilities. `RAG_TOP_K` defaults to 3; `RAG_MIN_SCORE` defaults to **0.30**.

The deterministic fixture contains 55 cases: 35 supported retrieval cases and 20 ambiguous/dynamic/out-of-domain negatives. It has 37 calibration and 18 evaluation-partition cases. Threshold sweep at `.05/.12/.18/.24/.30/.36/.42` retains 23/23 calibration hits; `.50` loses one, `.60` loses nine. `.30` lies within the measured full-recall plateau while raising the original cutoff sixfold and retaining margin for corpus variation. Authority/domain gates are part of the measured system and account for rejecting dynamic/unrelated questions.

Final complete-fixture results: **55/55 routing**, **35/35 top-1**, **35/35 top-3**, **0/20 false positives**, **20/20 correct not-found/authority-required behavior**. Evaluation partition: 18/18 routing, 12/12 top-1/top-3, 0/6 false positives. These metrics measure the authority classifier and knowledge tool, not live end-to-end agent/provider behavior. This is a development/regression fixture, not an unbiased production accuracy estimate; routing improvements were developed with this fixture. Re-evaluate after meaningful product-corpus changes. Exact results and calibration counts are in `RAG_V2_EVALUATION_RESULTS.json`.

## Q. Grounding/security design

Retrieved documents are untrusted evidence. A separate `groq_chat` text completion receives only the question and selected evidence, no conversation profile/history, transaction tools or write executors. It selects complete sourced sentences in JSON. The server checks source IDs, exact quotations, sentence boundaries and retained negations/qualifiers. Invented claims are rejected. Invalid/provider-failed generation falls back to actual evidence; explicit insufficient-evidence generation stays insufficient. Missing milk/caffeine facts do not become ingredient assertions. Allergy safety is never inferred or guaranteed.

Instruction-shaped content, credential indicators and internal tool names are excluded from tool evidence. Input/output guardrails remain active. Retrieval logs use a query fingerprint, filter keys, candidate count, IDs, scores, latency and status; no user query, profile, address or DB exception body is dumped. This is a bounded trust boundary, not a claim of complete adversarial-language coverage.

## R. Exact changed files and protections

All service-relative paths below use prefix `avengers-coffee-system/services/ai-service/`. **These changes are implemented**, not future proposals.

| File | Why it changes / preserved behavior | Protection |
|---|---|---|
| `src/rag/documents.py` (new) | Validation, authority screening and chunks; no business data mutation | Schema, dynamic-content and chunk/section tests |
| `src/rag/data_ingestion.py` | Deterministic sources, canonical metadata, duplicate/source-health handling; static KB survives DB outage | Static/DB/malformed/duplicate/debug-query tests |
| `src/rag/retrievers.py` (new) | Replaceable sparse backend and word fallback; no model download | Retrieval and backend-failure tests |
| `src/rag/rag_service.py` | Structured lookup/filtering/configuration, trace and atomic reload; search/retrieve compatibility | Filter/threshold/absence/concurrent/failed-reload tests |
| `src/rag/authority.py` (new) | Read-only topic ownership; preserves transaction/discovery precedence | Routing fixture and mixed-evidence regression |
| `src/rag/knowledge_domains.json` (new) | Generic topic/facet vocabulary as data | Offline evaluation and routing regression |
| `src/rag/product_context.py` (new) | Canonical identity from existing context/catalog; no fuzzy identity from RAG | Ordinal, name override, mismatch/ambiguity tests |
| `src/rag/evaluation.py` (new) | Reproducible offline metrics; fixture products are never production ingestion | Evaluation regression test |
| `src/agents/knowledge_consultation.py` (new) | Tools-free sourced answering; preserves entire session | State snapshots, grounding/injection/negation and resume tests |
| `src/agents/order_flow_graph.py` | Six-line observational hook only; transactional nodes unchanged | Entire AI suite and real checkout after side questions |
| `src/agents/agent_service.py` | Knowledge prompt rules only; existing business prompt/logic preserved | Entire AI suite |
| `src/function_calling/tools/knowledge_tools.py` | Natural queries, canonical filters and explicit authority/status contracts; read-only API | Tool, long-query, isolation, safety tests |
| `src/function_calling/tools/__init__.py` | Server session injection for knowledge context; all other dispatch unchanged | Agent/knowledge regressions |
| `main.py` | Reload returns actual build status/counts; all other API logic unchanged | In-process startup/root/reload-success/failure smoke |
| `src/rag/raw_data/brand_values.json` | Curated static brand content/metadata | Source audit and evaluation |
| `src/rag/raw_data/company.json` | Curated company/careers/franchise content/metadata | Source audit and evaluation |
| `src/rag/raw_data/contact.json` | Traceable, narrow contact excerpt | Source audit and evaluation |
| `src/rag/raw_data/forms.json` | Removed unsupported reward record | Corpus authority regression |
| `src/rag/raw_data/gift_card.json` | Guidance reflects actual service/UI | Corpus authority regression and evaluation |
| `src/rag/raw_data/knowledge_base.json` | Removed unsupported privacy/ingredient/allergen claims | Corpus and grounding regression |
| `src/rag/raw_data/membership.json` | General guidance reflects Identity/UI | Corpus and membership evaluation |
| `src/rag/raw_data/ordering.json` | Removed stale payment/fee claims, retained general policies | Authority/routing and refund/voucher evaluation |
| `tests/test_rag_characterization.py` (new) | Pre-change sparse/pending baseline | Included in focused/full suite |
| `tests/test_rag_v2.py` (new) | New contracts and actual checkout continuation | Included in focused/full suite |
| `tests/fixtures/rag_v2_evaluation.json` (new) | Expected owners/domains/allowed evidence/not-found | Offline metrics regression |
| `tests/fixtures/rag_v2_products.json` (new) | Explicit deterministic test catalog descriptions | Offline metrics and isolation |
| `tests/test_chat_flow_safety.py` | Strengthened one knowledge safety test to prohibit the transactional model loop entirely and assert unchanged cart/clarification | Full suite; no business assertion weakened |

Root additions: this report and `RAG_V2_EVALUATION_RESULTS.json`. The user's implementation brief remains unchanged.

## S. Files intentionally untouched

`src/common/cart_manager.py`, `checkout_service.py`, `inventory_validation.py`, `runtime_config.py`, `groq_service.py`; `src/agents/tier1.py`, option/payment/location/selection/pending helpers; authoritative cart/product/voucher/branch/order/user tools; every Order/Identity/Menu/Inventory business-service source; requirements, Dockerfile/compose, gateway and frontend. Existing option defaults, atomic cart operations, voucher semantics, quote authority, location handling, idempotency, QR/SePay/VNPAY/Wallet/COD are protected by the unchanged regression suites.

## T. Added/adjusted tests

Pre-change characterization plus new ingestion/schema/chunking/filtering/natural-query/canonical-isolation/authority/failure tests; seven complete pending-state snapshots; option resume for both `size L đi bạn` and `L đi bạn`; actual checkout through voucher/choices/address/branch/final confirmation after side questions; confirmation replay creates exactly once; unsupported ingredients/allergy, injected instructions, fabricated claims and removed negations; PII-safe trace; atomic concurrent reload and failed/partial reload retention; word-backend fallback; evaluation fixture; FastAPI lifespan/root/reload smoke. One existing safety test was strengthened for the isolated lane.

## U. Verification executed

| Check | Result |
|---|---|
| Baseline AI | 1,217 passed |
| Baseline Order | 108 passed / 11 suites |
| Focused RAG tests | Included and passed in final full suite |
| Final full AI (`.venv/bin/python -m pytest tests -q`) | **1,270 passed**, existing LangGraph deprecation warning |
| Targeted cart/order/voucher/checkout/location tests | Included in full suite; green |
| Final Order (`npm test -- --runInBand`) | **108 passed / 11 suites** |
| Order build (`npm run build`) | PASS |
| Python import/compile smoke | PASS; bytecode cache needed filesystem permission |
| FastAPI startup/root and reload smoke | PASS, in process; unrelated DB/model startup dependencies stubbed |
| RAG reload failure and concurrent-reader smoke | PASS; previous healthy snapshot retained |
| Offline 55-query evaluation | PASS; results artifact present |
| Final whitespace/scope diff review | PASS |
| Live database/product corpus, Groq generation, browser, live payment provider | **NOT RUN** |
| Docker build / full deployment startup | **NOT RUN**; no dependency or image changes |

Commands were run using the existing local environment and existing Node dependencies. Test/build logs are under `/tmp/rag-v2-*.log` for this session. No external payment, cart, order or profile writes were made during verification.

## V. Manual browser acceptance matrix

All browser rows are **NOT RUN**; corresponding deterministic boundaries are exercised offline where stated. Use a real catalog product with populated description for B/F/J.

| Scenario | Expected result |
|---|---|
| A: Ask refund policy | Sourced policy explanation, no transaction |
| B: Ask an exact catalog product's taste | Canonical identity + entity-filtered description; no cart write |
| C: Ask product price | Existing authoritative product/price path |
| D: Ask whether product is in stock | Existing inventory/business path |
| E: Ask for refreshing recommendations | Existing recommendation/catalog path |
| F: During size prompt ask taste, then `L đi bạn` | Pending options preserved; real L option resumes |
| G: During voucher choice ask points policy, then skip voucher | Pending voucher survives; original flow continues |
| H: During final confirmation ask refund, then agree | No order during policy question; one order after confirmation/retry |
| I: Ask current Momo support | Runtime payment authority; no stale knowledge assertion |
| J: Ask undocumented ingredient/allergen | Honest missing evidence; no safety guarantee |

F/G/H have explicit automated consultation/resume coverage. QR/VNPAY/Wallet/COD remain covered by existing service/AI regression tests; no live-provider result is claimed.

## W. Deployment/resource impact

No dependencies, vector service, GPU, model files or runtime embedding download added. Existing scikit-learn/numpy are reused. A warmed local build of the 13 static documents measured approximately **9 ms**; sparse matrix payloads measured **61,816 bytes** (not total process memory or cold import time). DB corpus size and cold imports can change these numbers. Retrieval is lazy as before. The existing DB connection timeout still bounds unavailable-source ingestion; offline static retrieval works. Generation uses the existing Groq text API when available and sourced fallback when unavailable. Model startup and unrelated ML training were not changed.

## X. Risks and rollback strategy

The fixture is small and developed locally; novel language may fall through to existing read-only model/catalog handling or ask clarification. Exact canonical identity intentionally favors safe clarification over fuzzy product guesses. Sparse corpus/IDF changes require re-evaluation; thresholds are environment-configurable. Curated excerpts do not prove a full externally approved corporate policy, complete ingredient list or allergy safety. Body screening detects obvious dynamic claims, not every possible sentence. Reload is explicit, not live CDC; `built_at` records index freshness and `updated_at` stays unknown where absent.

Rollback reference is the actual initial HEAD above. Review/revert only the implementation diff or restore these specific files from that reference, preserving the user's brief and any subsequent user edits. Remove only the listed new artifacts if rollback is chosen. No schema, migration or transactional data rollback is required. No reset, rebase, forced checkout, clean, merge or pull was executed.

## Y. Phases executed

A: Git/test baseline, source/authority audit, pre-change characterization. B: Knowledge cleanup. C: Schema/ingestion/chunking. D: Sparse backend/filter/status contracts and dense deferral. E: Observational conversation integration/canonical mapping. F: Sourced generation/failure/security. G: Evaluation, confidence calibration, tracing and reload. H: Full AI/Order verification, startup/reload smoke and final diff review. All phases were executed in this run.

## Z. Final acceptance checklist

- PASS: RAG is read-only; no cart/order/payment/profile write capability or checkout step.
- PASS: Static/slow knowledge has traceable sources and retrieved evidence.
- PASS: Canonical context and metadata/entity filters isolate product facts; unknown identity clarifies.
- PASS: Transactional fact ownership and all existing deterministic business behavior remain protected by green regression suites.
- PASS: Pending owners survive knowledge questions and later selections resume; final confirmation creates once.
- PASS: Missing ingredients/allergy safety remain unknown; conflicting raw capability/reward claims removed.
- PASS: Small records remain intact; long policy chunks are deterministic and preserve headings/metadata.
- PASS: Full natural queries, evaluated configurable confidence, explicit failures, safe logs and atomic reload retention.
- PASS: No new named-product/location/voucher/payment-provider patch, frontend change or heavy dependency.
- PASS: Final diff limited to RAG, knowledge integration, tests and reports; user's original file preserved.
- RUN/NOT RUN distinctions are explicit in U/V. Live/browser/provider checks remain NOT RUN and are not represented as passing.
- PASS: NO COMMIT. NO PUSH.

## RECOMMENDED IMPLEMENTATION SCOPE

- **MUST HAVE — implemented:** authority/source cleanup, schema, deterministic ingestion/chunking, hardened sparse retrieval/fallback, natural-query and metadata/entity filtering, explicit confidence/failures, grounded tools-free consultation, pending-state preservation/resume, evaluation, observability, atomic reload, regression and smoke verification.
- **NICE TO HAVE — later measured improvements:** broader independently authored Vietnamese corpus/evaluation, business-approved policy/ingredient documents, optional source freshness automation and more natural sentence selection while preserving verified evidence.
- **DEFER — dense backend only:** semantic embeddings/vector index or hybrid dense/sparse retrieval until corpus benchmarks and Docker/offline/RAM/cold-start measurements demonstrate a reliable benefit. No transactional architecture work is deferred into RAG.
