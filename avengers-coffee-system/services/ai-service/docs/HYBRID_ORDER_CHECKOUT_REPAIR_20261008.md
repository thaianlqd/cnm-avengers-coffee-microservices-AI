# Order management and checkout follow-up repair — 2026-10-08

## Observed live evidence

Read existing ai-service logs for 12:43–13:05 Asia/Ho_Chi_Minh, together with both customer transcripts. No live inference, cancellation, reorder or payment was initiated for qualification.

- The two cancellation attempts at 12:47–12:48 failed in the interpreter: `invalid_reference_shape` at `/commands/0/args/target`, followed by exhausted request budget or another invalid format. Both logged zero business operations. The cancellation endpoint was not reached.
- The UI checkout had completed and stored the created order in durable cart state. Hybrid model context did not expose a usable reference to that order, and order grounding did not include the created order as a focus target.
- After the explicit COD choices, workflow reached `CHECKOUT_READY` and stopped. A separate customer request was needed to call `request_checkout`.
- ai-service cancellation eligibility additionally restricted cancellation to wallet orders. The current owned backend endpoint (`order-service/src/modules/thanh-toan/thanh-toan.service.ts`, `huyDonHang`) allows cancellation of new/confirmed owned orders across payment methods, checks the locked revision/state, and handles eligible refunds itself.

## Changes

- Add a server-bound `last_created` order reference only to order intents. Project available focus/last-created selectors without copying opaque order IDs from assistant prose. Persisted last-order identity remains available after another cart is started; no recent-order search is used to guess a target.
- Ground deictic focus against the active owned order preview/read or the just-created order. An unselected history list does not silently become a focus; explicit history ordinals remain frozen to that list.
- Clarify interpreter grammar for polite cancellation requests: request a preview using a selector with no `value`/`index`; final confirmation is a separate intent. Invalid references still fail closed rather than being normalized into guessed identities.
- Align cancellation eligibility, details and history messaging with backend status policy, including COD. Already-cancelled orders report that state without another cancellation write. Terminal/processing states are still blocked; backend ownership and revision remain authoritative.
- Preserve explicit order focus across cancellation/update/reorder previews and completion, allowing subsequent references to the same order. Existing later-turn confirmation, atomic reorder pricing/cart-version checks and replay protections remain in place.
- When an explicit checkout progression leaves all prerequisites ready, automatically call the existing guarded `request_checkout` to present a fresh review. The final cart/fulfillment/branch/address/payment/voucher state is used. No extra inference or order creation is performed.
- Mark the generated summary's owner turn, await a later confirmation, remove obsolete payment cards, and replace interim checkout prompts with the authoritative summary. Read-only turns never prepare a summary automatically. Failed quotes/stock checks are reported honestly while retaining confirmed customer choices.
- Treat `need_city` as an ordinary location clarification rather than a failed business operation.

## Validation

- 34 new offline regression cases in `tests/test_hybrid_order_checkout_followups.py`.
- Focused suites before final additional cases: 177 passed.
- Final complete suite: **5706 passed, 1 pre-existing skip, 2 dependency warnings**, 35.94 seconds.
- Tests ran in a Docker container with `--network none`, scripted inference and offline business fixtures. No customer order or payment was modified in live services.
- Updated existing expectations only where intended behavior changed: COD cancellation eligibility and automatic replacement of invalidated checkout summaries. Long 25-turn journey still requires one final order creation and preserves read-only state.
- Full test log: `/private/tmp/hybrid-order-checkout-full.log`. Existing live log evidence: `/private/tmp/hybrid-order-checkout-live.log`.
- Rebuilt and restarted only ai-service at approximately **13:05 Asia/Ho_Chi_Minh**. Startup completed without logged errors. `/ai/health` returned `status=ok`, `agent_architecture=hybrid`, `chat_orchestrator_mode=hybrid_commerce`, `redis_available=true`. Other services and customer data were retained.

## Manual checks after restart

1. Place a COD order, then request “sorry tôi hết tiền rồi huỷ đơn đó được không bạn”: cancellation preview should identify that created order; confirm/decline on the next turn.
2. Check a selected history order, then cancel/update/reorder “đơn đó”: preserve that explicit order focus, not the last-created order if different.
3. For dine-in/pickup, choose branch and COD after voucher resolution: show full summary immediately with confirmation controls.
4. For delivery, confirm destination and choose payment: show summary using the confirmed provider destination, including address formatting normalization.
5. Change payment after a summary: refresh review and require confirmation of the new action.

Post-deployment conversational behavior remains subject to the customer's live manual test; offline fixtures qualify server behavior and interpreter format handling.
