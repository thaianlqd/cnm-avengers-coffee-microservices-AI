# Hybrid migration design, recorded before implementation

Starting HEAD: `3bb55d09fecbd2b251a0c03a608086ea866b0ed5`, branch `branch_thaian`, clean worktree. Recovery reference: `backup/semantic-first-3bb55d`. No reset or rollback.

The production path becomes one semantic JSON interpretation followed by deterministic commerce execution and presentation. The interpreter describes customer meaning, never executor order, prerequisites, progress roles, interrupts or workflow changes. Normal transactions require one inference; one envelope repair is permitted. No transactional synthesis. Typed UI selections require zero inference.

Keep ProductDisplaySnapshot, frozen domain references, Redis memory, Menu options, current price/stock/branch authority, voucher eligibility, fulfillment/payment separation, owned order previews, later-turn confirmation, fingerprints, idempotency and unknown-write reconciliation. Reuse those utilities unchanged. Add a business-only mode to the existing gateway to avoid constructing TurnContract/TurnAuthorization/semantic plans or calling their loops. Do not duplicate business executors.

Historical reference `460e8ab` contributes deterministic shopping/configuration/cart/voucher/fulfillment/location/payment/summary/confirmation progression and response composition, not its raw-language routing. Its source was exported read-only for comparison.

Friend reference found at `/Users/thaian/Documents/ai-agent-service.zip` (the attachment calls it `ai-agent-service(1).zip`). The archive's orchestrator, guardrails and SessionState match the inspected extracted copies. Useful ideas: bounded recent history, compact state, guarded dispatch, server-injected identity and idempotency. Rejected: substring confirmation including `có`, direct model-selected financial tools, default COD, default/first address, invented system IDs, unbounded model rotation and business facts from model prose. No credential/config file was read or executed.

Command envelope: `{kind: commands|clarification|social, commands: [{intent, args}], message: null}`; maximum four commands. Model context contains current user-visible ordinals, pending/cart summaries and at most four recent exchanges, without tool transcripts or authority tokens.

Workflow projection is derived, not stored independently: pending products, cart, voucher decision, fulfillment, destination, branch, payment, summary and order preview. A milestone is an outstanding business obligation, never the newest user's intent. Read-only topic changes preserve it; no interrupt command is necessary.

All affected domains are frozen at entry. Product batch and compound cart references ground completely before writes. Selection/configuration in one turn is supported only with an unambiguous explicit target; final confirmations cannot be mixed with another command. The interpreter JSON parser is strict, with only documented structural integer/singleton normalization. No language classifier or guessed customer choice.

Architecture flag: `AI_AGENT_ARCHITECTURE=hybrid` by default, `semantic_legacy` as an explicit temporary reference. One engine per turn; failures preserve state and do not switch engines. Existing legacy safety tests remain explicitly pinned to the reference architecture; new tests qualify the production hybrid route.

Fresh complete offline baseline: **5514 passed, 0 failed, 1 pre-existing skip, 2 warnings, 29.09s**. Network disabled; no real provider credentials. Baseline log `/private/tmp/hybrid-migration-baseline.log`.

LIVE_PROVIDER_REQUESTS = 0
