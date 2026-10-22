# Kết quả kiểm chứng AI Data Analyst ngày 22 tháng 10 năm 2026

> **Checkpoint hoàn tất đang chạy:** localhost hiện là policy `.33`, input `1.2.5`, verifier `2.8.8`; source sản phẩm đã đóng băng. Regression107module đang chạy; Word native12trang và18ca ranking/phân trang đã pass. Chưa có kết quả live33, chưa DONE. Xem [bản nghiệm thu đang chốt](AI_DATA_ANALYST_NGHIEM_THU_20261022.md) và [checkpoint](evaluation/ai-system-reliability-impl-20261021/codex-completion-checkpoint.md).
>
> Các kết quả policy29 bên dưới là **lịch sử**, không được tính thành chứng nhận cho bản33 trước khi lượt cuối kết thúc.


Goal tổng **IN_PROGRESS / NOT_QUALIFIED**. Bản localhost đang dùng plan policy `.29`, input policy `1.2.2`.
Đã hoàn tất lượt regression cuối đầy đủ và các kiểm tra hữu hạn bên dưới. Chưa đáp ứng mọi gate của PLAN; không ghi DONE hoặc ước lượng phần trăm hoàn thành.

| Hạng mục | Kết quả thực đo |
|---|---|
| Backend cuối | 105/105 module, 1.676 test; 2 failure và 3 error đều thuộc baseline, **0 lỗi mới**, source drift rỗng |
| Cách chạy | Một process/module, container riêng cùng image API, 2 CPU/1,5 GiB, network none, source chỉ đọc; chưa chứng nhận monolithic |
| Tải và độ trễ | Test tải 1/5/10 job và cả hai test p95 dưới 50 ms đều pass trong môi trường kiểm thử riêng |
| Offline semantics | 146 case, không có failure/dataset error; các hợp đồng V33 33/33 và V34 120/120 có denominator riêng |
| Web | Typecheck pass, 225/225 utility tests; một lượt Playwright đầy đủ **77 pass, 2 optional skip** |
| Browser localhost thật | **12/12**, ba độ sâu × ranking/compare/risk/trend; mở/đóng 59 nhận định, 0 yêu cầu phân tích mới, 0 AI |
| Kiểm artifact browser | 59 chart, 136 key facts; scope/query bindings và các cổng kiểm chứng quan trọng đều pass |
| Ma trận family | **63/63**: 7 nhóm chỉ số × 3 độ sâu × dữ liệu đầy đủ/ít/rỗng, tính tay từ raw records |
| Tỉnh nguồn | **55/55** tên nguồn qua preflight và execution trên fixture riêng, giữ đúng filter, 0 AI |
| A–F oracle | 6 tests pass: scope/metamorphic, payment/day chính xác, 8 all orders, AOV 1520/6; national thay đổi độc lập |
| Live Gemini | Campaign nghiệm thu policy27: **12/12 outcome đúng**, 11 completed + 1 unsupported đúng; 8/9 positive AI first-pass, 1 bounded repair, 10 physical sends, 0 timeout |
| Oracle warehouse | Campaign27 có 5 ca cùng observed generations; Bottom5 refresh policy29 cũng khớp oracle độc lập cùng observed generations |
| Word | HTTP200, nội dung/scope/nhãn preview pass; **chưa render visual** |
| I13 | Cảnh báo geography có trong báo cáo/export; không sửa dữ liệu nguồn hoặc tự suy địa chỉ từ tên cửa hàng |

Package web không khai báo script lint; không ghi một kết quả lint không được chạy.
Kết quả p95 ở 2 CPU không phải cam kết SLA cho API đang giới hạn 0,5 CPU. Thí nghiệm cùng source ở T2 cho thấy khác biệt quota CPU;
không có bản baseline code trước phiên đủ tin cậy để quy nguyên nhân lịch sử cho một thay đổi cụ thể.

## Những lỗi đã sửa thêm sau bàn giao

- Risk deep nhận snapshot hiện trạng có nhãn và budget server đúng; không mở ngoại lệ cho model/client tự khai.
- Compiler gộp lại tử/mẫu của tỷ lệ và AOV trong cohort; distinct buyers đếm trên raw population thay vì cộng distinct từng nhóm.
- Canonical fact refs cho KPI/nhận định/kết luận; chart insight được kiểm lại với artifact hiện hành; publication và export chặn scope/fact/unit sai.
- Structured scope dùng cùng grounding có giới hạn với execution, kể cả năm tỉnh hiếm.
- Bản đồ AOV dùng số đơn hợp lệ: Bottom5 1.071.000/12 = 89.250đ, tách số đơn tất cả trạng thái.
- Duplicate equivalent rankings không làm mất cohort; scalar do model thêm không trở thành tổng national; scalar national được hỏi riêng vẫn độc lập.
- Explicit dependent axes không bị model hạ thành optional. Canonical revenue không kéo theo specialized companion không được hỏi.
- “Mua hàng tháng 9” không bị hiểu thành cadence “hàng tháng”; reference “các tỉnh này” trước dấu chấm phẩy được giữ đúng.
- Word nêu rõ số dòng hiển thị/tổng kết quả, không gọi preview là toàn bộ dữ liệu.

## Các gate chưa đạt

1. **G10 first-pass:** 8/9 = 88,89%, thấp hơn mục tiêu 95% trên tập positive hữu hạn đã chạy. Không bỏ ca repaired khỏi denominator.
   Các thay đổi intake/export policy28–29 được kiểm offline/browser; chưa được dùng để tuyên bố chất lượng model live mới.
   Repair campaign kết thúc 46/48 sends; campaign qualification riêng dùng 10/36. Giữ tất cả attempts, xem accounting note.
2. **Ma trận 54 ca:** 40 ca đủ các assertions hữu hạn đã gán bằng chứng, 14 ca còn partial:
   M01, M15, M19, M32, H04, H06, H07, A01, A04, A06, A07, A12, A13, A14.
   Thiếu cụ thể nằm ở từng `unverified_assertions` trong receipt; không coi test liên quan xanh là bằng chứng cho assertion chưa chạy.
3. **Word visual QA:** thiếu bundled rendering runtime theo skill documents; chỉ kiểm nội dung XML/functionality. Không giao DOCX chưa render làm thành phẩm.
4. **I13:** cần mapping được chủ dữ liệu xác nhận. Nguồn hành chính chính thức chỉ là tham khảo, không chứng minh địa chỉ cửa hàng.

Ưu tiên tiếp theo: hoàn thiện per-clause provenance cho mọi requested goal và các entry modes; chạy các tổ hợp còn thiếu trong ma trận;
kiểm saved comparison sau narrowing quyền, exposure/encoding boundaries; render Word trong runtime phù hợp.
Chỉ mở campaign model tiếp theo khi có thay đổi hoặc giả thuyết kiểm chứng cụ thể, đóng băng denominator/ceiling trước khi gọi.
Không lặp campaign chỉ để thay kết quả đỏ bằng một lượt xanh.

## Bằng chứng để tiếp tục

- [Kết quả máy đọc được](evaluation/ai-system-reliability-impl-20261021/codex-qualification-policy29-final.json)
- [So regression với baseline](evaluation/ai-system-reliability-impl-20261021/codex-regression-policy29-final/comparison.json)
- [Ma trận 54 ca](evaluation/ai-system-reliability-impl-20261021/codex-acceptance-matrix-policy29.json)
- [Browser thật](evaluation/ai-system-reliability-impl-20261021/codex-browser-policy29-final/receipt.json)
- [Input tới task, answer, view, claim và oracle](evaluation/ai-system-reliability-impl-20261021/codex-input-task-answer-view-claim-oracle-policy27.json)
- [Bundle đang phục vụ](evaluation/ai-system-reliability-impl-20261021/codex-served-bundle-policy29-final.json)
- [Source hashes](evaluation/ai-system-reliability-impl-20261021/codex-source-policy29-final.json)
- [Nhật ký thay đổi và mọi attempts](evaluation/ai-system-reliability-impl-20261021/README.md)

Kết quả lưu trong workspace, không phụ thuộc thư mục tạm của Claude. Không cần chạy lại T1 chỉ vì receipt cũ bị mất;
chạy lại khi source thay đổi hoặc có nguyên nhân mới. Không commit/push/reset/stash/clean/restore trong phiên này.
