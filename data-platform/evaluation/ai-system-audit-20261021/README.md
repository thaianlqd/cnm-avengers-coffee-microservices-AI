# Audit AI Data Analyst toàn luồng — 21/10/2026

**Kết luận: đã xác minh nhiều lỗi hợp đồng/phạm vi và lập PLAN sửa; chưa nghiệm thu hệ thống là đúng.** Lượt này chỉ thêm tài liệu, scripts/fixtures audit và evidence. Không sửa code sản phẩm, schema, dữ liệu nguồn, quyền hoặc cấu hình provider. Có tạo job/session/revision kiểm thử riêng; không lưu/publish báo cáo người dùng.

- [PLAN mới](../../AI_DATA_ANALYST_SYSTEM_RELIABILITY_PLAN_20261021.md)
- [GOALS cho Claude](../../AI_DATA_ANALYST_SYSTEM_RELIABILITY_GOALS_20261021.md)
- [Tóm tắt máy đọc](summary.json)
- [Kiểm tra bộ bàn giao](handoff-validation.json)
- [Audit ranking/phạm vi trước đó](../ranking-scope-audit-20261021/README.md)

## Kết quả theo tầng, không gộp thành một tỷ lệ “độ chính xác”

| Phần | Kết quả đo được | Giới hạn |
|---|---|---|
| Backend offline | Thử đủ 100 module. Tổng hợp sau recheck không cộng đôi: **1.621 testsRun; 2 failures; 7 errors/subtest errors** | Hai monolithic runs exit137, không qualified nguyên suite trong một process. Capacity đủ 8 test đã chạy riêng pass. Không suy phần trăm chính xác từ test counts. |
| Frontend utilities | **222/222 pass**, TypeScript typecheck pass | Không thay cho browser/e2e qualification của sản phẩm sau sửa. |
| Preflight API thật | **28 ca**, gồm đủ tám mission, sai tab, rare scope, malformed/unknown/secondary input | Có READY_GUIDED rồi execution reject; request xóa dữ liệu được READY_FOR_AI. Đây là findings, không phải 28 pass. |
| Guided execution | **23 ca / 16 domain đại diện**: 19 completed, 3 insufficient_data, 1 HTTP400; **0 provider calls** | Một case đại diện/domain không chứng minh tất cả metrics/ngữ cảnh trong domain. |
| Preset inventory | **41/41 preset được quảng bá trong phiên audit completed**, 0 provider calls; kỳ all_time | Registry có 53 declarations, 12 không được quảng bá cho phiên này. Không mở quyền để ép chạy. Internal quality: 39 verified, 2 partially_verified; chưa phải relevance qualification. |
| Risk deterministic | HCM tháng9: 4,68% tổng, 58/417 chi nhánh vượt ngưỡng | Overall trong ngưỡng và child groups vượt ngưỡng cùng đúng; phải diễn đạt phân biệt. |
| Oracle risk độc lập | SELECT READ ONLY + Python: **67/1.431 = 4,68%; 58/417 groups >8%** | Chỉ đối chứng metric/scope này, không tự chứng minh mọi risk signal. |
| Refine/revision | Cả phiên cũ và fresh report: preflight feedback trả409 catalog changed; chọn tỉnh hiếm từ artifact cần clarification | Không hề đến bước AI refine của các feedback đó; không ghi “AI refine chạy đúng”. |
| Live Gemini, campaign đầu | 10 logical calls / **20 physical sends**, cả10 timeout; 2 case chặn trước job | Không đo được semantic accuracy hoặc token usage/bill của10 lượt timeout; giữ nguyên campaign. |
| Live Gemini, replay có phản hồi | **12 case: 7 completed, 1 failed, 1 needs_input, 1 insufficient_data, 2 HTTP400**; 12 logical calls / 12 physical sends | Risk tái hiện semantic failure; Bottom 5 completed vẫn sai cohort. Không coi completed là correctness. |

## Findings quan trọng và receipt

1. **Scope/relevance:** Bottom5 tháng9 tổng1.071.000đ, supporting payment/trend440.072.000đ national; map cũng trộn result rows và current network. Xem audit ranking trước và PLAN I01/I02. Primary đúng không cứu được toàn báo cáo sai mục tiêu.
2. **Input/catalog:** bộ chọn city16 values nhưng nguồn có55 tỉnh doanh thu. Case `rare-five` preflight READY_GUIDED, execution `filter_value_unknown`; HCM+HN chạy được. READY_GUIDED và execution phải chung grounding authority.
3. **Risk AI:** [incident-runtime.log](incident-runtime.log) giữ planning events đúng khung giờ ảnh. `req_d6406587a461444581f5ce894f6262ce` và `req_8697ba1e55fa4321b53573fa0f9525a3`: products context, hai provider calls, INVALID_CONTRACT, repair_limit/no_progress. Không phải lỗi người dùng phải viết lại câu để né.
4. **Risk scope versus source DQ:** [risk-hcm.json](risk-hcm.json) tái hiện bảng trong ảnh. Danh mục nguồn gán cửa hàng tên “KCN Bau Bang Dinh Duong” cho HCM; không suy từ tên để kết luận SQL city filter rò. [risk-oracle.json](risk-oracle.json) đối chứng aggregate/groups, có SQL độc lập và raw denominator.
5. **Fresh refinement409:** [fresh-interactions-runtime.json](fresh-interactions-runtime.json) tái hiện với báo cáo mới, gồm valid/gibberish/unknown feedback đều bị stale-catalog check. [fingerprint-probe.json](fingerprint-probe.json) chứng minh cơ chế cache không key theo principal: unscoped388 cột, scoped375 cột, fingerprint khác nhưng preflight trả cùng cached object. Probe dùng fixture principal/policy trong process chẩn đoán riêng, không sửa auth thật. Chưa kết luận đã có data leak tới browser.
6. **Comparison false rejection:** mẫu chính thức “theo tỉnh/thành giữa Hồ Chí Minh...” bị đọc `giữa Hồ Chí Minh` thành entity. Cùng họ lỗi offline `test_comparison_score_v282` bắt từ `trên` thành tên tỉnh. Không sửa bằng whitelist thêm hai từ tại riêng template.
7. **Snapshot/capability:** relationship đã khai báo pair snapshot tài xế trong period tháng9 được READY_GUIDED nhưng runtime historical_metric_unavailable. Capability readiness phải tính metric clock và mission.
8. **Referential scope:** live case `multi-clause` bị intake bắt `này` thành tỉnh, chưa đến model. Cần typed binding cho “trong5 tỉnh này”, không bỏ mệnh đề hoặc biến thành lookup tên tỉnh.
9. **Top/Bottom:** Bottom SQL ASC đúng nhưng renderer/notes ghi Top; cần giữ direction xuyên chart/map/insight/KPI/export.
10. **Requested goal proliferation:** replay `bottom-five` tự thêm requested `store_revenue` ranking bên cạnh canonical `revenue`; companion query không có cohort predicate/binding. Phải kiểm tra cả tính hợp lệ của requested goals và scope của supporting goals, không chỉ sửa nhãn/context.

## Backend regression còn đỏ

[Kết quả từng module](offline-modules/modules.json); [rechecks](offline-rechecks/modules.json). Giữ original failures trước recheck, không ghi đè:

| Module | Còn lại | Diễn giải |
|---|---:|---|
| `test_comparison_score_v282` | 4 errors | Input gate từ chối cụm chứa “trên”; lỗi hồi quy hợp đồng ngôn ngữ cần sửa và positive/negative controls. |
| `test_natural_v26` | 1 error | Invalid analytical tool contract ở luồng legacy four-input-sections; phân tích compatibility trước khi sửa fixture/policy. |
| `test_v35_dashboards` | 1 failure, 2 subtest errors | Expected35 declarations nhưng actual53; D50/D53 fixture không có rows. Runtime all_time D50/D53 ở chiến dịch này completed. Phải cập nhật fixture theo nghĩa và thêm assertions đúng, không chỉ sửa số35 thành53 rồi coi đủ. |
| `test_workspace_v31` | 1 failure | Capabilities fixture registry hash cũ; xác minh diff semantics rồi regenerate có review. |

Lỗi môi trường đã kiểm tra lại: `test_business_coverage_corpus` ghi receipt vào read-only mount nên error; cấp **output riêng** và chạy lại2tests pass. `test_capacity_v29` bị kill trong lượt module ở768MiB; đủ8methods nguyên bản chạy mỗi process riêng ở test-container1.5GiB đều pass, không đổi assertions hoặc allocation API. Hai monolithic exit137 vẫn chưa được qualification; không xóa kết quả đó.

## Guided, presets và data-limited

- [guided-runtime.json](guided-runtime.json): seven guided mission cases (risk có endpoint riêng) +16domain representatives. `compare-guided` HTTP400; `relationship-guided` historical_metric_unavailable; survey/favorites tháng9 insufficient_data. Các outcome sau không được gộp thành model error hoặc giả0.
- [dashboard-inventory.json](dashboard-inventory.json), [dashboards-runtime.json](dashboards-runtime.json): tất cả41presets được inventory trả cho phiên này. Các declarations không được quảng bá: D17,D18,D19,D20,D21,D22,D24,D25,D26,D34,D43,D45. Inventory áp source permissions của phiên; số53registry không đồng nghĩa53 bài đều được quảng bá cho mọi tài khoản.
- D14/D15 all_time có requested queries completed nhưng thiếu chart time_series phù hợp (`no_chart_for_view`) và internal quality partially_verified. Chúng ít/no rows ở kỳ tháng9 nhưng có dữ liệu hoặc kết quả phù hợp ở all_time: hai phép thử khác period, không phải tự mâu thuẫn. Chưa đo mọi period/filter/depth của41presets.
- [preflight-runtime.json](preflight-runtime.json): 9READY_GUIDED,10NEEDS_INPUT,6READY_FOR_AI,3BLOCKED. Đây là histogram trạng thái quan sát, không phải classification accuracy; xem từng case/expected contract trong PLAN.

## Live Gemini và quyền đã xác nhận

Người dùng xác nhận rõ gửi bộ12case trong `audit_runtime.py`, cùng catalog/schema/value samples do context builder chọn, tới `generativelanguage.googleapis.com`. Không có key/password trong evidence, không chủ động gửi customer-identity records. Provider model ghi nhận `gemini-3.5-flash-lite`; không đổi provider/model/recovery policy để có một pass.

- [live-runtime.json](live-runtime.json): 10 case provider_timeout, 2case HTTP400 trước job (`compare`, `multi-clause`); mỗi case đến provider1logical/2physical. Không token usage trả về; không suy số tiền hoặc bill=0.
- Diagnostic GET root không key trả404 ~0,19s; POST generateContent body{} không key trả403 ~0,388s. Chứng minh đường HTTP cơ bản có phản hồi, không chứng minh request có key/context/model hoặc generation hoạt động; chưa xác lập nguyên nhân timeout.
- [live-canary-after-isolation.json](live-canary-after-isolation.json): replay đúng risk gốc sau khi regression được tách khỏi API. Provider phản hồi nhưng job failed `semantic_resolution_failed`, 2 logical calls/2 physical sends, 0 query. Planning event tiếp tục có `detailed_domain_ids=[products]`, INITIAL_UNDERSTANDING/CONTRACT_REPAIR, INVALID_CONTRACT và no_progress. Đây là reproduction mới của lỗi người dùng, không chỉ suy từ logs lịch sử.
- [live-after-isolation.json](live-after-isolation.json): 11 case còn lại, không chạy lại canary. Risk explicit-scope needs_input; risk-followup, overview-scoped, bottom-five, trend-scoped, composition, forecast, casual completed; relationship insufficient_data; compare và multi-clause HTTP400 trước provider.
- Gộp canary + 11 case là 12 case/12 logical calls/12 physical sends, reported 41.972 input + 1.145 output tokens. **Tổng mọi campaign: 32 physical sends**. Không cộng đôi canary, không suy bill hoặc total token usage bao gồm campaign timeout. Tách điều kiện chạy, không xóa 20attempts timeout đầu hoặc khẳng định regression load là nguyên nhân đã được chứng minh.
- [live-planning-events.json](live-planning-events.json): 20 matched events theo request ID cho hai campaign, không chứa key. Risk semantics và transport timeout là hai lớp lỗi riêng. Provider đã phản hồi trong replay, nhưng whole-report relevance trên holdout độc lập vẫn chưa được qualified.

## Dữ liệu cho Claude triển khai

- [acceptance-matrix.json](acceptance-matrix.json): **40 đặc tả ca nghiệm thu cần triển khai, chưa chạy trên sản phẩm đã sửa**; 8ca dành nhóm structural holdout. Đây là seed đã công bố cho người triển khai, không phải blind holdout đã đo; phải thêm cases độc lập chưa dùng để tuning ở G00/G09.
- [cohort-oracle-fixture.json](cohort-oracle-fixture.json): dữ liệu hoàn toàn tổng hợp, raw orders/store IDs và oracle tính bằng Python độc lập compiler. Bottom5 A–E revenue1520, national101520,6valid/8all orders, AOV1520/6; payment/daily/keyset đối chứng có sẵn. G là thiếu quan sát, có record ngoài period và hai cửa hàng cùng tên khác key.
- [audit_runtime.py](audit_runtime.py), [audit_interactions.py](audit_interactions.py), [audit_dashboards.py](audit_dashboards.py): replay API chỉ đọc. Dùng `DP_AUDIT_PASSWORD`/`DP_AUDIT_USER` do operator inject; không viết mật khẩu vào source. Scripts tạo phiên audit tạm và ghi receipts; copy sang campaign folder mới trước khi replay để giữ baseline này.
- [audit_offline_modules.py](audit_offline_modules.py): same isolation settings/IsolatedResult của runner chính thức, nhưng fresh subprocess/module. Output `/receipts`, code mountread-only, mạng tắt, không key. Rerun test ghi receipt cần outputmount riêng như đã ghi ở recheck.
- [sha256.json](sha256.json): hash receipts, scripts và fixtures tại bàn giao; source/bundle metadata nằm ở `source-baseline.json`. Không coi HEAD là mô tả đầy đủ dirtytree; đây là workspace có nhiều thay đổi sẵn, không commit/push trong audit.
- [source-baseline.json](source-baseline.json): hash source liên quan và assets thật đang phục vụ (`index-DuBdhXOv.js`, `index-CzRz9zWn.css`). Chỉ ghi nhận bundle, chưa chứng minh build/source equivalence. [handoff-validation.json](handoff-validation.json) xác nhận Python syntax, JSON, liên kết, số liệu tổng hợp, hash source và phép tính fixture độc lập; đây là QA tài liệu/evidence, không phải test sản phẩm đã sửa.

## Phần chưa được chứng minh

Chưa triển khai fixes, chưa qua G00–G12; chưa chứng minh every chart/metric/period/role đúng ý nghĩa, chưa chạy toàn bộ browser journey sau sửa, chưa có campaign đạt mọi semantic/relevance gate, chưa monolithic full suite pass. Replay provider có phản hồi là bằng chứng thực thi và lỗi hiện tại, không phải nghiệm thu hệ thống. Reconcile cũ gặp source generation change và oracle_queries0: guard `incomparable_snapshot` có ích nhưng không phải đối chứng số đúng. Không dùng receipts này để ghi sản phẩm đã đạt yêu cầu người dùng.
