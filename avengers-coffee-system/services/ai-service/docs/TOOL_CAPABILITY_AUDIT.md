# Customer ordering capability audit

Stage ANY permits proposals throughout the customer BPM; handler prerequisites still decide execution. READ has no business write; WRITE changes reversible cart/draft context; FINAL_WRITE can create an order.

| Capability | Access / risk | Owner | Preconditions | Result | Stages |
| --- | --- | --- | --- | --- | --- |
| `add_to_cart` | WRITE / cart/draft context | order/menu | canonical active product; complete valid options; provider price | business_result | ANY |
| `apply_voucher` | WRITE / cart/draft context | voucher/order | fresh eligible code; current cart | business_result | ANY |
| `ask_branch` | READ / none | identity | server-owned session; validated schema | branches | ANY |
| `check_price_and_stock` | READ / none | menu/inventory | server-owned session; validated schema | products | ANY |
| `confirm_checkout` | FINAL_WRITE / order creation | order | prior fresh action; current explicit final confirmation; same fingerprint | business_result | ANY |
| `discard_pending_product` | WRITE / cart/draft context | order/draft | exact canonical staged product; no committed cart mutation | business_result | ANY |
| `filter_catalog` | READ / none | menu | server-owned session; validated schema | products | ANY |
| `find_nearest_branch` | READ / none | geo/inventory | server-owned session; validated schema | branches/locations | ANY |
| `finish_cart` | WRITE / cart/draft context | order | nonempty authoritative cart; no unfinished selected products | business_result | ANY |
| `get_applicable_vouchers` | READ / none | voucher/order | server-owned session; validated schema | vouchers | ANY |
| `get_cart` | READ / none | order | server-owned session; validated schema | cart | ANY |
| `get_cart_quote` | READ / none | order | server-owned session; validated schema | quote | ANY |
| `get_order_details` | READ / none | order | server-owned session; validated schema | order | ANY |
| `get_order_history` | READ / none | order | server-owned session; validated schema | orders | ANY |
| `get_payment_options` | READ / none | order/wallet | server-owned session; validated schema | payment_options | ANY |
| `get_product_description` | READ / none | rag | server-owned session; validated schema | evidence | ANY |
| `get_product_insights` | READ / none | reviews | server-owned session; validated schema | reviews | ANY |
| `get_product_options` | READ / none | menu | server-owned session; validated schema | options | ANY |
| `get_recommendations` | READ / none | menu | server-owned session; validated schema | products | ANY |
| `get_store_reviews` | READ / none | reviews | server-owned session; validated schema | reviews | ANY |
| `get_top_rated_stores` | READ / none | reviews | server-owned session; validated schema | branches | ANY |
| `get_user_profile` | READ / none | identity | server-owned session; validated schema | profile | ANY |
| `remove_cart_item` | WRITE / cart/draft context | order | owned current exact line | business_result | ANY |
| `remove_voucher` | WRITE / cart/draft context | voucher/order | authenticated current cart | business_result | ANY |
| `request_checkout` | WRITE / cart/draft context | order | fresh cart; voucher decided; choices/address/branch complete | business_result | ANY |
| `resolve_location` | WRITE / cart/draft context | geo | literal address/area; canonical provider resolution | business_result | ANY |
| `search_knowledge_base` | READ / none | rag | server-owned session; validated schema | evidence | ANY |
| `select_location_candidate` | WRITE / cart/draft context | geo/order | current provider candidate; immutable coordinates/address | business_result | ANY |
| `set_checkout_choices` | WRITE / cart/draft context | order | supported fulfillment/payment; invalidate dependent summary | business_result | ANY |
| `set_session_branch` | WRITE / cart/draft context | identity/inventory | current candidate; verified compatibility; customer choice | business_result | ANY |
| `skip_voucher` | WRITE / cart/draft context | voucher/order | authenticated nonempty cart; explicit customer decision | business_result | ANY |
| `track_order_status` | READ / none | order | server-owned session; validated schema | order | ANY |
| `update_cart_item` | WRITE / cart/draft context | order/menu | owned current exact line; validated absolute option/quantity patch | business_result | ANY |

## Existing executor inventory

Every legacy executor has an explicit disposition. Newly adapted capabilities above reuse existing authority; they are not a new BPM.

| Existing executor | Disposition |
| --- | --- |
| `add_to_cart` | exposed through guarded gateway |
| `apply_voucher` | exposed through guarded gateway |
| `ask_branch` | exposed through guarded gateway |
| `cancel_order` | completed-order destructive management is outside ordering migration |
| `check_price_and_stock` | exposed through guarded gateway |
| `confirm_checkout` | exposed through guarded gateway |
| `filter_catalog` | exposed through guarded gateway |
| `find_nearest_branch` | exposed through guarded gateway |
| `get_applicable_vouchers` | exposed through guarded gateway |
| `get_cart` | exposed through guarded gateway |
| `get_order_details` | exposed through guarded gateway |
| `get_order_history` | exposed through guarded gateway |
| `get_product_insights` | exposed through guarded gateway |
| `get_product_options` | exposed through guarded gateway |
| `get_recommendations` | exposed through guarded gateway |
| `get_store_reviews` | exposed through guarded gateway |
| `get_top_rated_stores` | exposed through guarded gateway |
| `get_user_preferences` | long-term preference inference is outside this session BPM |
| `get_user_profile` | exposed through guarded gateway |
| `remove_cart_item` | exposed through guarded gateway |
| `remove_voucher` | exposed through guarded gateway |
| `request_checkout` | exposed through guarded gateway |
| `search_knowledge_base` | exposed through guarded gateway |
| `set_session_branch` | exposed through guarded gateway |
| `track_order_status` | exposed through guarded gateway |
| `update_cart_item` | exposed through guarded gateway |
| `update_order` | completed-order rewriting is outside ordering migration |
