# PLAN mới: tính đúng đắn toàn luồng AI Data Analyst — 21/10/2026

**Trạng thái: kế hoạch triển khai cho Claude; chưa triển khai sửa sản phẩm trong lượt audit này.**

Mục tiêu: mọi đường vào cùng một bài toán phải giữ đúng nhiệm vụ, chỉ số, đối tượng, thời gian, tập xếp hạng và quyền truy cập đến tận KPI, biểu đồ, bản đồ, kết luận, tương tác và file xuất. Không nghiệm thu bằng số biểu đồ, HTTP 200, chữ “verified”, hoặc vài câu hỏi đã được vá riêng.

## 0. Handoff, quyền thực hiện và cách đọc tiết kiệm token

### 0.1. Claude bắt đầu ở đây

1. Đọc `CLAUDE.md`, `.claude/rules/data-platform.md`, `.claude/rules/token-budget.md` theo đoạn; xem working tree, giữ nguyên thay đổi đang có.
2. Đọc mục 1–3, bảng phase ở mục 13, rồi [GOALS](AI_DATA_ANALYST_SYSTEM_RELIABILITY_GOALS_20261021.md). Chỉ mở phần kỹ thuật và source liên quan phase đang thực hiện.
3. Đọc [kết quả audit](evaluation/ai-system-audit-20261021/README.md), không nạp toàn bộ JSON/log vào hội thoại. Tìm theo case ID/request ID trước.
4. Tạo test tái hiện tổng quát cho từng bất biến trước khi sửa. Sửa ở hợp đồng/dispatcher/compiler/verifier chung; không thêm nhánh theo tên TP.HCM, Ninh Thuận hoặc chuỗi lỗi người dùng vừa thử.
5. Sau mỗi phase cập nhật GOALS: đã làm, test/receipt, rủi ro còn lại, bước tiếp theo. Chỉ đánh dấu xong khi có bằng chứng tương ứng. Tiếp tục đến G12; không dừng sau lỗi đầu tiên.
   Các phase là milestone của **một goal tổng**; hoàn thành một phase không đồng nghĩa hoàn thành nhiệm vụ. Goal tổng chỉ `DONE` khi toàn bộ phase và gates cuối đạt như GOALS quy định.
   Cập nhật GOALS/checkpoint xong thì tự chuyển phase kế tiếp; không chờ người dùng duyệt hay gửi báo cáo kết thúc riêng cho từng phase. Chỉ báo cáo tổng “đã xong” sau G12 và nghiệm thu cuối. Cập nhật tiến độ ngắn khi đang làm không làm gián đoạn thực thi.
6. Đọc **mục 19 bổ sung** trước G01/G05/G06/G08/G09: hợp đồng input → output, lựa chọn biểu đồ và phần giải thích mở rộng. Đây là điều kiện nghiệm thu bắt buộc, áp dụng cả khi query đã chạy thành công.

PLAN này là tài liệu điều phối riêng cho đợt sửa tính đúng đắn toàn luồng. Các PLAN cũ vẫn là lịch sử và nguồn yêu cầu nghiệp vụ; không xóa hay giả định những phần đã tick trong đó là nghiệm thu cho các lỗi mới dưới đây.

### 0.2. Quyền người dùng đã cấp

- Người dùng yêu cầu audit tổng thể, test offline và live bằng API key, lập PLAN để Claude triển khai A–Z. Người dùng đã xác nhận cụ thể bộ 12 câu thử cùng danh mục chỉ số/chiều, schema và giá trị mẫu được context builder chọn được gửi đến **Gemini của Google, `generativelanguage.googleapis.com`**. Xem manifest trong `evaluation/ai-system-audit-20261021/audit_runtime.py`.
- Claude được dùng provider Gemini đang cấu hình để kiểm tra các luồng nghiệp vụ thuộc phạm vi này. Dùng khóa qua runtime/secret injection hiện có; **không đọc/in `.env`, không chép key/password vào PLAN, prompt, evidence hoặc log**. Hai credential slot cùng provider không đồng nghĩa hai nhà cung cấp khác nhau.
- Chỉ gửi ngữ cảnh tối thiểu cần để hiểu yêu cầu. Không tự gửi bản ghi định danh khách hàng, dữ liệu HR chi tiết, mật khẩu hoặc secret. Nếu cần mở rộng nhà cung cấp hoặc loại dữ liệu nhạy cảm ngoài phạm vi đã xác nhận, phải xác nhận riêng; không vòng qua rejection của công cụ.
- Giữ giới hạn recovery, timeout, SQL READ ONLY, quyền nguồn và ngân sách mỗi request đang có. “Test thoải mái” không phải yêu cầu bỏ guardrail, lặp mù, sửa quota, xoay key để vượt hạn mức hoặc tạo chi phí hạ tầng ngoài nhiệm vụ.
- Không commit/push/reset/stash/clean/restore; không sửa dữ liệu nguồn, tự gán lại tỉnh theo tên cửa hàng, chạy migration/GRANT, restart hàng loạt hoặc xóa volume. Nếu thiết kế cuối cần DDL/quyền mới, soạn migration và tác động để xin quyền cụ thể trước khi áp dụng.

### 0.3. Phạm vi

Bao gồm Trợ lý AI, tám mission đã khai báo (cả hai mission ẩn), báo cáo/preset dùng chung engine, danh mục “Hỏi được gì?”, scope picker, risk check, phân tích sâu rủi ro, điều chỉnh, filter/drill/back/reset/depth, map, pagination/export/save/reopen và các lớp dữ liệu ảnh hưởng ý nghĩa kết quả. Pipeline health/epoch là đầu vào tính đúng đắn; không biến đợt này thành dự án sửa Kafka/Spark/K8S hay tăng capacity không có bằng chứng.

### 0.4. Bối cảnh đủ dùng cho chat Claude hoàn toàn mới

Không cần lịch sử trò chuyện trước để bắt đầu. Đây là repository Avengers Coffee, phần cần sửa là `data-platform/analytics-api` và `data-platform/web-ui` ở localhost:8501. User đã kiểm tra Trợ lý AI/Báo cáo phân tích và thấy hệ thống đôi khi trả đúng vài số chính nhưng biểu đồ phụ, bản đồ, nhận định hoặc phần mở rộng dùng phạm vi/chỉ số khác; ba độ sâu có thể thêm chart chỉ để đủ số. Ví dụ đã đối chứng: **Bottom 5 tỉnh tháng 9/2026 tổng 1.071.000đ**, chart payment/trend phụ lấy **440.072.000đ toàn quốc**. Risk HCM tháng 9 chạy được ở đường tất định nhưng diễn giải AI route sang products rồi lỗi; refinement mới cũng có 409. Chi tiết và request IDs ở mục 1 và audit README; các con số live là baseline theo snapshot, không hard-code vào sản phẩm.

Đích cuối là **sửa code và nghiệm thu**: mọi input hợp lệ đi đến kết quả đúng ý định; mọi KPI/chart/map/bảng/claim/giải thích/export đều giữ đúng goal, metric, entity cohort, period, population và revision. Mỗi view phụ phải có ích cho câu hỏi; nếu dữ liệu thiếu thì báo thiếu. Cho phép benchmark hoặc mục tiêu quốc gia độc lập khi user thực sự yêu cầu và có nhãn/phạm vi riêng. Xem mục 3, 8, 12, 17 và 19 cho bất biến và phép thử; không suy rằng audit đã sửa sản phẩm.

Ba tài liệu bắt buộc của lượt triển khai là **[GOALS](AI_DATA_ANALYST_SYSTEM_RELIABILITY_GOALS_20261021.md)**, **PLAN này**, **[audit README](evaluation/ai-system-audit-20261021/README.md)**. Các PLAN 19–20/10 và progress cũ là lịch sử/nguồn nghiệp vụ khi cần đối chiếu, không thay ba tài liệu trên. Ma trận 40 ca cũ và [14 ca bổ sung](evaluation/ai-system-reliability-plan-addendum-20261021/acceptance-addendum.json) là đặc tả phải triển khai/đo, chưa phải test đã pass. Baseline audit là bằng chứng lỗi và giới hạn kiểm thử; có 2 backend failures/7 errors sau sharding, không gọi hệ thống đã xanh.

Tạo **một goal tổng duy nhất** trong chức năng quản lý goal nếu có; nếu không có, dùng status/checkpoint của GOALS file. G00–G12 là milestones, không đóng goal tổng từng phase. Một phiên/context kết thúc thì ghi checkpoint và tiếp tục ở phiên kế; goal tổng chỉ `DONE` sau G12, critical gates mục 12/19, regression, live/browser và bản localhost đang phục vụ đều được chứng minh. Nếu còn lỗi quan trọng, giữ `IN_PROGRESS` hoặc `NOT_QUALIFIED` với đường xử lý cụ thể.

## 1. Thực trạng đã kiểm chứng — phân biệt lỗi với giới hạn dữ liệu

Nguồn bằng chứng mới: [audit tổng thể](evaluation/ai-system-audit-20261021/README.md) và [audit xếp hạng/phạm vi](evaluation/ranking-scope-audit-20261021/README.md). Số liệu quan sát trên localhost ngày 21/10/2026, có thể thay đổi khi nguồn đồng bộ. Không đóng đinh số đếm catalog hay doanh thu này vào production/test dùng dữ liệu thật.

| ID | Mức | Bằng chứng và kết luận |
|---|---|---|
| I01 | P0 | Bottom 5 tháng 9 đúng năm tỉnh, tổng **1.071.000đ**; supporting payment/trend lại **440.072.000đ** toàn hệ thống. `filters=[]`, `cohort_query_id=null`, `purpose=context`. Kết quả có liên quan chủ đề nhưng không tập trung đúng tập đối tượng được hỏi. |
| I02 | P0 | Map lấy chỉ số từ các dòng xếp hạng, nhưng summary/directory/ghim vẫn lấy 55 tỉnh, 1.215 cửa hàng hiện tại. Trộn tập kết quả với mạng lưới rộng hơn. |
| I03 | P0 | `city.enum` và picker có 16 tỉnh; tháng 9 có doanh thu ở 55 tỉnh. Bộ lọc IN năm tỉnh Bottom được preflight báo READY_GUIDED nhưng execution từ chối `filter_value_unknown`. HCM+HN chạy được. Không phải mọi multi-select đều hỏng. |
| I04 | P0 | Logs đúng khung ảnh: risk AI lấy `detailed_domain_ids=[products]`, hai lượt INITIAL_UNDERSTANDING/CONTRACT_REPAIR, dừng `semantic_intent_invalid`/`semantic_resolution_failed`, stop `repair_limit`/`no_progress`. Xem request `req_d6406587a461444581f5ce894f6262ce`, `req_8697ba1e55fa4321b53573fa0f9525a3`. Đây là lỗi ngữ nghĩa/định tuyến; chưa chạy query báo cáo. |
| I05 | P0 | Risk deterministic cùng câu HCM tháng 9 chạy được: hủy đơn 4,68%, 58/417 chi nhánh vượt ngưỡng; deep AI là đường khác và không tương đương. Một tab đang có hai mô hình xử lý không thống nhất. |
| I06 | P0 | `refinement-preflight` trả 409 “Danh mục dữ liệu đã thay đổi” cho cả báo cáo vừa tạo mới, trước khi xét feedback. Preflight capability fingerprint quan sát `926a...`, report interaction fingerprint `920b...`, registry fingerprint cùng `3e82...`. Tái hiện cả fresh và phiên trước. Phải xác định nguồn khác biệt cache/physical/projection, không chỉ bỏ kiểm tra fingerprint. |
| I07 | P1 | Câu guided do mẫu so sánh tạo “So sánh doanh thu theo tỉnh/thành giữa Hồ Chí Minh và Hà Nội...” bị extractor bắt `giữa Hồ Chí Minh` thành tên tỉnh chưa xác minh. Không kết luận mọi câu so sánh đều hỏng; template chính thức phải round-trip được. |
| I08 | P1 | SQL Bottom dùng ASC đúng, renderer luôn thêm tiền tố “Top 5”; selection/ghi chú cũng dùng Top N. Lỗi nhãn trải qua chart, map, insight, KPI và export. |
| I09 | P1 | Ba độ sâu tháng 9 thực trả 4/6/8 biểu đồ; primary ranking giữ nguyên. Cả ba vẫn mang supporting scope toàn hệ thống. Đếm đủ view chưa chứng minh relevance/cohort. |
| I10 | P1 | Guided relationship cặp đã khai báo `total_deliveries` + `driver_rating` theo driver trong tháng 9: preflight READY_GUIDED, runtime `historical_metric_unavailable`. Cần phân biệt clock snapshot của hồ sơ với clock sự kiện giao hàng ngay khi báo khả dụng. |
| I11 | P1 | Preflight câu yêu cầu xóa dữ liệu vẫn READY_FOR_AI; lịch sử tồn tại snapshot-only cũng được báo có thể gửi. Đây là khoảng trống phân loại UX/intake; **chưa có bằng chứng SQL write chạy được**, executor hiện vẫn READ ONLY. |
| I12 | Giới hạn đúng | 15–21/10 chỉ có 10 đơn trong kho, đều HCM; 8 đơn hoàn thành doanh thu 798.500đ. N chỉ là tối đa, không tự bịa thêm bốn tỉnh doanh thu 0. Deep 2/6 do singleton; thông báo hiện quy cho mission chưa diễn đạt đúng giới hạn dữ liệu. |
| I13 | Chất lượng nguồn | Cửa hàng tên “Highlands Coffee KCN Bau Bang Dinh Duong” được `silver.chi_nhanh` gán HCM (`HC_HCM_KCN_BAU_BANG_DINH__1290`). Không thể suy từ tên để cáo buộc filter city bị rò. Phải có kiểm tra chất lượng/mapping nguồn và cảnh báo; không tự sửa giá trị theo suy đoán. |
| I14 | Live transport và semantics | Campaign đầu: 10 lượt đến Gemini timeout, 2 câu chặn trước job, 20 physical sends; giữ nguyên bằng chứng và chưa xác lập nguyên nhân. Replay riêng sau khi regression được tách khỏi API: 12 case cho 7 completed, 1 failed, 1 needs_input, 1 insufficient_data, 2 HTTP400; 12 physical sends. Risk gốc tiếp tục lấy products context và semantic_resolution_failed; Bottom 5 completed nhưng vẫn sai cohort. Completed không đồng nghĩa đúng. |
| I15 | Giới hạn kiểm thử | Full backend runner hai lượt kết thúc 137; lượt trong API có bộ đếm OOM. Giữ log, không tính pass. Chạy tiếp module trong process riêng; kết quả cuối ở audit README/modules.json. Không đồng nhất pass từng module với qualification một process chạy toàn suite. |
| I16 | P0 | Live replay `bottom-five`: câu doanh thu chuẩn sinh thêm requested ranking `store_revenue` bên cạnh `revenue`; cả các companion đều không có cohort binding. Không chỉ supporting bị sai: planner còn tự thêm mục tiêu/chỉ số chuyên biệt chưa được yêu cầu. Mỗi requested goal phải truy nguyên tới mệnh đề hoặc lựa chọn rõ của người dùng; derived goal phải có dependency/định nghĩa/nhãn, không được tự nâng thành requested. |

Probe bổ sung cho I06: trong **tiến trình chẩn đoán riêng**, cùng physical metadata có 388 cột trước projection và 375 cột sau projection theo principal fixture. `preflight_catalog()` warm khi chưa có principal vẫn trả **cùng object** sau khi principal được gắn, trong khi `AnalysisCatalog(metadata)` mới cho fingerprint khác. Cache hiện chỉ key theo catalog mtime và physical object identity, không theo quyền. Điều này chứng minh một cơ chế gây lệch authority/cache và là khoảng trống cách ly ngữ cảnh; chưa chứng minh browser đã nhận dữ liệu nhạy cảm hoặc mọi chênh fingerprint runtime chỉ do nguyên nhân này. Phải trace cả `current_principal/project_tables` và lifecycle để sửa chính xác; không xóa stale check.

Đối chứng độc lập risk: **67/1.431 đơn kết thúc = 4,68%**, 58/417 chi nhánh >8%; tổng trong ngưỡng và nhóm vượt ngưỡng có thể đồng thời đúng. AOV kỳ 7 ngày 798.500/8 = 99.812,5đ; ô “10 đơn” là mọi trạng thái. UI phải nêu rõ mẫu số, không chia doanh thu cho mọi trạng thái hoặc coi phép tính này là sai chỉ vì hai ô khác tập đơn.

## 2. Kiến trúc hiện tại và đích sửa

### 2.1. Những đường đi phải hợp nhất về nghĩa

```text
MissionInputBuilder / câu tự do / chip / bài lưu / preset / risk follow-up
  -> AnalystWorkspace + preflightPayload
  -> preflight / resolve-input
  -> analysis-jobs -> guided_context hoặc hybrid planner -> resolver
  -> approved immutable session -> query compiler -> READ ONLY snapshot
  -> response/quality/coverage -> KPI/charts/insight/export

Đường risk riêng: /risk-watch -> scope/time resolution -> risk_watch_service
Đường map riêng: /sessions/{id}/geography -> requested filters + store network
Đường sửa riêng: refinement-preflight / refine-report / workspace-revision
```

Các đường này hiện kiểm tra bằng các biểu diễn nghĩa khác nhau. Một gate hợp lệ không chứng minh các gate sau dùng cùng phạm vi; verifier hiện có thể chứng minh chart khớp query đã lập nhưng chưa chứng minh query phụ đúng tập đối tượng người dùng yêu cầu.

### 2.2. Đích kiến trúc

```text
Mọi nguồn input
  -> shared InputMeaningContract (parse + ground + authorize + capability)
  -> mission dispatcher (typed deterministic action hoặc bounded AI interpretation)
  -> immutable AnalysisTask + ScopeContext + evidence dependency graph
  -> primary selection/rank -> frozen EntityCohort
  -> relevant dependent queries trong cùng approved snapshot
  -> numerical + scope + relevance + time/clock verification
  -> một ReportContext cho chart/map/risk/text/export/interaction
```

Tận dụng `AnalysisIntentEnvelope`, `IntentRequirement`, `AnalyticalQuery`, `AnalysisSpec`, session/artifact store hiện có. Thêm version/adapter vào các boundary, tránh tạo pipeline thứ hai song song hoặc viết lại toàn bộ hệ thống một lượt. Compiler vẫn do server sở hữu; LLM không cung cấp SQL thực thi.

## 3. Bất biến bắt buộc trên mọi đường đi

1. **Cùng nghĩa:** mission, metric definition, axis, entity set, period, clock, threshold và quyền không tự đổi khi chuyển tab, apply, submit, preview, retry, refine, drill, depth, export hoặc reopen.
2. **Không mở rộng ngầm:** mọi query phụ, bản đồ và kết luận mặc định phải thuộc cohort bài toán. Benchmark rộng hơn phải có vai trò và nhãn riêng; không dùng để trả lời như kết quả của cohort.
3. **Phân tách ba loại lọc:** quyền truy cập; phạm vi người dùng; business population của từng metric. Không gom thành một WHERE dùng chung làm sai doanh thu, tỷ lệ hoặc mẫu số.
4. **Không suy số liệu từ thiếu dữ liệu:** missing/unknown khác 0, no_data khác execution_error, snapshot khác historical, accepted khác executed, đủ view khác đúng bài toán.
5. **Số liệu độc lập model:** tỷ lệ tính từ tử/mẫu, AOV từ tổng đúng population, distinct count không cộng tùy ý; chống fanout khi nối khác grain.
6. **Chọn entity bằng key:** dùng store_id/canonical geographic key, không chỉ nhãn. Mọi tập chọn gắn owner/access/schema/semantic version/revision/source epoch.
7. **Atomic publication:** chỉ công bố revision mới sau khi query + kiểm chứng hoàn tất; lỗi/cancel/timeout giữ nguyên báo cáo cũ, không dùng số liệu dở dang.
8. **Không thay guardrail để làm test xanh:** giữ auth, READ ONLY, schema allowlist, statement_timeout, privacy, provenance, ownership và stale checks.
9. **Không vá theo câu mẫu:** cùng quy tắc phải áp dụng cho tỉnh, chi nhánh, sản phẩm, voucher, tài xế, hình thức phục vụ, ca làm và mọi chiều có quan hệ đã khai báo.
10. **Công bố đúng mức kiểm chứng:** số đúng theo SQL chưa đủ; relevance hoặc cohort sai thì báo cáo chưa đạt, không hiện một nhãn “verified” chung gây hiểu đã đúng toàn bộ.
11. **Không tự thêm requested goals:** mỗi requested goal phải có nguồn từ mệnh đề, cấu hình hoặc xác nhận cụ thể. “Doanh thu” chuẩn không tự nhân thành doanh thu cửa hàng/thanh toán/sản phẩm. Derived goals phải khai báo quan hệ, định nghĩa và lý do; verifier kiểm tra cả requested lẫn supporting, không tin nhãn do planner tự gắn.

Đơn vị liên kết là **từng goal và dependency giữa goals**, không mặc định ép mọi chart của một dashboard vào cohort của chart ranking đầu tiên. Ví dụ dashboard “toàn chuỗi + Top 5 cửa hàng” có hai requested goals độc lập hợp lệ. Câu “Bottom 5 tỉnh, phân tích chi nhánh và thanh toán của các tỉnh này” có các dependent goals phải ghim cùng tập tỉnh. Validator phải phân biệt hai cấu trúc đó bằng contract, không bằng heuristic “báo cáo có Top N thì lọc mọi thứ”.

## 4. Shared InputMeaningContract và state machine

### 4.1. Nội dung tối thiểu

- `contract_version`, `request_id`, `input_origin`, `mode`, `mission`, `requested_goals`.
- Mỗi goal: metric IDs/definition versions, axis IDs, rank direction/N/partition/tie policy, explicit filters/include/exclude, periods/timezone/reference date, forecast cadence/horizon, requested output.
- `resolution`: resolved/unresolved/ambiguous cho từng slot; original span/source field, canonical value/key, evidence lookup, confidence class. Phân biệt value mention với grouping axis và comparison member.
- `authorization`: access fingerprint và allowed scope; không serialize key/token.
- `readiness`: `BLOCKED`, `NEEDS_INPUT`, `NEEDS_LOOKUP`, `READY_GUIDED`, `READY_FOR_AI`, `DATA_LIMITED`, `PROVIDER_UNAVAILABLE`. Có reason code/action đúng trách nhiệm.
- `meaning_fingerprint` tính từ nghĩa chuẩn; không dùng nguyên văn câu hỏi làm định nghĩa duy nhất. Đổi một slot phải đổi fingerprint; thay NFC/NFD/khoảng trắng tương đương không đổi nghĩa.

### 4.2. Quy tắc quyết định

- READY_GUIDED: đủ slot được xác minh và tương thích để compiler có thể lập plan; còn thiếu giá trị phạm vi thì không được READY_GUIDED như I03.
- READY_FOR_AI: chỉ xác nhận đầu vào có thể được diễn giải; UI phải nói rõ chưa có kế hoạch đã xác minh. Không hứa “đúng/hợp lệ toàn bộ”. Nếu đầy đủ structured contract thì không buộc model diễn giải lại.
- Unknown entity: lookup có giới hạn hoặc hỏi lại trước provider/SQL; không bỏ phần không hiểu để chạy toàn hệ thống.
- Chỉ số/mission/nguồn chưa hỗ trợ: trả capability decision trước khi tốn AI nếu biết chắc. Câu xóa/sửa dữ liệu chuyển `unsupported_action`, không gọi model để biến thành một phân tích vô can.
- UI time và text conflict: hiện chính sách precedence rõ và yêu cầu xác nhận khi nghĩa khác; giữ cả requested/effective period trong provenance. Không silently đổi tháng 8 thành tháng 9.
- “tại/của thành phố Hồ Chí Minh” là scope. “theo tỉnh/thành” là axis. “giữa A và B” là comparison values; từ nối không thuộc tên thực thể.
- Guided echo được sinh từ chính contract và kiểm thử round-trip bằng extractor chung. Chỉnh câu sau apply cần semantic diff: giữ phần không đổi và nêu phần đổi, không gửi một payload trộn draft mới với guided slots cũ.

### 4.3. Áp vào mọi endpoint

Áp dụng chung cho `preflight`, `resolve-input`, `analysis-jobs`, `propose-plan`, generate, risk-watch, refinement-preflight/refine-report, workspace-revision, preset/hub và follow-up. Chặn gửi trực tiếp API không qua UI cũng phải giữ nguyên bất biến. Data từ browser chỉ là yêu cầu; report/session/artifact phía server mới là thẩm quyền.

## 5. Mission dispatcher: mọi tab phải có hợp đồng rõ

| Mission | Nghĩa và kết quả bắt buộc | Không tự thêm |
|---|---|---|
| Free text | Chuẩn hóa về một/nhiều typed goals; mơ hồ thì hỏi đúng slot; multi-goal giữ quan hệ giữa các goal | Chọn domain mặc định chỉ vì không tìm thấy metric |
| Overview | Chỉ số đúng định nghĩa + tổng/diễn biến/breakdown liên quan trong scope | Cơ cấu không cộng được, snapshot giả lịch sử |
| Compare | Giữ đúng A/B, tiêu chí, cùng kỳ/grain; chênh lệch và mẫu số có nghĩa | Toàn hệ thống hoặc nhóm C lẫn vào so sánh |
| Ranking | Rank một lần trên candidate universe; trả tập key và thứ tự; mọi follow-up mặc định theo tập đó | Independent Top N khác, đổi Bottom thành Top, coi N thiếu là lỗi |
| Trend | Chronological buckets, timezone, granularity, partial-bucket/source coverage rõ | Dự báo hoặc bucket 0 do dữ liệu chưa có |
| Composition (ẩn) | Phần/tổng cùng metric, population và cohort; nhóm Other đúng; tổng 100% khi đo được | Donut cho average/distinct/ratio hoặc subset giả whole |
| Forecast | History hợp lệ, completed periods, horizon/cadence, model/backtest/interval thật | Snapshot forecast, kéo history bằng dữ liệu tương lai, correlation thành nguyên nhân |
| Risk watch | Typed signal set, threshold policy, scoped aggregates + group breaches + exposure + clock | Retrieval products mặc định, tự chọn metric rủi ro khác hoặc gộp score thiếu định nghĩa |
| Relationship (ẩn) | Pair/grain/clock được khai báo; đối chiếu mẫu, không suy nhân quả | Join fanout, trộn hồ sơ snapshot với kỳ lịch sử mà không nêu rõ |

Các tab ẩn vẫn là API contract và có dữ liệu lưu cũ; không bỏ khỏi regression chỉ vì UI hiện không có nút riêng. Nếu không đủ năng lực cho một pair/clock, bỏ khỏi picker hoặc trả NOT_APPLICABLE/NEEDS_CHOICE sớm, không quảng bá READY rồi mới chặn.

## 6. Danh mục phạm vi: authoritative, đủ và theo quyền

1. Tạo một dịch vụ value catalog dùng chung cho capabilities, picker, preflight grounding, execution, risk, map và refinement. Phân biệt enum hữu hạn thực sự với danh sách gợi ý chưa đầy đủ.
2. City/store values đến từ nguồn danh mục được cấp quyền hoặc snapshot cache có version/coverage; không giữ 16 tỉnh như whitelist mặc định cho dữ liệu có 55 tỉnh. Không nới thành “chuỗi nào cũng được”.
3. Low-cardinality: trả complete list theo quyền và cờ completeness. High-cardinality: search/pagination bounded, trả canonical key + label + disambiguation; không tải toàn bộ tên khách hàng vào LLM.
4. Giá trị được chọn từ artifact đã duyệt là bằng chứng tồn tại, nhưng vẫn kiểm tra owner/access/version; không gửi lại một vòng fuzzy matcher có thể phủ nhận chính dòng kết quả vừa trả.
5. Alias, dấu tiếng Việt, NFC/NFD, mã có dấu gạch và tên trùng: normalization chỉ phục vụ lookup, không sửa nhãn nguồn/địa bàn. Unknown không tự fuzzy sang tỉnh gần giống; ambiguous trả lựa chọn.
6. Chọn nhiều: IN cùng chiều; nhiều chiều: giao của các phạm vi. Include/exclude/cross-parent mismatch và tập rỗng phải có quyết định rõ; tuyệt đối không rơi về all khi IN=[] hoặc scope không tìm thấy.
7. Tỉnh lịch sử/địa giới 2020 đang dùng phải có mapping version và nhãn tham chiếu; không tự giả định khớp mọi thay đổi hành chính mới. Mapping cho map và query phải nhất quán.
8. Bổ sung DQ receipt cho tên/địa bàn/toạ độ đáng nghi, cửa hàng thiếu map hoặc orphan key. Hiển thị nguồn giá trị; việc sửa master data cần quy trình riêng, không đổi tỉnh từ regex tên cửa hàng.

## 7. ScopeContext và EntityCohort cho mọi biểu đồ

### 7.1. Khái niệm phải tách riêng

```json
{
  "scope_context": {
    "version": "next",
    "authorization_ref": "access fingerprint",
    "universe_filters": "user-approved candidate population",
    "period_ref": "timezone + requested/effective period + clock",
    "selection_ref": "primary rank artifact or explicit entity set",
    "metric_population_refs": "separate governed definition per measure",
    "snapshot_ref": "catalog + data epoch + revision"
  },
  "view_scope": {
    "kind": "selected_cohort",
    "cohort_ref": "server-owned immutable artifact",
    "purpose": "explain_selected_entities"
  }
}
```

Đây là đề xuất contract, không yêu cầu thay toàn bộ class bằng đúng JSON này. `universe`, `selected_cohort`, `benchmark_context`, `current_network` là các vai trò khác nhau, không thể thay bằng một boolean `related`.

### 7.2. Lập query theo dependency graph

1. Authorize + ground toàn bộ candidate scope. Compile primary ranking đúng metric/business population, period, direction, N và tie key.
2. Trong cùng approved snapshot, xác lập selected entity keys một lần. Không tính Top 5 lại riêng cho từng metric/chart. Partitioned Top N phải giữ partition key.
3. Compile các query phụ bằng cohort reference được kiểm tra: CTE/semijoin/parameterized key set theo compiler; không nhận SQL/cohort raw từ browser hoặc model. Existing `cohort_query_id`/ranked companion là điểm tái sử dụng, nhưng phải mở rộng cho khác chiều/grain, không chỉ nhiều metrics requested.
4. City cohort -> chỉ các stores thuộc city key đó -> orders/payments cùng population đã khai báo. Cần declared relationship mới chuyển cohort sang subject khác. Ví dụ customer registrations không tự được giới hạn bằng địa chỉ hồ sơ khi bài toán là khách đã mua ở 5 tỉnh.
5. Nếu không có đường áp cohort đúng nghĩa hoặc không đủ ngân sách query, bỏ view với reason typed. Không chạy rộng hơn để đủ 6/8 view.
6. Mọi stage nằm trong capacity planning: chi phí xác lập cohort, tổng số keys/rows, query dependencies, joins và source epochs. Bounded keys nhưng vượt cap phải hỏi thu hẹp, không truncate rồi gọi là full population.
7. Verify subset membership bằng IDs thực, không bằng tên chart/WHERE string. Kiểm tra key set, row-level population, multiplicity/fanout và sample/exposure.

### 7.3. Trường hợp phải định nghĩa rõ

- Top và Bottom, N=1/3/5/10/20/max, ít nhóm hơn N, ties, null label/key, zero revenue thật, không có orders, orphan store, trùng tên, âm/hoàn tiền nếu metric hỗ trợ.
- Ranking theo doanh thu nhưng xem số đơn/AOV: giữ cùng entity cohort, từng metric giữ business population riêng, nhãn và reconciliation theo đúng định nghĩa. Không ép chung trạng thái khiến số đơn toàn bộ thành số đơn hợp lệ.
- “Trong 5 tỉnh này” là referential cohort, không phải phrase phụ bị bỏ. Multi-goal cần graph dependency và binding rõ; không resolve mỗi mệnh đề độc lập rồi lấy union toàn hệ thống.
- Theo thời gian: cohort cố định từ kỳ được xếp hạng. Nếu người dùng muốn re-rank mỗi tháng thì phải có yêu cầu/operation khác và nhãn khác.
- Explicit benchmark: ví dụ so 5 tỉnh với toàn hệ thống; hiển thị hai population signatures, tỷ trọng chỉ khi mẫu số bao trùm và metric cộng được.

## 8. Relevance và ba độ sâu

### 8.1. View phải chứng minh vai trò

Mỗi chart/KPI/map/narrative có `goal_ref`, `purpose`, `scope_ref/cohort_ref`, `metric_population_ref`, `period/clock`, `evidence_ref`, `why_this_view`. Validator kiểm tra thực, không chỉ text “góc nhìn hỗ trợ”.

Ví dụ Bottom 5 tỉnh: primary ranking; xu hướng của chính tập tỉnh; cửa hàng trong tập tỉnh; phương thức phục vụ/thanh toán trong tập tỉnh; breakdown so sánh giữa năm tỉnh nếu dữ liệu đủ. “Doanh thu thanh toán” từ bảng giao dịch không được thay cho “doanh thu theo phương thức thanh toán của đơn” từ bảng đơn.

### 8.2. Độ sâu là mức mở rộng có điều kiện

- Giữ intent/primary result/scope cố định giữa focused/deep/comprehensive. Policy hiện 4/6/8 là mục tiêu tối đa theo chất lượng dữ liệu và mission, không quyền dựng filler.
- Focused: góc nhìn cốt lõi trả lời trực tiếp; deep: thêm chẩn đoán đủ bằng chứng; comprehensive: thêm tương tác/segmented trends/contribution thực sự có nghĩa.
- Mỗi độ sâu không lặp cùng query dưới nhiều chart để đủ số. Lens set phải mở rộng đơn điệu khi dữ liệu và capability tương đương; không làm mất một góc nhìn cốt lõi mà không có lý do.
- Singleton/ít mẫu/no history/source stale/incompatible clock/unsupported lens/capacity là reason khác nhau. Badge hiển thị đúng reason, không quy mọi thiếu view thành LIMITED_BY_MISSION.
- Ratio/average: không dùng total/share/funnel cộng dồn sai. Drill numerator không được biến thành population filter làm rate 100%.
- Model chỉ được đề xuất lens ID trong catalog; server chọn query/grammar dựa vào task và data shape đã kiểm tra.

## 9. Risk watch và phân tích sâu rủi ro

### 9.1. Một meaning contract cho hai nút

`Kiểm tra rủi ro (0 AI)` và `Phân tích sâu bằng AI` dùng cùng signal set, scope, time/clock, threshold version và evidence IDs. Nhánh deep có thể bổ sung explanation/lens từ cùng artifacts; không bắt đầu lại bằng request “rủi ro” thiếu metric rồi retrieval sang products.

- Default risk -> governed signal set. Câu chỉ rõ tỷ lệ hủy -> đúng signal tương ứng. Nêu ngưỡng tùy chỉnh chỉ được hỗ trợ nếu contract khai báo; nếu không hỏi lại/giữ default có nhãn, không âm thầm bỏ ngưỡng.
- RiskResult chứa overall assessment **và** group assessment. 1 signal overall red, 58 nhóm của signal khác red là hai số khác nhau. Header, bảng và summary phải diễn đạt thống nhất, không cộng group count thành signal count.
- Mọi worst entity chứa canonical key, numerator/denominator hoặc observations, clock, threshold, scope proof; không chỉ label + %. Tỷ lệ 100% của 1/1 không có cùng mức bằng chứng như 100/100; minimum sample do policy quản trị, không tự tăng/giảm threshold để đẹp dashboard.
- Các signal hiện trạng tách section “hiện trạng tại thời điểm snapshot”; không gắn inventory snapshot cho tháng 9 như dữ liệu lịch sử. Nếu người dùng yêu cầu chỉ rủi ro lịch sử, các signal này not_applicable, không bịa history.
- Failed query là execution_error, unknown source là unknown, không green. Aggregate trong ngưỡng nhưng có group red phải cảnh báo cấp nhóm; tổng hợp phải weighted theo raw exposure, không average rates.
- Follow-up là typed goal + scope/evidence context: rank worst theo bad direction, trend cùng period; không chỉ tạo câu text làm mất filter. Khi vào AI, không cần gửi toàn bộ rows/PII, chỉ compact evidence đã xác minh.
- Nếu AI narrative/interpretation lỗi, giữ bảng rủi ro đã tính được, thông báo rõ phần AI chưa xong. Không đưa người dùng vào trang “Báo cáo hoàn tất” rỗng, không yêu cầu họ diễn đạt lại câu đủ nghĩa để che lỗi server.

### 9.2. Thống kê và anomaly

Giữ nguồn và công thức hiện có khi chưa có thay đổi được duyệt. Anomaly cần history complete, exposure, certificate và baseline thực; stale/unknown không được chuyển thành không có bất thường. Snapshot/history và threshold/anomaly là các assessment độc lập có nhãn rõ.

## 10. Metadata, revision, cache và giới hạn phục hồi

1. Điều tra I06 bằng trace cả capability/report/refinement catalog builders: physical metadata source, overlay fallback, access projection, schema/semantic/version, worker/cache key và cold/warm states. Ghi diff cấu trúc không chứa secret, tìm chính xác nguồn `926a...`/`920b...`.
2. Tách schema fingerprint, semantic fingerprint, access fingerprint và source generation vector. Dữ liệu đồng bộ mới không tự được mô tả là schema đổi. Không so sánh physical catalog với overlay fallback như cùng một authority.
3. Metadata “chưa warm” phải có trạng thái rõ hoặc hydrate có giới hạn; không tuyên bố READY bằng catalog A rồi execute/repair bằng B. Cache phải scope theo access projection, không leak qua tài khoản khác.
4. Plan cache lưu nghĩa immutable, không tái dùng mutable session/revision hoặc cohort cũ qua dữ liệu khác. Result cache gắn đúng source epoch/cohort/access; đổi source data -> invalidate/recompute đúng policy, không trả số cũ không nhãn.
5. Source epoch đổi giữa report và oracle: `incomparable_snapshot` là guard đúng; không chấm pass numeric khi oracle_queries=0. Có hành động refresh tái tạo report và cohort; giữ báo cáo cũ để người dùng đọc được phiên cũ.
6. Empty/cancel/timeout/duplicate submit/idempotency conflict/stale revision/expired session/changed access phải có state machine và atomic publication. Refresh browser không tạo lại paid call nếu kết quả đã có; không replay uncertain provider outcome.
7. Repair chỉ sửa fields thật sự sai, theo typed issue graph; phân biệt missing scope/axis với conflicting field. Nếu context routing sai, sửa routing/contract trước, không gửi nguyên packet lớn lặp hai lần.
8. Giữ transport recovery một owner, logical call và physical send ledger riêng. Không tắt kiểm tra scope để vượt no_progress. Lỗi provider timeout không được gán là câu hỏi mơ hồ; không yêu cầu đổi câu khi chưa có model response.

## 11. UX/UI và các đầu ra dùng cùng ReportContext

### 11.1. Input và chỉnh cấu hình

- Phân biệt draft/applied/running/result revision. Bấm Apply hiện tóm tắt chính xác mission, N/direction, metric, axis, filter members và kỳ; đổi draft chưa Apply phải có trạng thái rõ. Đổi metric làm axis không tương thích phải báo ngay ở field.
- Select axis dùng một lựa chọn; scope values dùng multi-select có chip/count, tìm kiếm và bỏ chọn. Nêu rõ khác biệt, không để người dùng tìm multi-select trong ô axis. Không reset lựa chọn do capabilities object được refetch nhưng meaning không đổi.
- Giữ text local, không render lại toàn report/map mỗi phím. Debounce/cancel preflight theo request fingerprint, bỏ response cũ; IME tiếng Việt không mất ký tự/caret. Submit/Apply mới thực hiện phân tích, nhập chữ không gọi provider.
- Refinement composer ở flow tài liệu, không sticky đè KPI/chart. Validate cả feedback, visual changes và session context; không khóa vì fingerprint khác giữa hai authority nội bộ. Lỗi giữ draft và kết quả cũ, có retry phù hợp lỗi.
- “Hỏi được gì?” là panel/drawer có chiều rộng và vị trí ổn định, không mở trong nửa header khiến khoảng trống lớn. Danh mục/search/category/detail căn hàng; mở một mục không đẩy lệch mọi cột. Danh mục cho biết historical/snapshot, source readiness và filters thật sự hỗ trợ.

### 11.2. Charts/map/risk/text/export

- Typography có tokens thống nhất: body khoảng 13–14px, caption 11–12px, section 16–20px; chart axes/legend không phóng theo toàn SVG. Không dùng một global font override sửa mọi chart mà làm hỏng map/export.
- Chiều cao plot có giới hạn, responsive theo container; chart rộng toàn hàng không được phóng chữ/điểm/legend lên gấp đôi. KPI unit không làm số tràn ô. Ưu tiên bố cục theo vai trò/thông tin, không hard-code tất cả 50/50 hoặc 33/66.
- Line chart có margin trái đủ cho tick, đơn vị ngắn, date ticks theo mật độ, chronological sort, hover exact value. Không làm mượt gây overshoot/range giả; không nối missing thành 0, phân biệt kỳ chưa hoàn tất, dự báo và history. Hai điểm dữ liệu phải được thể hiện như hai quan sát, không giả một chuỗi dày.
- Map mặc định fit/highlight đúng result cohort, ghim/search/list/KPI cùng tập đó. Có thể giữ nền địa lý quốc gia nhưng ngoài cohort được làm nền, không trộn pin/tổng vào mặc định. Nút “Xem toàn mạng lưới” phải là mode rõ, có scope riêng và không thay số report.
- Top/Bottom, ascending/descending, requested N/actual N phải đúng cả chart title, rank index, map selector, insight, KPI, export và accessibility labels.
- Export/preview/save/reopen giữ cùng evidence version/cohort/period; không tự chạy query toàn hệ thống để tạo file. Không export SVG/phần chart đang paginate như thể đó là toàn bộ artifact.
- Narratives/recommendations không suy nhân quả, không trộn payment settlement với order revenue, không kết luận ngoài cohort. LLM viết narrative chỉ từ fact IDs, không tạo số; deterministic verifier loại bỏ câu không có evidence.

## 12. Ma trận kiểm thử và chuẩn nghiệm thu

### 12.1. Tầng kiểm thử

| Tầng | Mục đích | Bằng chứng bắt buộc |
|---|---|---|
| Offline grammar/contract | Tách scope/axis/compare, invalid/unknown values, mode transitions | Corpus expected meaning do oracle chỉ định; HTTP/DB forbidden |
| Offline compiler/fixture | Numerical + cohort + grain + denominator | Fixture độc lập, property/metamorphic checks, row-key membership |
| Integration API | Preflight→job→revision→map→refine→export, auth/caches/epochs | Request IDs, immutable artifacts, SQL/query counts, provider ledger |
| Warehouse oracle READ ONLY | So đối chứng dữ liệu thật | SQL viết độc lập với compiler, cùng snapshot hoặc nói rõ incomparable |
| Live Gemini | Chất lượng diễn giải/repair trên cùng payload thật | Logical calls/physical sends, usage nếu có, typed failures, first-pass/repair outcomes |
| Browser | Draft/apply, IME, loading, race, bố cục, map/chart tương tác | Screenshot + DOM/AX + API payload, source/bundle hash |

Không dùng SQL compiler làm oracle cho chính compiler, không dùng assertion “title chứa revenue” để thay kiểm tra population, không gọi một response 200 là pass. Cấm HTTP/DB trong offline test; live tách ledger và cấp quyền rõ.

### 12.2. Ma trận các chiều

- Mission: tất cả tám mission khai báo + free text; visible/hidden, chip, guided echo, saved question, preset, risk follow-up.
- Input: có dấu/không dấu/NFC/NFD, dấu câu, informal Vietnamese, quoted name, mã thật, tên trùng, typo/unknown, phủ định, nhiều mệnh đề và tham chiếu “nhóm này”. English nếu công bố hỗ trợ; ngôn ngữ ngoài capability phải nói rõ.
- Meaning: explicit/implicit metric; unsupported profit/causal requests; sum/count/distinct/average/ratio/snapshot; exact status policy và null/0.
- Scope: all, một/nhiều tỉnh, một/nhiều stores, rare values, authorized subset, region, include/exclude, hai chiều giao nhau, empty intersection, unknown member, mixed parent city/store, identity label collisions.
- Rank: Top/Bottom/ties/partitioned/actual<N/zero groups/N bounds; cohort cố định và re-rank từng kỳ phải phân biệt.
- Time: all/7d/30d/custom/day/week/month/quarter/year/relative reference; inclusive/exclusive end, timezone, partial buckets, stale/missing facts, source event clock khác nhau, snapshot-only.
- Depth: focused/deep/comprehensive giữ primary meaning; missing data không filler; lens monotonicity và non-duplication.
- Lifecycle: edit/apply/detach-guided/submit/preview/cancel/retry/duplicate/reload/reopen/refine/filter/drill/back/reset/depth/export; old/new revision; source/schema/access changed.
- Failure: provider timeout/auth/rate/daily quota/schema/empty/malformed output; repair progresses/no progress; lookup timeout/capacity; SQL no_data/error/timeout/truncation; stale fingerprints; expired artifact/session; browser response races.
- Data: cover từng domain khả dụng thực trong catalog (audit hiện 16 domain, 48 metric khả dụng; không fix cứng số này), từng metric class, cả data-rich/sparse/empty. Registry feature/preset inventory rộng hơn phải được đối chiếu riêng, không suy từ 16 domain là mọi preset đã chạy.

### 12.3. Bộ ca nghiệm thu phải có

1. Giữ các incident I01–I11 làm P0/P1 regression, thêm biến thể ở tỉnh/metric/subject khác chưa dùng lúc sửa. Freeze holdout và hash trước triển khai; tối thiểu 20% corpus là holdout.
2. Bắt buộc round-trip mọi template chính thức sang contract; user-valid guided case không lỗi semantic/schema nội bộ sau khi READY_GUIDED. Data-limited hợp lệ phải có outcome và lý do đúng.
3. Tạo fixture 5 tỉnh A–E doanh thu thấp + tỉnh F rất lớn; store/payment/trend/map chỉ A–E. Thay dữ liệu F không đổi supporting A–E, trừ trường hợp làm thay membership ranking có chủ ý.
4. Chạy cùng fixture ở cả ba độ sâu; primary key set/values không đổi, mọi lens mới giữ scope/clock; thử city→store, product→order line và family khác có mapping.
5. Tạo tỷ lệ có numerator/denominator khác status của revenue, AOV và distinct customer. Verify không sum average/rates hoặc join fanout; chart shares đúng base.
6. Risk HCM: tổng 4,68% và groups red cùng tồn tại; test một vùng khác, no_data, failed source, sample thấp, current inventory và historical-only. Deep/follow-up giữ exact signal/scope/threshold.
7. Compare echo có “theo … giữa … và …”, alias/no accent/two named cities; không nuốt “giữa” vào entity. Thử comparison theo category khác để tránh city-specific patch.
8. Báo cáo mới -> refinement-preflight không 409 nếu catalog/permission không đổi; source epoch đổi có action refresh đúng; schema thật đổi mới trả schema mismatch. Cold cache, warm cache và hai worker/replica nếu kiến trúc hỗ trợ phải giống nhau.
9. Tamper browser report rows/SQL/cohort/revision/key/owner, stale idempotency key: reject; không gửi prompt/SQL ngoài phạm vi quyền.
10. UI 1280/1440/1920 và mobile hẹp: chữ/plot không phóng lớn, drawer cân đối, input IME/typing không rerun report; screenshots cho positive, data-limited và failure states.

### 12.4. Gates

- **Critical gates:** 100% corpus scope/security/metric denominator/time/atomic-publication; không được dùng accuracy trung bình để che một rò phạm vi hay query ghi.
- **Guided:** 100% valid advertised contracts trong fixture/integration đi hết hoặc trả data-limited đã dự đoán; 0 provider calls; READY_GUIDED không kết thúc vì parser/enum nội bộ phủ nhận input đúng.
- **Free text/live:** công bố riêng first-pass, after-bounded-repair, clarified, unsupported, transport-failed. Mục tiêu >=95% first-pass trên finite positive holdout sau khi transport khỏe; các incident P0 phải đạt tất cả. Đây là tiêu chí thử nghiệm, không tuyên bố 95% chính xác trên mọi câu ngoài tập đo.
- **Relevance:** mọi artifact có goal/scope/evidence; không có supporting ngoài cohort không được gắn benchmark rõ. Failure của cohort/relevance làm overall chưa đạt dù numeric checks pass.
- **Frontend:** existing unit/typecheck pass; browser critical journeys pass; served bundle đã rebuild và hash khớp source nghiệm thu.
- **Regression:** chạy một lần cuối cả suite trong môi trường đủ và cô lập; nếu phải shard module vì memory thì ghi rõ chưa qua monolithic qualification. Không xóa/skip fail không giải thích hoặc sửa expected output chỉ để chạy xanh.
- **Performance:** đo preflight local, typing responsiveness, first result và provider stages trên môi trường được ghi nhận. Không dùng số đo khi đang OOM/concurrent full tests làm SLA. Tách hot-path 0SQL validation khỏi explicit lookup, không hứa latency vượt tài nguyên hiện có.

## 13. Goals và phase triển khai A–Z

| Goal | Công việc | Đầu ra/điều kiện chuyển |
|---|---|---|
| G00 | Freeze baseline, nguồn/authority, corpus + holdout | Audit receipt, source hashes, fail taxonomy, không báo hệ thống đã đạt |
| G01 | Shared meaning contract + adapters + readiness | Schema/version/state diagram; template round-trip; negative/secondary fields gates |
| G02 | Value catalog + scope grounding theo quyền | City/source parity, IN/rare/multi-axis, lookup completeness; không arbitrary string acceptance |
| G03 | Mission dispatcher + risk parity | Tám mission + free; sửa products misroute, compare echo, clock mismatch; zero-AI typed paths |
| G04 | Entity cohort/dependency compiler | Primary rank artifact -> dependent scopes; cross-subject mapping, ties/partition/budgets/snapshot |
| G05 | Lens relevance + depth planning | Goal/evidence graph; 4/6/8 conditional; no filler/context leakage; metric-family safety |
| G06 | Report/map/risk/text/export verifier | Membership/numeric/time/relevance all first-class; trusted report context dùng chung |
| G07 | Fingerprints/cache/revision/recovery | Sửa fresh refinement 409 đúng nguyên nhân; stale/epoch handling, idempotency/cancellation/multi-worker |
| G08 | UI input/catalog/refine/chart layout | Draft/applied rõ, IME/race, drawer, typography/plot bounds, scope chips; không sticky che nội dung |
| G09 | Offline + integration tổng thể | Corpus/holdout/property/oracle, mọi domain/metric class, auth/fault injection; phân loại toàn bộ regression fail |
| G10 | Live Gemini + read-only warehouse + browser | Replay incident và holdout; transport healthy; token ledger và independent oracle; không lấy timeout làm pass |
| G11 | Build/deploy local và xác minh bundle | Chỉ rebuild service liên quan sau test; code/version/hash thực được phục vụ; smoke full journeys |
| G12 | Handoff demo + đóng goal | Báo cáo accepted/limited/blocked theo từng gate, URLs/steps/receipts; không còn P0/P1 bỏ ngỏ không xử lý |

Thứ tự phụ thuộc: G00→G01→G02/G03→G04→G05/G06→G07/G08→G09→G10→G11→G12. Có thể viết test/fixture của phase sau sớm; không gom mọi thay đổi thành một commit/refactor không thể đối chiếu. Không cần spawn agent để thực hiện PLAN này.

Mỗi phase: ghi reproduction → invariant → minimal architecture change → focused checks → impact audit → checkpoint. Khi một lỗi xuất hiện ở nhiều endpoint, sửa authority chung và adapter tương ứng, không nhân bản regex/whitelist sang từng router.

## 14. Bản đồ source cho Claude

| Khu vực | Files ưu tiên đọc đúng đoạn |
|---|---|
| Input/boundary | `analytics-api/common.py`, `routers/ai.py`, `services/input_integrity_service.py`, `preflight_service.py`, `semantic_preflight_contract.py`, `request_anchors.py`, `scope_resolution_service.py` |
| Mission/RAG | `mission_contract_service.py`, `agent_pipeline.py`, `hybrid_analyst_planner.py`, `one_shot_context.py`, `semantic_candidate_service.py`, `domain_intelligence_service.py` |
| Cohort/query | `analysis_expansion_service.py`, `analytical_resolver.py`, `analyst_contract.py`, `analysis_contract.py`, `analytical_query_service.py`, `analysis_query.py`, `analytical_capacity_planner.py`, `query_execution_batch.py` |
| Evidence/state | `session_service.py`, `result_artifact_store.py`, `workspace_service.py`, `analysis_job_service.py`, `analysis_quality_service.py`, `analysis_response_service.py`, `dashboard_planner_service.py` |
| Risk/geography | `risk_watch_service.py`, `geography_exploration_service.py`, `store_location_service.py`, `metadata_service.py`, `data_coverage_service.py`, semantic/warehouse metadata |
| Provider | `agent_provider.py`, `provider_budget.py`, `provider_credential_router.py`, `provider_health_service.py`, `telemetry.py`; không đọc `.env` |
| Frontend | `AnalystWorkspace.tsx`, `MissionInputBuilder.tsx`, `AnalysisScopePanel.tsx`, `CapabilityDrawer.tsx`, `RiskSignalTable.tsx`, `RefinementComposer.tsx`, `ReportWorkspace.tsx`, `GeographicReportPanel.tsx`, `ProvinceMap.tsx`, `Charts.tsx`, `ForecastPanel.tsx` |
| Frontend contracts | `missionWorkspace.mjs`, `workspacePresentation.mjs`, `preflightPresentation.mjs` (`createPreflightClient`), report persistence/geography/grid/layout/plot utilities và store/view điều phối submit |
| Tests | `test_v32_mission_reliability.py`, `test_input_integrity.py`, `test_ai_final_depth_contract.py`, generic-family/ranked-companion/workspace/geography/risk/access/capacity/provider tests; `web-ui/tests/e2e/*` liên quan |

Trước khi đổi một helper, `rg` call sites và import để phân biệt production/legacy. Không xóa luồng legacy được lưu trong session hoặc test archive mà chưa có adapter/migration runtime rõ.

## 15. Lệnh, ledger và tối ưu token

### 15.1. Commands đã có

```bash
# Từ repo root; không đọc .env.
docker compose -f docker-compose.data.yml exec -T analytics-api \
  env AI_OFFLINE=1 python -m tools.run_tests_v29

# Trong data-platform/web-ui:
npm run typecheck
node --test src/utils/*.test.mjs

# Audit replay từ repo root; password do operator inject, không ghi vào source/log.
python3 data-platform/evaluation/ai-system-audit-20261021/audit_runtime.py preflight
python3 data-platform/evaluation/ai-system-audit-20261021/audit_runtime.py guided
python3 data-platform/evaluation/ai-system-audit-20261021/audit_runtime.py live --allow-provider
```

Audit scripts dùng `DP_AUDIT_PASSWORD`, tùy chọn `DP_AUDIT_USER`, target localhost:8501. Chúng ghi đè receipt cùng tên; **Claude copy sang thư mục campaign mới/version mới trước khi chạy**, giữ evidence baseline này nguyên trạng. Phép thử live chỉ chạy sau khi đã đọc quyền mục 0.2 và có ledger; không gọi live do thiếu AI_OFFLINE trong test offline.

Runner backend trong API dùng chung đã có SIGKILL 137; ưu tiên container kiểm thử riêng, network none, mounts read-only, không inject key. Script `audit_offline_modules.py` cho process isolation từng module và receipts. Không tăng memory/CPU production để né test failure; báo rõ giới hạn và điều tra memory/test isolation nếu cần.

### 15.2. Tiết kiệm token mà giữ đủ nghĩa

- Dùng GOALS nhỏ làm context chuyển phiên; ghi đúng phase + file/line + failing test IDs. Không đọc lại PLAN và toàn bộ code sau mỗi tool call.
- Log dài ra file; chỉ đưa summary, error IDs và đoạn stack liên quan vào hội thoại. Không paste SQL/results của 1.175 cửa hàng để debug một fingerprint.
- Gửi AI typed intent/schema ngắn, canonical IDs và catalog snippets đã truy hồi đúng mission. Risk default signal set và guided/preset/filter/depth/layout không cần model để tính toán.
- Repair gửi delta/typed issues và vùng contract cần sửa; tái dùng phần đã xác minh. Không cắt bớt scope, clock hoặc định nghĩa mẫu số để tiết kiệm token.
- Ledger tách logical calls, physical sends, primary/repair/failover/resend, prompt/output/thinking tokens khi provider trả. Không suy token usage/bill=0 từ timeout; không cộng trùng attempts object hoặc latency.
- Offline: focused modules khi sửa; full cuối một lần sau khi có thay đổi mới. Live: canary → per-family → held-out; transport liên tiếp lỗi thì phân loại và dừng lặp mù, chỉ chạy lại khi có điều kiện chẩn đoán mới. Không dùng retry nhiều lần lấy một pass rồi xóa các fail trước.
- Tối ưu context/caching sau khi semantics gates xanh; giữ payload hash/size, cache hits và result signatures để chứng minh giảm token không đổi nghĩa.

## 16. Kịch bản demo và định nghĩa hoàn tất

1. Bottom 5 tháng 9: danh sách tỉnh đúng, totals của cohort đúng; branch/payment/trend/map/export cùng tập; Top/Bottom và actual N đúng. Bật benchmark nếu muốn, thấy nhãn/tổng khác rõ.
2. Bottom 5 kỳ ít dữ liệu: hiện “1/5 tỉnh có dữ liệu phù hợp”, không fake zero, giải thích source coverage và lens thiếu.
3. Chọn nhiều tỉnh hiếm từ picker và từ chart: cùng canonical IDs, không `filter_value_unknown`; đổi depth giữ kết quả chính.
4. Compare dùng template chính thức; sửa tên/tỉnh/thời gian/axis đúng chỗ; draft/apply không lệch.
5. Risk HCM: tổng và nhóm được phân biệt, có exposure; snapshot hiện trạng tách khỏi tháng lịch sử; deep/follow-up cùng scope, không route products.
6. Refine báo cáo vừa tạo: input hợp lệ gõ mượt/apply được; gibberish/unknown/unsupported được hướng dẫn; stale schema/access/source có state và action đúng, báo cáo cũ giữ nguyên khi lỗi.
7. Forecast/relationship/ratio/distinct/snapshot: chọn chart và phép tính đúng định nghĩa, thiếu history thì nói rõ, không coi “đủ 8 chart” là chuẩn duy nhất.
8. Cancel/reload/reopen/export ở từng đường: không duplicate paid call, không đổi revision hoặc population ngầm; xác minh served bundle thật.

Claude bàn giao: code + test receipts + known limitations theo gate + source/bundle hashes + demo steps/localhost. Chỉ đánh dấu G12 khi các lỗi P0/P1 của PLAN đã có kết quả cuối và critical gates đạt. Nếu provider/nguồn ngoài chưa khả dụng, ghi rõ phần chưa đo và công việc còn lại; không gọi đó là “đã hoàn tất kiểm thử AI toàn hệ thống”.

## 17. Đặc tả nghiệm thu “focus đúng bài toán” cho từng artifact

Đây là hợp đồng phải triển khai thành test/verifier, không chỉ thêm phần chú thích UI. Corpus máy đọc ở [acceptance-matrix.json](evaluation/ai-system-audit-20261021/acceptance-matrix.json) mô tả ca **cần thực hiện sau sửa**, không được tính các ca đó là đã chạy trong baseline.

### 17.1. Bằng chứng bắt buộc của mỗi view

| Thuộc tính | Cách chứng minh | Không chấp nhận thay thế |
|---|---|---|
| Mục tiêu | `goal_ref` trỏ đến goal requested hoặc dependency đã duyệt; `purpose` là trả lời câu hỏi phụ cụ thể có ích | Chỉ có title chứa “doanh thu”, hoặc câu “vì đây là góc nhìn liên quan” |
| Entity cohort | Query dependency/semijoin theo key; kiểm tra toàn bộ artifact thuộc cohort, không chỉ preview | Trùng 3 nhãn đầu tiên, hiển thị 5 tỉnh bên sidebar nhưng query không lọc |
| Universe và selection | Xếp hạng đúng universe, một lần; dependent views dùng chính selection ID/version đó | Các Top 5 độc lập của từng chart hoặc tự rank lại sau khi đổi depth |
| Population metric | Tử/mẫu, status, null policy, grain và phép nối có definition refs | Tổng chart có vẻ gần nhau hoặc dùng một status filter cho mọi metric |
| Thời gian | Period/timezone/reference/bucket/clock của từng metric được so typed | Chỉ cùng text “tháng 9” dù một query all_time/snapshot |
| Dữ liệu | Result contracts, reconciliation theo định nghĩa, no-truncation/correct pagination và missing state | Chart đẹp, số chart đủ, query 200 hoặc score tự đánh giá cao |
| Phần giải thích | Mỗi số/claim có fact/evidence ID cùng goal/scope; comparative claim có cả hai denominator đúng | LLM đoán nguyên nhân hoặc dùng số national để giải thích tỉnh |
| Map/export | Dùng ReportContext/evidence refs như chart, cùng key set và effective period | Tạo query mới theo defaults khi export hoặc gửi pin toàn quốc vào result map |
| Tương tác | Action có source goal/cohort/revision; diff chỉ field được phép thay đổi | Click chart làm biến đối tượng; back/reset mất scope gốc đã duyệt |

Với trend theo cohort, ngày không phát sinh vẫn giữ membership của cohort, nhưng 0 chỉ được fill khi coverage chứng minh ngày đó complete và metric có identity=0; nếu coverage không đủ thì gap/unknown. Cohort có cửa hàng không có doanh thu phải phân biệt “thành viên được chọn” với “thành viên có quan sát”; không tự bỏ chúng khỏi denominator mạng lưới hoặc gán dữ liệu giả.

### 17.2. Chứng minh bằng phép biến đổi dữ liệu độc lập

1. Fixture oracle định nghĩa membership bằng raw keys/records, không gọi production resolver/compiler. Tính primary rank có stable tie policy.
2. Giữ cohort A–E cố định và thêm doanh thu/payment ở F: mọi dependent chart A–E, pin, KPI và export phải giữ nguyên; benchmark whole-universe được đổi có nhãn.
3. Tạo thay đổi đủ làm primary rank membership đổi theo policy: mọi dependent artifact phải chuyển sang **cùng cohort mới một cách nguyên tử**, không giữ map/insight của cohort cũ.
4. Đổi tên display của một store nhưng giữ ID: membership/numerical values không đổi. Tạo hai store trùng tên khác tỉnh: không gộp vào một nhóm hoặc lọc nhầm.
5. Hoán vị thứ tự giá trị IN/khoảng trắng/dấu alias tương đương: nghĩa và kết quả không đổi. Thêm một thành viên thật khác hoặc đổi period: fingerprint và kết quả được invalidated đúng.
6. Tách một nhóm thành hai subgroup nhưng giữ sum/exposure: aggregate ratio/AOV không đổi khi gộp weighted; sum-of-averages và average-of-rates phải bị mutation test bắt.
7. Với câu hai goals độc lập, thêm dữ liệu quốc gia được phép làm national view đổi nhưng không làm cohort-bound view rò dữ liệu. Không “sửa” bằng cách cấm mọi national view.

### 17.3. Mutation tests phải thất bại khi cố ý phá hợp đồng

Trong fixture/test harness riêng, inject lần lượt: bỏ cohort predicate; đổi ASC→DESC; bỏ một filter ở một child query; đổi time bound; duplicate join row; lấy chart data từ query khác; map trả national pins; lấy narrative fact ngoài cohort; đổi alias của store trùng tên; dùng source epoch cũ; replay revision khác; thiếu applied scope trong risk follow-up. Verifier phải fail đúng code **trước publication/export**, dù queries hợp lệ cú pháp và chart renderer chạy được.

Không sửa code production chỉ để có mutation hook. Dùng dependency injection/fixture adapter hiện có và patch scoped trong test; ngoài test không có cờ bypass. Nếu mutation vẫn “verified”, phase G06 chưa đạt.

### 17.4. Đóng từng lỗi theo họ, không theo câu

Mỗi incident phải có: ca tái hiện gốc; ít nhất một positive control; ca cùng cấu trúc ở subject/metric khác; ca counterexample mà luật **không được áp**; oracle; expectation state/number/cohort; chứng cứ API/browser thực. Ví dụ vá rare city phải đi kèm rare store hoặc category, không chỉ thêm năm tên tỉnh; vá ranking phải không làm hỏng dashboard requested goals độc lập.

## 18. Hoàn tất audit baseline và ranh giới chưa được nghiệm thu

- Đã gọi 28 preflight, 23 guided jobs trên 16 domain, toàn bộ **41 preset được quảng bá cho phiên tài khoản audit**, risk scoped độc lập, các kiểm tra refinement/revision và 12 case live Gemini đã xác nhận. Registry khai báo 53 presets, 12 không nằm trong inventory của phiên này; không mở quyền để ép chạy chúng.
- Cả 41 preset hoàn tất ở kỳ all_time với 0 provider calls; đây là smoke đường thực thi và nguồn hiện có, **chưa chứng minh relevance của mọi view ở mọi kỳ/filter/role**. D14 và D15 có quality status partially_verified, các preset khác có status nội bộ verified; cả hai loại status đều phải đi qua acceptance scope/relevance mới.
- Backend: 100 module đã được thử; 99 module trả kết quả, module capacity bị kill ở lượt module nhưng 8 test nguyên bản đã chạy riêng và pass. Test corpus ghi receipt lỗi read-only ở lượt đầu, rerun với thư mục output riêng pass. Tổng hợp không cộng đôi rerun: **1.621 testsRun, còn 2 failures và 7 errors/subtest errors**. Chi tiết và phân loại ở audit README. Hai monolithic runner exit 137 giữ nguyên như giới hạn chưa qualified.
- Frontend utility **222/222 pass**, TypeScript typecheck pass. Audit này chưa chạy toàn bộ browser/e2e sau sửa vì chưa có triển khai sản phẩm; Claude phải hoàn tất G08–G11 với browser thật, không dùng unit pass để chứng minh UX.
- Live Gemini campaign đầu: 20 physical sends, 10 logical calls đều timeout; hai input bị chặn trước provider. GET root không key trả 404 và POST generateContent không key/body rỗng trả 403 nhanh: chỉ chứng minh HTTPS cơ bản có phản hồi. Không suy nguyên nhân timeout hay token/bill từ các phản hồi này.
- Replay có provider phản hồi: canary một case rồi 11 case còn lại, tổng 12 case: **7 completed, 1 failed, 1 needs_input, 1 insufficient_data, 2 HTTP400**, 12 logical calls/12 physical sends; reported usage 41.972 input + 1.145 output tokens. Cộng cả hai điều kiện là **32 physical sends**, không cộng đôi canary. Usage có phản hồi không bao gồm usage chưa biết của campaign timeout và không phải hóa đơn. Risk gốc tái hiện products/INVALID_CONTRACT/no_progress, 0 query; Bottom 5 tái hiện I01/I16 dù completed. Chưa đo whole-report relevance accuracy trên holdout độc lập.
- Các chứng cứ hiện tại đủ để xác định phạm vi sửa kiến trúc và test đỏ, chưa đủ để nói toàn hệ thống đã đúng. G00–G12 vẫn là việc triển khai/qualification sau PLAN.

## 19. Bổ sung: đúng mục đích từ input đến biểu đồ và kết luận mở rộng

**Yêu cầu bổ sung ngày 21/10/2026:** ở mọi tab và độ sâu, mọi output phải trả lời đúng bài toán; phần “Nhận định từ biểu đồ”, “Chi tiết”, “Trả lời ngắn”, kết luận và file xuất phải giữ cùng nghĩa với biểu đồ. Đây là đặc tả cần triển khai, chưa phải kết quả test đã pass. Không có cam kết mọi câu ngôn ngữ tự nhiên luôn được hiểu đúng; yêu cầu không đủ rõ phải được hỏi lại có trọng tâm, yêu cầu không hỗ trợ phải được thông báo đúng.

### 19.1. Tiêu chí thành công của bài toán được đóng băng trước khi chạy

Mở rộng contract hiện có bằng `answer_requirements` có version, gắn với từng requested goal, gồm:

- Câu hỏi cần trả lời, nguồn từ mệnh đề/cấu hình nào; kết quả bắt buộc và các phân tích bổ sung được phép.
- Metric/định nghĩa, chiều nhóm, universe, cohort/dependency, thời gian/clock, phép so sánh, chiều xếp hạng, đơn vị, mẫu số và yêu cầu đầu ra đã xác nhận.
- Điều kiện đủ dữ liệu và điều kiện cần làm rõ. “Ở HCM” là filter, không tự tạo yêu cầu nhóm theo tỉnh; “vì sao” không tự cấp bằng chứng nhân quả.
- Quan hệ giữa các mục tiêu: độc lập, giải thích mục tiêu chính, benchmark hoặc phụ thuộc tập chọn. User hỏi tổng quan rộng có thể cho phép metric bundle được quản trị; phải ghi rõ bundle và lý do, không tự thêm metric chuyên biệt chỉ vì cùng từ khóa.

UI cho xem ngắn gọn “Đang phân tích…” với đối tượng/kỳ/chỉ số. Guided input hợp lệ tiếp tục chạy trực tiếp; không thêm bước xác nhận cho mọi câu. Chỉ hỏi lại khi mâu thuẫn/thiếu thông tin làm thay đổi câu trả lời. Mọi default phải có policy/source, không âm thầm đổi ý người dùng.

### 19.2. Cổng kiểm chứng xuyên chuỗi

| Boundary | Kiểm tra bắt buộc | Khi không đạt |
|---|---|---|
| Input → contract | Mọi ràng buộc có nghĩa được bind hoặc báo chưa rõ; guided/text/time/scope cùng một phiên bản | Giữ draft, chỉ rõ slot cần sửa; không bỏ mệnh đề khó |
| Contract → plan | Mọi requested goal có nguồn; mọi child view có câu hỏi phụ, quan hệ và đường áp scope hợp lệ | Sửa plan trong recovery budget hoặc báo phần chưa xử lý được |
| Plan → execution | Compiler giữ metric definition, keyset, clock, access, dependency và query budget | Chặn query sai; không fallback sang query toàn hệ thống |
| Results → chart data | Grain/unit/population/coverage đúng; rows/series, tổng, mẫu số và cohort đối chứng được | Không công bố chart sai; giữ evidence lỗi để debug |
| Chart data → hình vẽ | Trục, thứ tự, legend, series, tooltip, màu, scale và units thể hiện đúng số liệu | Chọn biểu diễn hợp lệ khác hoặc bảng; không đổi dữ liệu để vừa hình |
| Evidence → nhận định | Mỗi claim có fact refs cùng goal/cohort/kỳ/revision; phép tính/so sánh kiểm chứng được | Loại claim sai; fallback diễn giải tất định từ facts đã xác minh |
| Report → mở chi tiết/export/reopen | Cùng immutable report revision và selection context, không fetch dữ liệu mặc định rộng hơn | Invalidate/refresh rõ ràng; không ghép số mới vào lời giải thích cũ |

Một goal cốt lõi thất bại thì báo cáo chưa được ghi “đã trả lời đầy đủ”. View phụ không đủ dữ liệu có thể được bỏ với lý do cụ thể và coverage của goal còn lại. Không bỏ âm thầm goal người dùng yêu cầu rồi công bố toàn báo cáo hoàn tất. Nội dung đã xác minh vẫn đọc được khi riêng phần diễn giải AI thất bại.

### 19.3. Chọn biểu đồ theo câu hỏi và tính chất dữ liệu

Mỗi candidate view cần `question_answered`, `relation_to_goal`, `expected_insight`, `data_requirements`, `evidence_refs`, `scope_proof`, `omission_reason` nếu bỏ. Relevance là cổng kiểm tra bắt buộc trước xếp ưu tiên; điểm LLM tự chấm hoặc title trùng từ khóa không đủ.

| Câu hỏi/chất dữ liệu | Biểu diễn và điều kiện | Sai lệch cần bắt |
|---|---|---|
| Xếp hạng/so sánh nhóm | Bar/dot/table; đúng ASC/DESC, actual N, ties, nhãn nhóm và đơn vị | Bottom ghi Top, thứ tự khác data, label trùng bị gộp, trục bar cắt làm phóng đại |
| Diễn biến thời gian | Line/area khi có chuỗi có nghĩa; ngày theo khoảng cách thời gian thật, missing tách khỏi zero | Nối gap như đủ quan sát; smoothing tạo cực trị không có trong dữ liệu; một điểm vẫn nhận xét xu hướng |
| Cơ cấu | Donut/stacked chỉ khi parts loại trừ nhau và total cộng được; “Khác” có base rõ | Tổng rates/averages, shares tính theo trang hiện tại hoặc tập Top N nhưng ghi toàn bộ |
| Chẩn đoán theo phân khúc | Grouped/stacked/small multiples theo câu hỏi; số series và baseline đọc được | Thêm nhiều series cùng chủ đề nhưng khác cohort/clock; lặp chart chỉ đổi màu |
| Quan hệ | Scatter/heatmap với paired observations cùng grain và đủ mẫu | Hai tổng độc lập bị coi là cặp quan sát; correlation bị diễn giải là nguyên nhân |
| Dự báo | Lịch sử và dự báo tách rõ, horizon/cadence đúng; khoảng bất định có nguồn mô hình | Dự báo được viết như thực tế; partial period làm lệch baseline; confidence bịa từ model ngôn ngữ |
| Địa lý | Metric theo keys địa lý được bind; pins, summary và selected entities cùng goal | Dùng toàn mạng lưới khi chỉ hỏi cohort; suy vị trí từ tên cửa hàng |
| Thiếu/ít dữ liệu | Bảng/KPI hoặc empty state phù hợp, nêu sample và phạm vi quan sát | Ép line/donut/map để đủ dạng; zero giả; đổi sang nguồn khác không thông báo |

User đổi kiểu chart chỉ thay presentation khi tương thích; chart menu nêu lý do dạng không phù hợp. Nếu cần đổi aggregation/metric để vẽ thì đó là thay đổi nghĩa, phải thể hiện rõ trong thao tác cấu hình. Không dùng “đa dạng biểu đồ” làm điều kiện cao hơn tính đúng.

### 19.4. Fact và claim cho phần giải thích mở rộng

Tạo lớp evidence facts dùng chung từ query artifacts đã xác minh. Mỗi fact giữ `fact_id`, `goal_ref`, `query_result_ref`, entity/series keys, metric definition, unit, raw value, numerator/denominator khi có, effective period/clock, cohort/population refs, source epoch, revision và quality limitations. Dùng raw values để tính rồi mới format; không tính tỷ lệ từ các số đã làm tròn trên màn hình.

Mỗi claim giữ `claim_type`, `fact_refs`, phép tính/comparison đã dùng, phạm vi phát biểu và trạng thái kiểm chứng. Các loại chính: mô tả, xếp hạng, chênh lệch, xu hướng, đóng góp, cảnh báo ngưỡng, tương quan, dự báo; giả thuyết/hành động đề xuất phải tách khỏi kết luận dữ liệu.

Quy tắc bắt buộc:

1. “Cao nhất/thấp nhất” phải có universe xác định và tie policy. “Hạng 1 trong Bottom 5” không được viết thành doanh thu cao nhất toàn hệ thống. Phân trang không làm đổi universe của nhận định.
2. Tỷ trọng phải nêu base: trong cohort, trong nhóm hiển thị, hay toàn hệ thống. Không suy total từ các hàng preview đã bị cắt. Distinct/ratio/average không tự cộng để tạo contribution.
3. Tăng/giảm phải có kỳ so sánh tương thích về clock/coverage, công thức và baseline. Baseline bằng 0/âm/null xử lý theo metric policy; không xuất phần trăm vô hạn hoặc kết luận tăng trưởng từ missing data.
4. Tỷ lệ và chênh lệch điểm phần trăm là hai phép đo khác nhau. Aggregate dùng numerator/denominator gốc; không lấy trung bình tỷ lệ chi nhánh để giải thích toàn cohort.
5. “Do”, “dẫn đến”, “ảnh hưởng” không được kết luận nhân quả từ breakdown/correlation. Khi chỉ có dữ liệu mô tả, ghi đóng góp/đồng biến hoặc giả thuyết cần kiểm tra. Đề xuất hành động phải liên kết signal, không bịa nguyên nhân vận hành.
6. Dữ liệu không đầy đủ, mẫu ít, period chưa kết thúc và snapshot hiện tại phải giới hạn chính phát biểu liên quan; không chỉ giấu caveat ở cuối báo cáo.
7. Không lấy facts của chart khác, report khác hoặc kỳ khác để giải thích chart đang mở, trừ comparison/benchmark đã khai báo với hai evidence refs rõ ràng.
8. LLM chỉ diễn đạt facts đã cấp và có thể đề xuất giả thuyết có nhãn. Verifier kiểm tra entity/number/comparison/scope; claim tự do không chứng minh được phải bị loại hoặc chuyển thành gợi ý, không được tin chỉ vì LLM tự nói đã kiểm tra.

Ưu tiên câu mô tả/số học tất định cho phần mở chart; AI có thể tổng hợp diễn giải khi cần. Việc mở/đóng phần giải thích thông thường không tạo thêm lượt provider hoặc phân tích lại toàn báo cáo.

### 19.5. UX khi mở “Nhận định từ biểu đồ” và tính nhất quán

Nội dung mở rộng trình bày ngắn theo thứ tự: **biểu đồ trả lời điều gì → đang xét ai/kỳ nào → phát hiện có số liệu → ý nghĩa đối với bài toán → giới hạn**. Không lặp chung một caption cho mọi chart. Từ “ý nghĩa” không cho phép suy nguyên nhân vượt bằng chứng.

- Khi không chọn điểm: giải thích toàn chart theo base đã khai báo. Khi chọn series/điểm: hiện rõ “Đang xem…” và dùng selection keys; vẫn giữ report/cohort cha. Hover chỉ hiện tooltip không tự thay phạm vi báo cáo.
- Cache explanation theo report revision + chart artifact + selection + semantic/access/epoch signatures phù hợp. Không key theo title hoặc chỉ metric. Cùng chart ID ở report khác không được dùng lại kết luận cũ.
- Nếu tải explanation bất đồng bộ: request A đến sau request B không được ghi đè chart B. Sau refine/filter/depth, số liệu, title và explanation phải đổi cùng revision; nội dung cũ phải bị invalidated.
- Đóng/mở lại, chuyển trang, đổi layout hoặc resize giữ cùng meaning và facts. Đổi scope/period mới cần kết quả mới. Export/reopen giữ đúng phiên bản được chọn, có cách phân biệt báo cáo lưu với dữ liệu hiện thời.
- Nếu provider diễn giải lỗi: vẫn hiển thị facts/nhận định tất định đúng và trạng thái phần AI; không dùng lời giải thích của báo cáo trước làm fallback.

### 19.6. Ba độ sâu và báo cáo nhiều mục tiêu

Số view chỉ là capacity cap theo policy, không phải quota phải lấp đầy. Với cùng input/snapshot, ba độ sâu giữ primary answer, entity keys, values, rank policy và population. View thêm phải trả lời câu hỏi phụ hữu ích; view có nhiều biểu diễn tương đương chỉ là lựa chọn presentation, không được đếm thành nhiều bằng chứng độc lập.

“Comprehensive” không tự cho phép scope mới, thời gian mới, metric chuyên biệt mới hoặc narrative dài hơn nhưng vô căn cứ. Những mục tiêu độc lập người dùng thực sự yêu cầu vẫn giữ scope riêng; không ép mọi thứ vào một cohort duy nhất. Các chart và phần giải thích phải chỉ ra goal của mình và quan hệ với câu hỏi gốc.

### 19.7. Test và điều kiện đóng G05/G06/G08/G09/G10/G12

Bộ bổ sung: [acceptance-addendum.json](evaluation/ai-system-reliability-plan-addendum-20261021/acceptance-addendum.json). Đây là đặc tả chưa chạy, bổ sung cho 40 case baseline; không sửa các receipts lịch sử để biến thành kết quả mới.

- Với mỗi mission và metric family được quảng bá: chọn case có dữ liệu, sparse/no_data, scoped/multi-scope; chạy cả ba độ sâu, assertions cho primary và mọi artifact thực sinh ra. Các tổ hợp dùng pairwise để giảm chi phí; critical cohort/claim/clock phải có cases trực tiếp, không chỉ dựa pairwise.
- Mỗi chart: mở phần giải thích, kiểm tra facts/numbers/units/base/entity keys/period/limitations; đổi selection, phân trang, filter, depth, đóng/mở, export/reopen. Kiểm tra cả UI thực và API artifacts; screenshot đẹp không chứng minh claim đúng.
- Mutation bắt buộc: chèn fact ngoài cohort, đổi mẫu số, đảo chiều xếp hạng, đổi đơn vị, thay kỳ, đổi chart evidence ID, stale explanation, bỏ coverage caveat, biến correlation thành causation. Mỗi mutation phải fail đúng gate trước publication.
- Metamorphic: dữ liệu ngoài cohort không đổi dependent chart **và lời giải thích**; đổi display label không đổi membership; thay dữ liệu trong cohort làm cả số và claims cập nhật cùng revision; đổi layout không làm đổi kết luận.
- Live AI chạy các positive/negative/follow-up cases thuộc phạm vi đã được phép; sau sửa được chạy lại case lỗi, case cùng cấu trúc ở domain khác và regression. Lưu mọi lần thử theo campaign, không chỉ giữ lần thành công; không nới guard để pass.
- Nghiệm thu: 100% critical cases về metric/scope/time/claim provenance và report consistency phải pass; mọi artifact được công bố có evidence hợp lệ; mọi requested goal có kết quả hoặc trạng thái thiếu rõ. Semantic coverage được báo trên corpus hữu hạn, không tuyên bố đã bao phủ mọi câu ngoài corpus.
- Báo cáo đóng goal có bảng `input → resolved task → primary answer → view IDs → claim IDs → oracle → outcome`, source/bundle version và lỗi còn lại. G12 chưa đạt nếu còn chart đúng số nhưng sai bài toán hoặc phần giải thích khác phạm vi.
