# PLAN: Hoàn tất phân tích trong một lần bấm, cải thiện độ đúng và tốc độ

Ngày lập: 2026-10-09, Asia/Ho_Chi_Minh.

Trạng thái: **ĐÃ TRIỂN KHAI CANDIDATE, ĐANG NGHIỆM THU** (2026-10-09). Code, regression, orchestrator một lần bấm, Redis job ledger, cache và query scheduler đã được triển khai. Kết quả kiểm chứng chi tiết được ghi trong `AI_ONE_CLICK_IMPLEMENTATION_REPORT.md`; không suy ra tỷ lệ thành công AI thật từ test offline.

## 1. Kết quả cần đạt và cách hiểu “một lần bấm”

Người dùng nhập bài toán và bấm **Phân tích** một lần. Nếu bài toán thuộc khả năng hệ thống, rõ nghĩa và có dữ liệu, hệ thống tự lập kế hoạch, kiểm chứng, thực thi và hiển thị báo cáo. Không yêu cầu người dùng bấm lại để khắc phục lỗi diễn giải của máy chủ.

Một lần bấm không đồng nghĩa một lần gọi AI. Luồng bình thường hướng tới một lần gọi; tối đa ba lần thực sự gửi tới provider, dùng chung ngân sách cho toàn tác vụ, kể cả lỗi transport và phục hồi. Không tăng lên 4–5 lần trong đợt sửa này.

Với câu hỏi mơ hồ, ngoài khả năng, thiếu dữ liệu hoặc dịch vụ không hoạt động, kết quả phải là thông báo đúng nguyên nhân và hành động phù hợp. Không tạo số liệu để đạt mục tiêu hoàn tất. Yêu cầu quá giới hạn truy vấn phải có thông báo năng lực rõ ràng, không bị bỏ bớt rồi báo thành công đầy đủ.

Phạm vi đợt sửa: Data Platform analytics API, dashboard, metadata nghiệp vụ, quản lý tác vụ, bộ đánh giá và tài liệu cấu hình liên quan. Giữ các nguồn dữ liệu và cơ chế SQL chỉ đọc hiện có. Customer chatbot không thuộc phạm vi.

## 2. Bằng chứng hiện tại và giới hạn của bằng chứng

| Hiện trạng | Bằng chứng | Hệ quả cần giải quyết |
| --- | --- | --- |
| Request `2ec6f18ba90f41ffbe6a1e338d5cecde` thất bại sau ba lần gọi thành công | JSON chẩn đoán do người dùng cung cấp: thiếu thời gian ở bốn requirement, sau đó `repair_add_1 / analysis_kind_required`, SQL count = 0 | Lỗi diễn giải/phục hồi trước thực thi, không phải bằng chứng hết quota |
| Bộ kiểm tra yêu cầu `payment_method = TIEN_MAT` trong đề ca đối soát | `request_anchors.py` quét giá trị trên toàn danh mục; `verify_anchors` yêu cầu bộ lọc; metric ca đối soát dùng `silver.ca_doi_soat`, payment method thuộc `silver.don_hang` | Phải tái hiện và sửa nhận diện giá trị theo vai trò, đối tượng và phạm vi mệnh đề |
| “Số ca đi muộn” được diễn giải thành `shift_count` trong bản lỗi | Chẩn đoán không có `late_count`; catalog có alias “đi trễ”, chưa có “đi muộn” | Phải kiểm tra chỉ số hoặc bộ lọc tương đương thật sự, không dùng nhãn biểu đồ làm bằng chứng |
| UI có hai bước đề xuất và thực thi | `AnalyticsView.tsx`: `handleProposePlan`, `handleExecuteAiReport`; router generate yêu cầu session đề xuất | Muốn một lần bấm phải thay đổi luồng điều phối, không chỉ thay prompt |
| Đã có normalization, Redis session/lock, result artifact cache và giới hạn ba lần gọi | `hybrid_analyst_planner.py`, `session_service.py`, `result_artifact_store.py`, `provider_budget.py` | Mở rộng các thành phần này; không xây một planner hoặc cache song song |
| Query thực thi trong vòng lặp; mỗi query có EXPLAIN và SQL riêng | `hybrid_analyst_planner.py`, `analytical_query_service.py`, `sql_service.py` | Đo thời gian, khử trùng lặp, tái sử dụng connection và chạy song song có giới hạn |
| Minimum dashboard đã là 4, target 5; giới hạn 8 operations/8 charts | `AI_GLOBAL_DASHBOARD_MINIMUM_FIX.md` và capacity contract | Giữ chính sách chung, nhưng không ép dữ liệu thiếu thành đủ biểu đồ |
| Kiểm thử trước dùng scripted provider nhiều hơn AI thật | Báo cáo qualification và evaluation methodology | Test pass không được công bố là tỷ lệ AI thật hiểu đúng hoặc hoàn tất |

Không suy ra chắc chắn nguyên nhân của mọi request từ một lỗi. Mỗi giả thuyết phải có replay, đối chứng và test phân biệt trường hợp đúng/sai trước khi sửa.

## 3. Luồng đích

```text
Một lần bấm Phân tích
  → đăng ký tác vụ, kiểm tra chủ sở hữu và khóa chống gửi trùng
  → chụp phiên bản metadata, ngày tham chiếu, input và ràng buộc
  → lấy kế hoạch đã kiểm chứng còn tương thích hoặc gọi AI một lần
  → chuẩn hóa các sự kiện rõ nghĩa bằng quy tắc metadata
  → kiểm chứng toàn bộ yêu cầu, sửa có mục tiêu nếu còn thiếu
  → biên dịch SQL và kiểm chứng kế hoạch
  → nếu đầy đủ: tự thực thi; nếu thiếu: hỏi lại/đề xuất phần khả dụng
  → lấy cache hợp lệ hoặc thực thi các truy vấn chỉ đọc
  → kiểm chứng dữ liệu, dựng KPI/biểu đồ/diễn giải từ bằng chứng
  → lưu kết quả bất biến và trả báo cáo, không gọi AI diễn giải thêm
```

Tác vụ có các trạng thái: `accepted`, `planning`, `repairing`, `validating`, `executing`, `verifying`, `completed`; trạng thái kết thúc khác gồm `needs_input`, `partial_available`, `insufficient_data`, `unsupported`, `failed`, `cancelled`. `partial_available` ở bước kế hoạch không tự cho phép thực thi phần yêu cầu bị thiếu; người dùng chọn tiếp tục phần đó nếu muốn.

## 4. Gói A — Ràng buộc nghiệp vụ và phạm vi yêu cầu

### A1. Hợp đồng phạm vi dùng chung

- Tạo bản ràng buộc bất biến từ toàn bộ question, context, expectation và lựa chọn UI; giữ vị trí mệnh đề, nguồn xác định, domain, mức chắc chắn và requirement liên quan.
- Thời gian chung, thời gian riêng từng phần, bộ lọc quần thể, grouping, metric, ranking và yêu cầu công bố trạng thái có vai trò riêng. Không dùng một tập từ khóa phẳng thay cho tất cả các vai trò.
- Khi chỉ có một thời gian chung rõ nghĩa, requirement thiếu thời gian được kế thừa; requirement có thời gian trái ngược vẫn bị kiểm tra. Nhiều khoảng thời gian phải được gắn đúng phần; không áp một khoảng cho tất cả.
- Xung đột UI và câu hỏi phải theo quy tắc ưu tiên được ghi rõ trong UI. Nếu hai yêu cầu nghiệp vụ mâu thuẫn và không có quy tắc giải được, hỏi lại; không âm thầm chọn.
- Kiosk/main branch là phạm vi quần thể, phải áp vào mọi query liên quan. Trạng thái được yêu cầu để giải thích không tự trở thành grouping hoặc filter.
- Chỉ kế thừa ràng buộc nếu có bằng chứng không mơ hồ và source/path tương thích. Mọi bổ sung được ghi provenance để kiểm tra và phục hồi báo cáo.

### A2. Nhận diện bộ lọc theo ngữ cảnh

- Phân biệt giá trị nằm trong tên metric, mô tả nguồn, yêu cầu công bố trạng thái, grouping, điều kiện lọc và phủ định.
- Kiểm tra filter với nguồn/grain/đường nối của requirement cụ thể. Một dimension có thể join được chưa đủ chứng minh người dùng muốn lọc theo dimension đó.
- Không ép từ “tiền mặt” của đối soát sang phương thức thanh toán đơn hàng; vẫn nhận đúng đề “doanh thu đơn hàng thanh toán bằng tiền mặt”.
- Giá trị tồn tại ở nhiều dimension phải được phân giải bằng đối tượng và metadata; không chọn dimension đầu tiên hoặc ép AI thêm query để thỏa alias.
- Giữ phủ định, union/exclusion và entity identity. Hai voucher hoặc sản phẩm cùng tên phải còn định danh riêng.

### A3. Chỉ số có điều kiện và bao phủ đầy đủ

- Bổ sung alias nghiệp vụ có kiểm chứng, gồm “đi muộn/đi trễ”; tránh mở rộng alias quá rộng gây false positive.
- Định nghĩa `late_count` hoặc `shift_count` kèm điều kiện tương đương phải được chứng minh ở mức expression/population, không bằng goal/title.
- So sánh requested coverage với yêu cầu gốc theo từng requirement: metric, grouping, filter, time, cadence, ranking và derived calculation. Query phụ trợ không bù được yêu cầu chính bị thiếu.
- Tách đúng các metric khác source/grain/population/clock; không join để cộng lặp hoặc giả định doanh thu đơn = doanh thu sản phẩm = tiền giao dịch.

Đầu ra A: hợp đồng ràng buộc, resolver áp dụng chung và regression cho các cặp diễn đạt có nghĩa khác nhau.

## 5. Gói B — Phản hồi AI và phục hồi có tiến triển

- Giữ grammar metadata hữu hạn; AI chỉ chọn ý nghĩa, máy chủ quyết định SQL, thực thi, hỗ trợ dashboard và bằng chứng.
- Tách cấu trúc **cập nhật requirement** với **thêm requirement**. Cập nhật gửi id và trường được phép sửa; thêm mới cần id, metric/đối tượng, analysis kind, scope và các trường phụ thuộc như cadence/ranking nếu có.
- Nếu transport không hỗ trợ cấu trúc có điều kiện, xuất schema riêng cho các dạng được phép và vẫn kiểm tra nghiêm ngặt tại máy chủ. Không dựa vào mô tả bằng chữ để bảo đảm trường bắt buộc.
- Không yêu cầu AI tạo phần mới khi một trường của requirement hiện có đủ để xử lý lỗi. Một global issue phải được phân loại trước khi mở quyền addition.
- Bản sửa được áp lên bản kế hoạch đã giữ; kiểm tra trường đóng băng và toàn bộ kế hoạch sau merge. Bản sửa lỗi không thay thế bản hợp lệ trước đó.
- Cho phép giữ các cập nhật độc lập đã chứng minh hợp lệ khi một addition khác bị lỗi, chỉ khi không có phụ thuộc giữa chúng; toàn kế hoạch vẫn phải kiểm chứng lại trước SQL.
- Ghi dấu trạng thái kế hoạch và tập issue. Issue mới hoặc nhiều hơn không tự nghĩa là tiến triển; phải phân biệt hoàn tất một lỗi với phát sinh lỗi mới. Nếu một phản hồi không có tiến triển, chỉ dùng lần gọi còn lại khi còn mục tiêu sửa cụ thể và đủ thời gian; không lặp cùng payload vô ích.
- Lỗi máy chủ, SQL, artifact, schema drift không bị gửi ngược cho AI dưới dạng semantic repair. Lỗi transport và lỗi nội dung có bộ đếm riêng nhưng cùng trần ba lần gửi provider.
- Sau khi có dữ liệu, không gọi AI để tạo lại insight. Dùng narrative đã grounding để giảm latency và nguy cơ nhận xét sai.

Đầu ra B: primary/repair/delta schema đồng bộ, sửa có mục tiêu và issue history cho toàn bộ luồng.

## 6. Gói C — Một lần bấm và tác vụ không chạy trùng

- Thêm service điều phối dùng lại `propose → validate → execute → report`. Tự tiếp tục khi kế hoạch đầy đủ, scope rõ và chỉ đọc; không gọi AI lần hai chỉ vì chuyển từ proposal sang execution.
- UI mặc định là **Phân tích**; “Xem/chỉnh kế hoạch” là chức năng tùy chọn. Giữ endpoint đề xuất/duyệt cũ cho khả năng tương thích và các kế hoạch thiếu phạm vi cần lựa chọn.
- Đăng ký tác vụ trong Redis hiện có, trả `job_id` và polling trạng thái. Không giữ một HTTP request xuyên suốt AI + tám query + dựng báo cáo.
- Dùng executor có giới hạn và lease/heartbeat cho worker. Không tạo thread không giới hạn và không dùng background task không lưu trạng thái làm nguồn sự thật.
- Key chống gửi trùng theo chủ sở hữu, idempotency key và input fingerprint; cùng key nhưng khác payload bị từ chối. Double-click, reconnect, refresh, proxy retry cùng tác vụ không tạo thêm provider call/SQL.
- Kế hoạch và kết quả được checkpoint bằng reference/fingerprint. Job ledger giữ ngân sách provider đã dùng và đã dành cho attempt đang chạy; tạo lại worker không reset ngân sách.
- Worker mất giữa lúc gửi AI và lưu phản hồi là trạng thái không chắc chắn. Không tuyên bố exactly-once với provider; không tự gửi lại vô hạn. Ghi attempt đó đã tiêu ngân sách và dùng chính sách phục hồi có giới hạn hoặc kết thúc có chẩn đoán.
- Job đã hoàn tất trả artifact cũ cho retry cùng key; yêu cầu “Làm mới dữ liệu” là tác vụ mới rõ ràng. Chặn response cũ ghi đè câu hỏi mới bằng input/job/revision identity.
- Cancel dừng lập lịch query mới, hủy query đang chạy khi driver hỗ trợ và cấm publish kết quả sau deadline/cancellation. Nếu provider đã nhận request, không giả định hủy sẽ hoàn lại token.
- Polling đọc trạng thái không gọi AI/SQL. Phân biệt mất kết nối trình duyệt với thất bại backend; reconnect tiếp tục theo `job_id`.

Đầu ra C: endpoint submit/status/result/cancel, lifecycle bền vững, UI một lần bấm và test chống lặp.

## 7. Gói D — Tăng tốc trên đường chạy thực tế

### D1. Đo trước, tối ưu theo bottleneck

Tách queue, metadata, retrieval, provider, normalization/repair, compiler/preflight, SQL, artifact, verifier, serialization, network và render. Đo cold/warm cache, yêu cầu đơn giản/nhiều domain và lỗi provider. Baseline phải dùng cùng input, catalog, dữ liệu, model và điều kiện tải.

### D2. Giảm công việc trước AI

- Cache metadata index và vocabulary theo physical/catalog fingerprint; refresh bên ngoài critical path và thay snapshot nguyên tử.
- Rút candidate context theo domain và requirement; vẫn giữ định nghĩa grain, population, clock, conditional metric và full scope. Không tăng tốc bằng bỏ phần khó của câu hỏi.
- Cache kế hoạch đã kiểm chứng cho input giống hệt sau chuẩn hóa hình thức, gồm question/context/expectation/UI, owner/access scope, ngày tham chiếu, timezone và phiên bản planner/catalog. Không dùng fuzzy hoặc semantic-nearest cache để tự gán nghĩa cho đề khác.
- Plan cache không phải result cache. Kiểm tra lại tương thích metadata và resolve thời gian trước dùng; rolling range thay đổi phải làm cache miss hoặc resolve đúng theo reference mới.

### D3. Giảm thời gian SQL và kiểm chứng

- Khử query trùng bằng chữ ký scope/metric/population, giữ mapping riêng về từng requirement.
- Tái sử dụng nhóm kết quả đầy đủ cho marginal/composition khi phép cộng hợp lệ; không dùng Top N làm mẫu số toàn bộ.
- Connection pool có giới hạn toàn tiến trình và bounded concurrency, khởi đầu tối đa hai query/job. Tăng lên ba chỉ sau khi đo warehouse và tải đồng thời; không mặc định chạy tám query song song.
- Chạy query độc lập song song, giữ query phụ thuộc theo DAG. Mỗi query có state cục bộ; cập nhật diagnostics/artifact/session tại điểm merge an toàn, không chia sẻ dict mutation không khóa.
- Các query cần đối chứng mẫu số/tỷ trọng phải cùng snapshot dữ liệu. Dùng transaction/snapshot tương thích PostgreSQL và pool; không trộn cache cũ với dữ liệu mới trong một phép đối chứng. Không mở transaction dài trong lúc chờ AI.
- Giữ kiểm tra SQL chỉ đọc và preflight. Không bỏ EXPLAIN chỉ để nhanh. Gộp công việc preflight/connection hoặc tái sử dụng kết quả preflight chỉ khi điều kiện metadata/schema và thời hạn còn chứng minh được.
- Cache result theo định nghĩa query, quần thể, resolved period, timezone, catalog/access/warehouse version khi có, và thời hạn freshness. Công bố `observed_at`; “Làm mới” bỏ qua cache.
- Đo riêng overhead validation, hashing, serialization. Tái sử dụng cấu trúc bất biến đã kiểm tra trong cùng tác vụ; vẫn giữ lần đối chứng độc lập cần thiết, không bỏ kiểm tra hay tin score được lưu.
- Dùng bounded preview và artifact paging hiện có. DOCX/CSV là xuất từ kết quả đã lưu, không chặn lúc báo cáo đầu tiên xuất hiện và không chạy lại AI.

Đầu ra D: instrumentation, cache tương thích, query scheduler và báo cáo cold/warm/load benchmark.

## 8. Gói E — Dashboard và kết quả trung thực

- Giữ tối thiểu bốn view hợp lệ, mục tiêu năm; nếu đề yêu cầu năm view cụ thể thì kiểm chứng năm yêu cầu đó. Giới hạn tám query/chart không được làm mất phần chính để thêm view phụ.
- View phải khác góc nhìn nghiệp vụ; thay màu hoặc đổi loại biểu đồ của cùng phép tính không tính là thêm view.
- Scope/clock/status được hiển thị; title, tooltip, bảng và exported report dùng cùng artifact.
- Nếu không đủ dữ liệu hoặc cấu trúc không phù hợp biểu đồ, trình bày bảng/phần thiếu rõ ràng. Không tạo biểu đồ rỗng cho đủ số.
- Chọn view hỗ trợ bằng policy deterministic hiện có, theo ngân sách. Không gọi AI thêm để đạt floor.
- Nếu một query phụ trợ thất bại, có thể trả phần yêu cầu chính đã kiểm chứng với `completion_status = partial` và lý do; không báo đầy đủ. Query chính thất bại thì báo phần nào chưa làm được, không dựng insight từ yêu cầu đó.
- Lỗi scope/metric/filter/time cốt lõi chặn score số. Điểm kiểm chứng nội bộ không thay cho độ đúng đối chứng hay xác suất AI trả lời đúng.
- Lỗi cuối cùng nêu giai đoạn, phần yêu cầu, nguyên nhân, request/job id và khả năng retry; không đổ lỗi cho câu hỏi khi đó là lỗi hệ thống.

## 9. Ngân sách và mục tiêu tốc độ

Các con số dưới đây là **mục tiêu nghiệm thu đề xuất, chưa phải hiệu năng đã đo**. Đánh giá trên máy và warehouse triển khai thực tế; phân loại thời gian chờ queue/provider rõ ràng.

| Hạng mục | Chính sách/mục tiêu |
| --- | --- |
| Provider budget | Tối đa 3 lần gửi/tác vụ; bình thường 1; mọi retry/fallback nếu có đều tính chung |
| Model policy | Cố định model/version đang kiểm chứng; chưa bật escalation/fallback để che lỗi planner |
| Planning deadline | Giữ ngân sách dùng chung 28 giây hiện có, reserve deterministic; không reset khi repair |
| Full job deadline | Khởi đầu 45 giây từ lúc nhận tác vụ, gồm queue; SQL dùng thời gian còn lại, không mỗi query một ngân sách mới |
| HTTP submit | p95 ≤ 1 giây, không gồm AI/SQL; báo `busy` nếu không còn năng lực queue |
| Báo cáo đơn giản, cache cold | p95 ≤ 15 giây khi provider/warehouse hoạt động bình thường |
| Báo cáo lớn trong giới hạn 8 query | p95 ≤ 25 giây ở điều kiện bình thường |
| Báo cáo dùng plan + result cache còn hợp lệ | p95 ≤ 3 giây, vẫn kiểm tra ownership, freshness và fingerprint |
| UI | Hiển thị trạng thái tức thì; polling có backoff; không giả phần trăm tiến độ |
| Improvement | Mục tiêu giảm ≥ 30% latency trên tập so sánh tương ứng; không chấp nhận đổi độ đúng lấy tốc độ |
| Dashboard | Minimum 4, target 5; yêu cầu view cụ thể có coverage riêng |

Nếu baseline vốn nhanh hơn ngưỡng, không được chậm đi để đạt số tuyệt đối. Benchmark offline/scripted chỉ đo phần deterministic; latency AI thật phải có quan sát thật. Nếu mục tiêu chưa đạt, giữ mục đó chưa hoàn thành và ghi bottleneck, không đổi cách tính để báo pass.

## 10. Gói F — Bộ đánh giá để tránh vá riêng từng câu

### F1. Tái hiện lỗi và đối chứng

Lưu fixture đã loại bỏ dữ liệu nhạy cảm từ request lỗi: anchors, issue history, primary shape và các repair tái dựng tối thiểu. Không giả mạo raw provider output khi log không có. Tạo một case đi hết proposal/execution/report trên fixture warehouse với đáp án số liệu riêng.

Các cặp bắt buộc: đối soát tiền mặt / đơn thanh toán tiền mặt; đi muộn / tổng ca; công bố trạng thái / lọc trạng thái / nhóm trạng thái; kiosk / chi nhánh chính / cả hai; một thời gian chung / nhiều thời gian riêng / snapshot hiện tại.

### F2. Ma trận chung

- Tái sử dụng golden suite hiện có bao phủ 16 domain, bổ sung ít nhất 60 case có kỳ vọng nghiệp vụ độc lập cho các rủi ro mới; không chỉ đổi tên cùng một case.
- Bao phủ năm đề lớn đã gửi người dùng, đơn/multi-domain, phủ định, typo có nghĩa rõ, alias conditional metric, entity trùng tên, trend/ranking/share và giới hạn tám operations.
- Fault injection: JSON/schema lỗi, thiếu kind/time, delta làm mất phần đúng, no-progress repair, quota/429/timeout/reset, catalog thay đổi, Redis/warehouse mất, query lỗi, artifact hết hạn, dữ liệu rỗng/truncated/null/âm.
- Lifecycle: double-click, hai tab, key khác payload, cancel, reconnect, worker mất lease/restart, owner khác, stale revision và response cũ.
- Tải giả lập ít nhất 1/5/10 job đồng thời, đo p50/p95, queue, DB connection, deadline và tài nguyên. Đây là scripted load, không được gọi provider thật hàng loạt.
- Freeze bộ kỳ vọng, version/hash và split theo family trước khi chỉnh planner; giữ nhóm holdout chưa dùng để tune. Pass bằng coverage + oracle + dashboard, không chỉ outcome hoặc score.

### F3. Kiểm chứng AI thật có giới hạn

Sau toàn bộ test offline pass, đề xuất smoke tối đa **12 lần gửi provider tổng cộng** cho năm đề đại diện theo phạm vi người dùng duyệt, dùng credential hiện có và giới hạn của người dùng. Counter tổng phải đếm primary/repair/transport; ngừng trước khi vượt budget. Không gọi AI trong giai đoạn lập PLAN.

Đối chứng số liệu bằng SQL chỉ đọc viết riêng hoặc fixture oracle. Tách warehouse audit, model semantic test và full one-click UI test. Năm đề là smoke, **không đủ để công bố tỷ lệ thành công 98–100%**. Nếu budget hết trước khi đủ bằng chứng, ghi live qualification chưa hoàn tất, không coi scripted success thay thế.

Mục tiêu theo dõi dài hơn: ≥ 98% tác vụ rõ nghĩa, trong phạm vi và đủ dữ liệu hoàn tất trong một lần bấm; ≥ 90% không cần semantic repair. Chỉ báo tỷ lệ khi có mẫu quan sát thực, số mẫu, phân bố độ khó, phiên bản và khoảng tin cậy. Ghi riêng transport availability, semantic correctness và end-to-end success; không loại lỗi planner khỏi mẫu thành công.

## 11. Thứ tự triển khai trong một đợt sửa

| Mốc | Công việc | Điều kiện chuyển mốc |
| --- | --- | --- |
| M0 | Freeze baseline, fixture lỗi, ma trận kỳ vọng, đo stage và effective config | Tái hiện lỗi và xác định case đối chứng; không lộ key |
| M1 | Gói A: scope, filter role, conditional metric, coverage | Ca đối soát đúng; đơn tiền mặt vẫn lọc đúng; nhiều thời gian không bị đè |
| M2 | Gói B: primary/add/update/delta và recovery progress | Bản sửa không phá phần đúng; tối đa 3 calls; no-progress có chẩn đoán |
| M3 | Gói C: orchestrator, job ledger, một lần bấm, reconnect/idempotency | Một submit đủ báo cáo; duplicate không tăng calls/SQL; partial không tự được duyệt |
| M4 | Gói D: context/cache/pool/query scheduler/deadlines | Oracle khớp; snapshot đúng; deadline/cancel không để tác vụ chạy vô hạn |
| M5 | Gói E: dashboard, partial/failure/score/export | Coverage view, bảng, narrative và export cùng bằng chứng |
| M6 | Gói F: toàn bộ regression, holdout, scripted load, benchmark | Hard gate pass; cải thiện tốc độ đo được, không regression độ đúng |
| M7 | Smoke live theo budget, build và candidate deployment | Live evidence đủ trong budget hoặc ghi rõ còn thiếu; không tự tuyên bố xong |
| M8 | Kiểm tra bản triển khai, chuyển mặc định, lưu rollback/report | Test one-click trên bản chạy thật; versions/fingerprint nhất quán |

Một đợt sửa gồm nhiều mốc và kiểm chứng, không phải thay tất cả rồi kiểm tra cuối cùng. Code có thể tách thành các commit kiểm tra được; kết quả được phát hành chung sau khi mọi hard gate đạt.

## 12. Bản đồ file dự kiến

| Vùng | File/thành phần chính |
| --- | --- |
| Scope/value semantics | `services/request_anchors.py`, `value_grounding_service.py`, `semantic_candidate_service.py`, `metadata/semantic_catalog.json` |
| Primary/repair/delta | `services/analysis_intent.py`, `hybrid_analyst_planner.py`, `analytical_resolver.py`, `decision_boundary_normalizer.py` |
| Một lần bấm | `routers/ai.py`, `common.py`, `services/agent_pipeline.py`; service orchestrator/job repository mới có giới hạn rõ |
| Session/job consistency | `services/session_service.py`, `result_artifact_store.py`, job ledger Redis |
| Budget/deadlines | `services/provider_budget.py`, `agent_provider.py`, orchestrator và scheduler |
| SQL/cache/concurrency | `services/analytical_query_service.py`, `sql_service.py`, DB connection adapter trong `common.py` |
| Dashboard/coverage | `services/analysis_expansion_service.py`, `dashboard_planner_service.py`, `analysis_quality_service.py`, `analysis_coverage_service.py` |
| UI thực tế | `web-ui/src/views/AnalyticsView.tsx`, input/progress/issue components, `AnalystDashboardSummary.tsx`; kiểm tra `App.tsx` trước đổi route |
| Evaluation | `analytics-api/tests/`, `evals/`, `tools/`; tận dụng oracle/golden hiện có |
| Effective config/docs | `.env.example`, compose mapping, startup validation/status và hướng dẫn; không ghi key vào tài liệu |

Tên và ranh giới của các service mới được chốt ở M0; không duy trì hai nguồn sự thật cho scope, plan hoặc ngân sách.

## 13. Cổng nghiệm thu và điều kiện kết thúc

Các điều kiện bắt buộc, không được bù bằng điểm trung bình:

- [ ] Replay bài ca làm/đối soát đi hết tới báo cáo, số ca đi muộn và tiền mặt đúng đối tượng, toàn bộ thời gian đúng.
- [ ] Các cặp semantic contrast, phủ định, multi-time, kiosk scope và metric populations đều đúng trên oracle.
- [ ] Người dùng bấm một lần cho đề đầy đủ; không cần tự retry semantic error hoặc duyệt proposal đầy đủ.
- [ ] Luồng mơ hồ/unsupported/empty/over-capacity cho kết quả có hành động cụ thể; không bịa báo cáo.
- [ ] Toàn bộ regression backend/frontend, typecheck, build và saved-report verification pass; không bỏ test thất bại để release.
- [ ] Không có lần gọi provider thứ tư, duplicate calls do retry UI, SQL ghi dữ liệu hoặc report vượt quyền chủ sở hữu.
- [ ] Queue/query concurrency, timeout, cancel, restart và snapshot/cache consistency được kiểm tra.
- [ ] Số view phù hợp yêu cầu và dữ liệu; scope sai không nhận score số.
- [ ] Benchmark cold/warm/load có baseline, p50/p95, tokens, attempts, sample size và kết luận đạt/chưa đạt từng mục tiêu.
- [ ] Live smoke và read-only audit báo đúng phương pháp, budget và giới hạn; không dùng offline pass làm model accuracy.
- [ ] Bản triển khai chạy đúng code/config/catalog vừa kiểm chứng; one-click được kiểm tra ở UI thực tế.
- [ ] Có rollback đã thử tương thích schema/job/session; báo cáo cuối ghi tồn tại còn lại và trạng thái thực của từng mốc.

Chưa đạt điều kiện bắt buộc thì chưa gọi đợt sửa hoàn tất. Không tuyên bố “mọi bài toán chắc chắn có báo cáo”; cam kết cần kiểm chứng là xử lý nhất quán trong phạm vi công bố và giải thích đúng các ngoại lệ.

## 14. Triển khai và rollback

- Dùng cờ rollout cho one-click orchestration; giữ API đề xuất/duyệt tương thích trong giai đoạn chuyển đổi.
- Effective configuration phải thể hiện budget/deadline/model/cache/concurrency/policy version; thống nhất `.env.example` với startup policy. `ready` vẫn là readiness, thêm health counters về job/semantic failures riêng.
- Nâng phiên bản contract/planner/job/catalog khi nghĩa lưu thay đổi. Tác vụ hoặc report cũ được migrate có kiểm chứng hoặc báo cần lập lại; không âm thầm diễn giải lại scope.
- Lưu image/config/catalog trước phát hành và hướng dẫn drain/cancel worker để tránh hai phiên bản cùng thực thi một job.
- Build candidate, chạy qualification; cập nhật riêng analytics API/web khi các thay đổi cho phép, không restart dịch vụ không liên quan.
- Sau rollout kiểm tra one-click, owner isolation, budget, counts, score và p95; nếu sai scope/result hoặc job chạy trùng, tắt cờ, quay bản trước và giữ diagnostics.

Deliverables của đợt triển khai: code + regression fixtures, benchmark và evaluation artifacts, tài liệu policy/config, hướng dẫn test một lần bấm, deployment/rollback report. Tài liệu PLAN này là đầu vào triển khai, không phải bằng chứng hệ thống đã được sửa.
