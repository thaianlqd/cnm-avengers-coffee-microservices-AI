# V2.5.1 manual live retest

These five tests are for the user to run against their configured provider and
Silver data. No live test was executed during implementation. Keep the existing
five inputs: question, domain, time, scope and depth. Record actual tokens and
latency; do not estimate them from character counts. Each retry is a manual click.

## 1. Exact comprehensive regression

Question:

> Đánh giá toàn diện hoạt động kinh doanh TP.HCM quý trước so với Hà Nội, phân tích doanh thu và đơn hàng, hiệu suất chi nhánh, sản phẩm, voucher và thanh toán; chỉ ra các điểm cần chú ý.

Domain: Nhiều miền dữ liệu. Time: Quý trước. Scope: Auto (the current main form
selects one value; use both cities only where a multi-value selector is available).
Depth: Phân tích toàn diện.

Expect `proposal_ready` for a valid model decision; requested work covers the
explicit business components rather than an imposed fixed template. Diagnostics:
one provider call/attempt, zero repair/fallback/escalation, zero analytical
proposal queries, zero contract rejection. If the model emits `field`, expect
`filter_field_to_dimension`; canonical `dimension` requires no such rule.
`full_domain_pack_ids` plus `compact_domain_pack_ids` must contain orders, stores,
products, promotions and payments. Strong candidate evidence contains IDs and
categories, without prompt substrings. Both provider bodies fit the configured
24k hard allowance; record actual headroom (not necessarily exactly the fixture).
On approval: zero additional provider calls and useful validated domain views,
actual scope/time, source/calculation evidence, no unsupported causes or scores.

## 2. Basic focused regression

> Top 5 sản phẩm bán chạy nhất tại thành phố Hồ Chí Minh.

Domain Auto; time Auto; scope Auto; depth Tập trung. Expect quantity-sold Top 5,
canonical city filter, all_time when no period is specified, one call and zero
repair. Products is the main detailed pack; no unrelated pack expansion. Ranking
must not be presented as a complete 100% composition without a population total.

## 3. Voucher deep analysis

> Phân tích tình hình sử dụng voucher tại TP.HCM tháng này: voucher nào được dùng nhiều, doanh thu từ đơn có voucher, tiền giảm, xu hướng và chi nhánh sử dụng nhiều.

Domain Khuyến mãi; time Tháng này; scope city Hồ Chí Minh; depth Phân tích sâu.
Expect priority-one promotions knowledge (full where budget allows), one call,
valid voucher_order_count/voucher_revenue/discount_amount operations, checked
trend and store dimensions. Different metric-owned populations must be explicit
related context with matching clock, not assumed reconciliation/share or ROI.

## 4. Payments deep analysis

> Phân tích cơ cấu và xu hướng thanh toán quý trước.

Domain Thanh toán; time Quý trước; scope Auto; depth Phân tích sâu. Expect a full
payments pack, one call, payment_count/payment_revenue, valid gateway/status
composition and trend. Approval makes zero additional provider calls; report
units and observations must come from actual results.

## 5. Shipper history safety

> Phân tích xu hướng hiệu suất shipper tháng này.

Domain Giao hàng; time Tháng này; scope Auto; depth Phân tích sâu. Current delivery
metadata is snapshot-only. Expect clarification/unsupported historical analysis,
one call maximum, zero analytical proposal queries, no fabricated weekly trend.
Use all-time/current snapshot only when the user explicitly changes the request.

## Record each live run

| Case | Proposal/status | Calls/attempts | Normalization IDs | Full/compact IDs | Larger body/headroom | Input/output tokens | Approval calls | Result notes |
|---|---|---|---|---|---|---|---|---|
| 1 | Pending | | | | | | | |
| 2 | Pending | | | | | | | |
| 3 | Pending | | | | | | | |
| 4 | Pending | | | | | | | |
| 5 | Pending | | | | | | | |

For all cases also record repair/fallback/escalation counts, rejection codes if
any, and cumulative planning input tokens (equal to that one call's input when
reported). A genuine semantic error must fail or ask for clarification locally;
it must not trigger automatic repair, provider fallback or model escalation.
Do not include keys, raw tool responses, SQL or sensitive values in shared logs.
