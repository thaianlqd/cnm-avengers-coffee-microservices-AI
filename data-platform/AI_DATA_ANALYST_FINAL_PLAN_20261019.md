# PLAN FINAL — AI Data Analyst: phân tích đa chiều và workspace trực quan

Ngày: **19/10/2026**, Asia/Ho_Chi_Minh. Dành cho **Claude triển khai tiếp**.

Revision kế hoạch: **R2 — rà soát hoàn chỉnh**. Các quyết định về execution/snapshot, ratio filtering, coverage và nghiệm thu trong bản này thay thế cách hiểu chưa rõ của R1; không phải một phase sản phẩm đã hoàn thành.

**Trạng thái: PLAN_READY, CHƯA TRIỂN KHAI, CHƯA NGHIỆM THU FINAL.** Chữ FINAL trong tên là đích nghiệm thu, không phải tuyên bố hệ thống đã đạt. Lượt lập tài liệu chỉ đọc source, đọc log đã lọc và chẩn đoán offline; không sửa product code, không gọi provider thật, không commit/push.

## 0. Chỉ dẫn ưu tiên và phạm vi

Yêu cầu mới nhất thay thế công việc CI/release đang làm: **tạm dừng việc cũ, lập kế hoạch kỹ để Claude hoàn thiện AI Data Analyst toàn hệ thống**. Việc cũ và những bước chưa xác minh nằm trong [AI_DATA_PAUSED_WORK_20261019.md](AI_DATA_PAUSED_WORK_20261019.md). Không tự tiếp tục việc cũ chỉ vì nó chưa đóng.

Mục tiêu sản phẩm: người dùng hỏi một bài toán → hiểu đúng chỉ số/phạm vi → nhận một báo cáo trực quan đủ chiều để khám phá, có thể kiểm chứng và thao tác dễ như một BI workspace. Mỗi mức phân tích phải thêm giá trị thực; dữ liệu đủ điều kiện thì không còn báo cáo chỉ có KPI và 0–2 chart. Sửa cho các lớp bài toán và miền dữ liệu, không hardcode câu hỏi hủy đơn.

Trong phạm vi: ba mức phân tích; interpretation → deterministic analytical planning → SQL/evidence → chart eligibility → report quality; preset dùng chung tầng trình bày; filter, drilldown, follow-up, save/reopen; UX gọn và quan sát được lý do thiếu góc nhìn. Ngoài phạm vi mới: viết lại ingestion/Kafka/Spark/MinIO/auth/login/kiến trúc, đổi chatbot bán hàng hoặc microservice, làm lại Word. Những thứ này chỉ kiểm hồi quy và ghi backlog khi có vấn đề.

**Không commit, push, tạo nhánh để đẩy, thay lịch sử Git hoặc tự bật CI remote. Người dùng tự đẩy.** Đọc `CLAUDE.md`, `.claude/rules/{general,data-platform,token-budget}.md` trước triển khai. Nếu user có changes mới, giữ nguyên và phân biệt rõ phần mình sửa.

## 1. Kết quả khảo sát đã có — không đoán nguyên nhân từ ảnh

### 1.1. Baseline và giới hạn bằng chứng

- HEAD lúc khảo sát: `e7da8e18a95e9130d819624e2f86c6a36fc60ae7`, branch `branch_thaian`; working tree sạch trước hai tài liệu mới.
- Catalog tại `analytics-api/metadata/semantic_catalog.json`, phần `analysis_registry`: **43 metrics, 33 dimensions, 16 domain profiles, max_charts=8**. Không suy từ 23 bảng nguồn rằng có mọi metric, lịch sử hoặc quan hệ cần cho mọi chart.
- Các bằng chứng V3.5 cũ có giá trị đúng phạm vi/revision của chúng. 16 dashboard preset đã kiểm không đồng nghĩa mọi câu hỏi tự do × ba mức đã đạt. Không xóa hoặc sửa lại bằng chứng cũ để che khoảng trống mới.
- Chưa phát lại câu hỏi bằng model thật; không xác nhận lại KPI 4,7% trên nguồn thật trong lượt PLAN. Không dùng 4,7% làm expected hardcode cho test.

### 1.2. Bằng chứng runtime đúng khoảng giờ người dùng chụp

Đọc `docker logs` của `avengers_analytics_api` trong 15:10–15:20Z, tương đương 22:10–22:20 địa phương. Chỉ xuất timestamp và trường enum/count đã allowlist; không xuất prompt, SQL, rows, auth headers hoặc secrets.

| UTC / giờ địa phương | effective depth trong telemetry | chart_count | verification_status |
|---|---|---:|---|
| 15:14:03.786 / 22:14:03 | focused | 0 | verified |
| 15:14:52.197 / 22:14:52 | comprehensive | 3 | verified |

Đây là hai sự kiện trong đúng khoảng thời gian, phù hợp triệu chứng ảnh. Telemetry cũ không có request ID trong event này; **chưa chứng minh ghép tuyệt đối từng event với từng ảnh/session**. Các trường provider-call trong event là null, không được diễn giải null là 0. PLAN không phát sinh physical provider send mới.

### 1.3. Chuỗi nguyên nhân xác nhận từ source

| Tầng / vị trí ở baseline | Hiện trạng | Hệ quả cần sửa |
|---|---|---|
| `web-ui/src/views/AnalyticsView.tsx:80,104` và `utils/analysisInput.mjs:11` | UI hiện deep mặc định nhưng chỉ gửi depth khi `aiDepthChosen=true` | Người dùng thấy deep nhưng request có thể không chứa `analysis_depth` |
| `services/analysis_expansion_service.py::analysis_depth`, `narrow_request` | Nếu không explicit, một yêu cầu aggregate một metric có thể tự chọn focused | Câu hỏi tỷ lệ hủy dạng scalar dễ bị hạ mức |
| `analysis_expansion_service.py::dashboard_policy`; catalog `dashboard_policy.depth_budgets` | minimum_views=0; focused hỗ trợ 0 operations; target ở đây là 2/5/8 | Chưa có bộ chart cốt lõi bảo đảm cho cả ba mức |
| `domain_intelligence_service.py:550` | Target hiển thị/diagnostics lại là focused [2,4], deep [4,6], comprehensive [6,8] | Có nhiều nguồn policy chưa đồng nhất |
| `analytical_resolver.py:658–709` | Chọn hỗ trợ bằng estimates, thứ tự candidates và operations cap `min(8, capacity.operations)` | Ước lượng đạt target không chứng minh chart cuối đủ/đúng; scalar cũng chiếm budget |
| `analysis_expansion_service.py::supporting_candidates`, `mission_relevant` | Có thể lấy lens/metric liên quan theo domain; free text không có mission không bị ràng relevance chặt như mission | Có thể thêm revenue/channel hoặc customer count cho bài toán cancellation |
| `dashboard_planner_service.py::defaults` | Scalar không có trục category/time thì không tạo chart; đây là hành vi đúng của scalar renderer | Không chữa bằng cột giả hoặc bỏ scalar validation; phải lập thêm truy vấn phân tích có nghĩa |
| `chart_relevance_service.py` | Supporting chart budgets 0/4/6, thêm grammar/dedup; primary/supporting mapping chưa đủ chứng minh liên quan nghiệp vụ | Nâng một con số ở planner chưa đủ; chart có mapping vẫn có thể lệch bài toán |
| `view_requirement_service.py::view_coverage`, `analysis_quality_service.py:439` | Scalar có rows được satisfied bằng KPI; quality gate kiểm bằng chứng yêu cầu, không buộc đủ chart | `verified` có thể đúng về số nhưng báo cáo nghèo góc nhìn; chưa được phân biệt trên UI |
| `agent_pipeline.py:949` | depth_coverage chỉ ghi target, số chart và limited/adequate | Ghi limited chưa tạo kế hoạch bù hoặc chặn tuyên bố đủ trải nghiệm |
| `analytical_query_service.py::run_batch`, `query_execution_batch.py::report_snapshot` | Snapshot PostgreSQL mở và đóng bên trong batch; cache chỉ reuse cả batch có cùng data_snapshot | Không thể mở query bù sau report assembly rồi coi như vẫn cùng snapshot cũ |
| `ReportWorkspace.tsx:137–180`, `forecast_service.py::report_forecasts` | Forecast render từ `report.forecasts` riêng với `report.charts`; một phần chart còn được thu gọn bằng “Xem thêm” | Đếm `len(charts)` đơn thuần bỏ sót forecast; metadata count chưa chứng minh default canvas hiện đủ views |

Không kết luận lỗi do model/provider/MinIO khi chưa có bằng chứng. Khác biệt explicit/implicit depth, thiếu core analytical contract và eligibility/relevance sau execution là các vấn đề hệ thống đã xác nhận.

### 1.4. Chẩn đoán offline đã chạy trong lượt PLAN

Dùng production `AnalysisPipeline`, cùng một `AnalysisIntentEnvelope` aggregate `order_cancellation_rate`, lọc `city=Hồ Chí Minh`, 01–30/09/2026; `ScriptedProvider` và `FixtureWarehouse` SQLite hiện có. Test setup chặn HTTP và kết nối PostgreSQL bên ngoài, session/artifact memory, `AI_OFFLINE=1`; không ghi source/test mới. Đây là kiểm cơ chế với fixture, **không phải replay model hoặc dữ liệu production**.

| input depth | effective depth | operations | charts | depth coverage |
|---|---|---:|---:|---|
| Không gửi | focused | 1 | 0 | limited |
| focused explicit | focused | 1 | 0 | limited |
| deep explicit | deep | 7 | 3 | limited |
| comprehensive explicit | comprehensive | 8 | 4 | limited |

Cả bốn hiện đều `verification_status=verified`. Deep có count theo city, purchasing-customer count theo city và trend cancellation. Comprehensive thêm donut revenue theo order type. Fixture khác nguồn thật nên số chart không bắt buộc bằng ảnh 0/3; kết quả xác nhận hai vấn đề: bỏ depth có thể đổi mức và có thể dùng gần hết SQL budget cho góc nhìn chưa sát câu hỏi.

## 2. Hợp đồng giữ nguyên — không phá những phần đang ổn

1. **Một engine hiện tại:** `AnalysisPipeline`/AnalysisJobs, hybrid semantic interpreter, resolver, capability checker, compiler, executor, artifact store và verifier. Không thêm planner/queue/provider client độc lập, graph agent hoặc router keyword song song.
2. LLM chỉ hiểu ý và trả semantic contract. Server quyết metric formula, denominator, scope, allowed joins, SQL và tính số. Không nhờ LLM vẽ tự do từ prose hoặc tự sinh query ngoài compiler.
3. **API key/provider chỉ trong workflow Trợ lý AI được phép.** Tổng quan, preset Báo cáo, Khám phá, Quản trị, Kiến trúc, preflight, filter, đổi loại chart, sort, drilldown, pagination, save/reopen/export phải 0 provider sends. Tăng depth trên semantic intent đã duyệt cũng dùng deterministic expansion, không tự diễn giải lại bằng LLM. Chỉ follow-up ngôn ngữ tự nhiên mới có thể vào đường AI được kiểm soát.
4. Giữ opaque sessions, ADMIN-only hiện tại, CSRF/origin, policy, owner/access fingerprint, revoke, audit và SQL Explorer mode. Không hardcode frontend quyền admin.
5. Giữ readonly SQL/AST, timeout/cancel, shared SQL budget, source generation/snapshot, artifact pagination, data freshness/completeness. Không join fanout, không dùng Top-N mart làm toàn quần thể.
6. Giữ jobs ownership/idempotency/CAS, reservations trước send, shared circuit/half-open, fail-closed Redis/storage và bounds physical transport. Không reset ledger/quota/offset/volume để demo.
7. Giữ login hiện tại, 16 dashboard IDs, visible missions và saved/legacy compatibility; Shared ReportWorkspace và phần chart responsive đã có. Sửa/tăng cường đúng owner, không dựng một AI UI riêng lệch preset UI.
8. Supabase chỉ đọc. Không schema migration, DB grants hoặc thao tác destructive để đạt chart count. Thêm metadata logical/derived field phải qua validation/compiler/test; nếu thật sự cần DDL, ghi dependency và xin duyệt đúng gói sau khi chuẩn bị xong.
9. Giữ chu kỳ 5 phút/SLA 15 phút, owner admin. Chứng nhận tháng 09/2026 chỉ áp dụng orders/items theo xác nhận nghiệp vụ đã có; không tự chứng nhận nguồn/kỳ khác. `DA_DUYET` hợp lệ nghĩa đã duyệt, không sửa về enum khác để qua test.
10. Tài liệu vendor là cảm hứng UX/capabilities; **không chuyển stack, thêm SDK cloud hoặc mua dịch vụ**. Không tăng CPU/RAM hay provider budget như một cách mặc định để có thêm chart.

Ranh giới “chỉ tab AI” phải được thực thi bằng **server operation/workflow policy và transport guard**, không tin tên tab, header hay boolean do frontend tự gửi. Secret luôn ở server, không đưa key vào browser để kiểm tab. UI chỉ phản ánh policy; test phải bắt được đường gọi provider gián tiếp từ shared component/service.

## 3. Ba mức phân tích: cùng câu hỏi, cùng nền tảng, thêm chiều sâu thực

### 3.1. Quyết định sản phẩm phải triển khai

| Mức | Câu hỏi giúp người xem trả lời | Bộ chart mặc định khi đủ điều kiện | Giá trị tăng thêm |
|---|---|---:|---|
| **Tập trung** | Chuyện gì, lúc nào, nhóm/kênh nào đáng chú ý? | **4** | Core report: diễn biến, phân khúc, đối chiếu và cơ cấu/phân bố phù hợp |
| **Phân tích sâu** | Sự khác biệt nằm ở đâu, nhóm nào lệch, tương tác nào đáng kiểm tra? | **6** = core 4 + 2 diagnostics | Cross-tab/heatmap, exposure-aware ranking, segmented trend hoặc association hợp lệ |
| **Toàn diện** | Bức tranh đa chiều và các đối chiếu mở rộng cho quyết định là gì? | **8** = core 4 + deep 2 + 2 extended views | Kết hợp chiều, baseline hợp lệ, contribution/driver mô tả, liên miền có chứng minh quan hệ |

Chọn **4/6/8** để đáp ứng tối thiểu bốn và tăng dần, phù hợp max_charts=8 hiện tại. Không âm thầm nâng max_charts lên 12/20, operations hoặc transport quota. Muốn thêm sau tám: người dùng chủ động drill/explore một trang phân tích con, với budget riêng được kiểm soát, không mở thêm chart trùng để đếm.

Các số trên đếm **chart độc lập có ích**, không đếm KPI, table, skeleton, placeholder, tab ẩn hoặc đổi màu/loại của cùng một ý. Không buộc mọi báo cáo có tám loại chart khác nhau; loại chart phục vụ câu hỏi, không phục vụ chỉ tiêu đa dạng hình thức.

4/6/8 là mục tiêu của **toàn report**, không nhân lên theo số requirements/metrics/domains. Report nhiều câu hỏi phân bổ trước ít nhất một bằng chứng thích hợp cho từng requested requirement, sau đó mới bổ sung chiều sâu. Các requested views hợp lệ vượt target vẫn được ưu tiên tới cap; vượt cap thì cần chia phạm vi theo mục 3.2. Không để requirement đầu dùng hết ngân sách khiến câu hỏi thứ hai biến mất.

### 3.2. Bất biến tăng mức

- Cùng canonical intent, scope, time, snapshot và policy: core lens IDs ở focused phải được giữ ở deep và comprehensive; deep diagnostics được giữ ở comprehensive. Chart IDs/lens IDs ổn định theo nghĩa, không theo thứ tự response.
- Đổi mức **không đổi metric, công thức, denominator, tập lọc hoặc câu hỏi chính**; KPI tương đương trên cùng snapshot. Whole-plan fingerprint có thể khác do thêm work; canonical intent/core fingerprint không đổi.
- Mode người dùng chọn là authoritative. UI mặc định deep phải gửi deep; không tự hạ focused vì câu hỏi ngắn. Nếu giữ cơ chế auto cho compatibility API, ghi `requested_depth`, `effective_depth`, `selection_origin=explicit|default|legacy_auto` và hiển thị thật; UI mới không âm thầm dùng auto.
- Mode thay đổi làm invalidation proposal/session plan đúng revision; response cũ/late không ghi đè. Nâng mức dùng lại artifacts chỉ khi owner, access, intent, snapshot, catalog và policy còn hợp lệ. Không reuse KPI cũ ghép với chart thế hệ mới.
- Nếu điều kiện đã đổi (nguồn, quyền, snapshot, capacity), phải giải thích vì sao số view khác. Không lấy monotonicity qua hai snapshot khác nhau làm bằng chứng pass/fail.

Nếu user yêu cầu nhiều phần trực tiếp đã dùng hết tám chart/operations, không bỏ requested work để ép đúng bố cục 4/6/8 và không hứa mode cao tự thêm vô hạn. Hiển thị capacity/saturation rõ, giữ mọi requested evidence có thể thực hiện, đề nghị chia thành các báo cáo con theo lựa chọn user. Rich acceptance scenarios phải chứng minh **giá trị bổ sung thực** của deep/comprehensive, ngoài việc đạt count; không cho cả ba mức cùng tám view chung chung rồi coi là đã phân biệt mode.

### 3.3. Ngoại lệ trung thực, không biến thành cửa thoát cho thiếu implementation

Không có cách đúng để hứa bốn chart thật cho zero rows, một scalar duy nhất không có chiều/lịch sử, field bị cấm, câu hỏi không hỗ trợ hoặc dữ liệu nguồn chưa sẵn sàng. Đích: **mọi bài toán analytic bình thường có đủ dữ liệu nhận tối thiểu 4/6/8; ngoại lệ có nguyên nhân kiểm chứng được**.

- `NO_DATA`: query hợp lệ, nguồn sẵn sàng nhưng không có quan sát; không biến thiếu dữ liệu thành 0 hoặc vẽ chart giả.
- `LIMITED_DATA`: có KPI/ít view hợp lệ nhưng không đủ thời điểm/nhóm/exposure; hiển thị phần có thật, lý do và hành động đổi phạm vi do user chọn.
- `NEEDS_INPUT`/`UNSUPPORTED`: thiếu định nghĩa/ý định hoặc khả năng nghiệp vụ, giữ contract hiện có.
- `SOURCE_UNAVAILABLE`/lỗi execution: lỗi hạ tầng hoặc quyền; không đổi tên thành “không có dữ liệu”, không báo completed đầy đủ.
- `CAPACITY_LIMITED`: số lượng/cost vượt budget; đề nghị giảm chiều/chia báo cáo. Không tăng cap tự động hoặc bỏ core để giữ context phụ.
- `PLANNING_GAP`: nguồn và capability chứng minh đủ lens nhưng planner/render bỏ thiếu; là lỗi sản phẩm **chặn FINAL**, không được ghi là LIMITED_DATA.

Đây là phân loại UI/coverage dự kiến, không yêu cầu phá enum public hiện tại: map tương thích vào outcome/error/state đang có và thêm diagnostics versioned. Danh sách exception của corpus phải đóng trước chạy nghiệm thu; không thêm ngoại lệ sau khi thấy case đỏ.

## 4. Thiết kế analytical planning theo tư duy Data Analyst

### 4.1. Core report contract trên tầng deterministic hiện có

Phân tách **yêu cầu người dùng** và **bộ góc nhìn cần để diễn giải yêu cầu**. Không giả rằng user đã yêu cầu metric khác. Giữ requested/supporting roles cho compatibility; thêm nhóm evidence `core|diagnostic|extended` độc lập với role đó.

Mỗi đề xuất lens cần các trường logic sau (đặt trong contract hiện tại nếu phù hợp; không thêm model trùng):

```text
policy_version, lens_id, parent_requirement_id, analytical_role,
question_answered, metric_refs, component_refs, dimension_refs,
population/denominator contract, time/grain, filter fingerprint,
required_artifact_refs, evidence_refs, applicable_chart_types,
eligibility predicates, candidate_priority, query_cost/reuse estimate,
selection_status, rejection_reason, fallback_lens_ids
```

`question_answered` là ý nghĩa đã khai báo trong metadata, không lấy model prose làm authority. Tách ba phép kiểm: **semantic correctness**, **evidence completeness**, **visual/analytical coverage**. Verified correctness không còn được dùng như bằng chứng “đã đủ góc nhìn”.

### 4.2. Luồng xử lý cụ thể

1. Đóng băng canonical requested intent và scope/time từ luồng hiện có; vẫn sửa semantic thiếu chỉ số/tập lọc bằng cơ chế targeted repair hiện tại, không đổi prompt trước khi có test chỉ ra lỗi interpretation.
2. Xác định question family, metric type (additive/ratio/average/distinct/snapshot), grain, compatible axes, business filters và capabilities thực. Dùng metadata đã kiểm, không route bằng regex câu chữ mới.
3. Lập **core bốn lens** ưu tiên yêu cầu trực tiếp, rồi hai diagnostic và hai extended tùy depth. Cùng core candidate order giữa các mức; protected requested work luôn đứng trước context.
4. Kiểm trước SQL: logical/physical capability, scope, joins, clocks, populations, allowed mission form, time coverage đã biết, pinned dimensions, estimates/cost. Loại trục đã bị lọc về một giá trị; không dùng `order_status` như cách phân đoạn cancellation rate khi chính nó xác định tử/mẫu số.
5. Gộp/reuse operation có signature tương đương. Compile từng query qua compiler/AST/readonly budget hiện tại. Một operation có thể phục vụ nhiều lens **khác nghĩa**; không đổi loại chart cùng dữ liệu để cộng số lượng.
6. Sau execution, kiểm eligibility dựa trên cardinality/non-null rows/time points/denominator/evidence/completeness thực. Không coi estimated_views là final coverage.
7. Chọn chart cuối theo analytical-role coverage, relevance, tính mới và legibility. Tính lại coverage **sau** tất cả grammar/dedup/relevance/capacity filters và sau derived views.
8. Bù chart bằng **một lượt chọn lại từ các artifacts đã thực thi trong cùng batch**. Có thể dự trù tối đa hai fallback operations trong plan trước duyệt; chúng thuộc tổng cap 8 và chạy trong cùng batch/snapshot. Không mở thêm SQL sau `run_batch` để bù vào report đã có. Nếu artifacts vẫn không đủ, chỉ lập deterministic replan theo thao tác rõ của user, tạo revision/job mới và chạy lại bộ query cần thiết cùng snapshot mới theo mục 4.4.
9. Nếu không thể bù: trả lý do theo lens và phân biệt data/capacity/planning gap. Không loop đến đủ chart; không thêm provider call để sửa chart density.
10. Lắp report từ immutable artifacts/evidence; frozen intent, depth policy và selection reasons nằm trong saved report/provenance, verifier độc lập kiểm lại được.

Phải giải quyết sự căng giữa query cap và nhiều charts **bằng kế hoạch gộp truy vấn và reuse**, không chỉ đổi target. Ở P2 lập operation allocation table cho từng family; nếu core bốn cần hơn cap phải thiết kế lại trước mở deep/comprehensive.

### 4.3. Chọn chart đúng và loại chart kém giá trị

- Một category do scope cố định: không vẽ cột “Hồ Chí Minh” để chứng minh đang ở HCM. Dùng scope chip/KPI; chọn store/channel/time/chiều hợp lệ khác cho lens.
- Rate không dùng donut so sánh tỷ lệ nhóm và không cộng/trung bình các tỷ lệ. Mọi tổng hợp lại rate phải có tử/mẫu số tương thích ở grain đó.
- Average cần numerator/count hoặc đủ raw evidence để gộp; distinct counts không cộng giữa nhóm chồng lấn.
- Dedupe theo semantic intent + population + metric/components + group/time grain + analytical question/transform; đổi màu, chiều bar hoặc bar→pie cùng câu trả lời không tạo lens mới.
- Cross-domain chỉ khi trả lời một phần câu hỏi và cohort/time/join/fanout có proof. “Cùng domain” hay “related” không đủ. Revenue mix không thay cancellation mix.
- Ranking theo rate cần exposure đi kèm, chỉ rõ nhóm ít mẫu; không suy “kém nhất” từ 1/1 so với 100/1000. Không ẩn nhóm ít mẫu rồi đổi mẫu số toàn hệ thống.
- Tính số toàn population trong SQL/artifact đầy đủ; preview/table pagination/Top-N chart chỉ là trình bày. `Other` chỉ khi còn phần bù chính xác của tập disjoint/additive, không cộng “Other” cho rate/distinct.
- Clock đúng: creation date, completion/delivery date, ingestion time không tráo cho nhau. Thiếu kỳ khác là missing, không nối smooth line xuyên gap như có dữ liệu.

### 4.4. Execution, snapshot và ngân sách: quyết định triển khai bắt buộc

**Dùng một approved query batch cho một report revision**, tận dụng `AnalyticalQueries.run_batch` hiện tại. Không thêm cơ chế giữ snapshot mở xuyên các thao tác UI hay transaction treo để chờ user chọn chart.

| Tình huống | Hành vi phải có |
|---|---|
| Chọn chart/loại chart khác từ cùng artifact | Không SQL/provider mới; kiểm eligibility/provenance rồi render |
| Core/diagnostic lens bị loại sau execution | Chọn fallback trong artifacts cùng batch, một lượt selection; thiếu vẫn ghi coverage reason |
| Cần SQL mới sau khi batch đã đóng | Đề xuất revision mới deterministic; user bấm thực hiện thì chạy lại toàn bộ query cần cho report mới, không ghép số cũ/mới |
| Nâng depth cần thêm queries | Revision/job/idempotency mới bind canonical intent + effective depth + policy; chạy batch đầy đủ cùng snapshot mới nếu không có toàn bộ artifacts cần thiết thuộc cùng cohort còn hợp lệ |
| Toàn bộ artifacts đã cache cùng snapshot còn hợp lệ | Reuse theo cơ chế hiện tại; giữ original as-of; không giả có current generation proof nếu chưa đo |
| Optional query thất bại | Giữ artifacts cùng snapshot đã pass, phân loại partial đúng analytical role; core lens mang role supporting vẫn là thiếu core, không tự hạ thành optional |
| Một required query lỗi hoặc quyền bị revoke | Giữ hành vi fail/cancel/revoke hiện có; không dùng chart phụ để báo đã trả lời phần bắt buộc |

Metadata source generation vector không phải bằng chứng các bảng nguồn Supabase cùng một transaction. Snapshot nhất quán là tại PostgreSQL analytics; từng nguồn có freshness/completeness riêng. Không ghép hai batch chỉ vì hash generation tình cờ bằng nhau hoặc timestamps gần nhau.

Phân biệt hai cap: **tối đa 8 logical operations** gồm query chính và fallback; **physical SQL attempts** theo `QueryBudget` (mặc định `2*operations+3`, tức 19 khi operations=8) gồm execute, EXPLAIN/dry-run, metadata/direct-reader và lần thất bại đã reserve; transaction controls theo accounting hiện có. EXPLAIN không phải một chart operation riêng, nhưng không được bỏ khỏi physical budget. Không reset budget khi selection fail; không đổi cùng idempotency key sang payload depth khác. Pending filter/depth requests có debounce/Apply, single-flight ở UI, server admission và cancel; hủy không thu hồi HTTP đã gửi. Không có retry tự động vô hạn hoặc chain report con để né cap 8.

### 4.5. Ratio components, rollup và selection có đủ proof

- Mỗi ratio khai báo numerator predicate, denominator predicate, population, grain, clock, allowed segment/filter axes và scale trong metadata server. Giữ công thức public hiện có; components là evidence để giải thích/tổng hợp, không tạo formula frontend mới.
- Chỉ rollup khi giữ **counts/sums chưa làm tròn**, các nhóm disjoint/exhaustive, toàn bộ rows không truncated, cùng scope/time/snapshot và không mất null bucket. Tính rate sau rollup, làm tròn ở bước cuối. Không phục hồi counts từ tỷ lệ đã làm tròn.
- Rate 0% với denominator>0 là số hợp lệ; denominator=0 là undefined; all-null không bằng zero. Numeric overflow/NaN/infinity, total bằng 0, signed measure và rounding boundaries có tests riêng.
- Chọn dimension dựa trên compatibility + relevance rồi mới cardinality; có stable tie-break theo lens ID. Không đổi core chỉ vì comprehensive nhận thêm metadata packs; candidate discovery cho core phải lấy cùng registry, protected requested intent và policy ở mọi depth.
- Grammar hiện có `max_supporting_per_form=1` và budgets focused=0 không thể giữ nguyên cho core mới. Cập nhật **riêng cardinality/budget cho nhóm core/diagnostic/extended** có version; vẫn giữ mission metric/form applicability và semantic dedup. Không tắt relevance/grammar toàn cục để đạt 4/6/8.
- Forecast/risk diagnostic methods không tự chạy theo độ sâu nếu thiếu required history, exposure hoặc certificate. Chỉ dùng method đã governed; thêm feature phải có capability/contract/evidence/oracle trước khi quảng bá trên UI.

## 5. Ví dụ acceptance bắt buộc: tỷ lệ hủy đơn HCM tháng 09/2026

### 5.1. Định nghĩa phải giữ

Metric hiện tại `order_cancellation_rate`: **DA_HUY / (HOAN_THANH + DA_HUY) × 100**, theo ngày tạo đơn, grain order. Các trạng thái đang xử lý không vào mẫu số; không dùng `order_count` mọi trạng thái làm denominator. Công thức đã có không được đổi để “có thêm số”.

“Của khách” trong câu user chưa chứng minh **khách là người thực hiện hủy**. Nếu dữ liệu không có actor/reason/event clock đã governed, nói rõ metric là đơn bị hủy; không tự nhận biết nguyên nhân, người hủy, tiền mất hoặc thời điểm hủy từ trạng thái hiện tại. Nếu user thực sự hỏi actor thì cần clarification/unsupported chính xác.

### 5.2. Bộ lens mục tiêu, áp dụng theo eligibility

| Mức thêm | Lens | Chart đề nghị / điều kiện |
|---|---|---|
| Core 1 | Tỷ lệ hủy diễn biến theo ngày/tuần trong tháng | Line, ít nhất hai thời điểm có denominator; gap/null rõ |
| Core 2 | Hủy so với hoàn thành trong tập đơn đã kết thúc | 100% stacked hoặc donut hai trạng thái từ counts cùng denominator; không trộn đơn đang xử lý |
| Core 3 | Tỷ lệ hủy giữa các chi nhánh HCM | Horizontal bars, tooltip số hủy/tổng đã kết thúc; ít nhất hai chi nhánh, có sample/exposure |
| Core 4 | Tỷ lệ hủy giữa các hình thức nhận hàng | Bars/point comparison; channel phải có ≥2 nhóm; không thay bằng cơ cấu doanh thu |
| Deep +1 | Tương tác kênh × ngày trong tuần/khung giờ phù hợp | Heatmap rate và numerator/denominator; compatible_dimensions thực, không lấp ô missing bằng 0 |
| Deep +2 | Đâu nhiều hủy vì quy mô, đâu có rate cao? | Paired exposure-vs-rate scatter theo branch nếu đủ cặp và field governed; fallback cancellation count ranking với exposure rõ, không fake correlation |
| Comprehensive +1 | Diễn biến phân đoạn theo nhóm có đủ exposure | Multi-line theo kênh/branch đã chọn; cap series; khác trend tổng |
| Comprehensive +2 | Đóng góp số đơn hủy hoặc đối chiếu kỳ đã được phép | Pareto/count contribution theo branch trên tổng số hủy; hoặc comparison kỳ trước nếu cùng định nghĩa và đủ chứng nhận. Không thêm baseline ngoài thời gian ngầm |

KPI gọn: rate, numerator hủy, denominator terminal, số đơn ngoài denominator nếu có evidence và label rõ. KPI không tính trong 4/6/8.

Các tên components như cancellation_count/terminal_count là **nghĩa cần được khai báo và compiler kiểm**, chưa khẳng định hiện có public metric ID tương ứng. Ưu tiên metadata components cho metric ratio và reuse query, tránh tự dựng phép tính frontend. Cần kiểm cardinality/join tránh đếm dòng món thành số đơn.

Nếu một lens không đủ dữ liệu: thay theo thứ tự metadata (ví dụ channel→payment_method, branch→time slice phù hợp), giữ nguyên câu hỏi/phạm vi. Không mở rộng HCM sang toàn quốc hoặc tháng 9 sang mọi thời gian để đạt chart count. Nếu thật sự không có bốn lens độc lập, LIMITED_DATA có số view đạt/thiếu và lý do chứng minh được; case rich fixture vẫn phải đạt 4/6/8.

**Claude phải chứng minh allocation thật ≤8 logical operations và trong physical SQL budget trên compiler**, không coi bảng minh họa là truy vấn đã chạy. Không mặc định mỗi chart phải có một query riêng.

Allocation mục tiêu để P2 chứng minh, không yêu cầu viết SQL tay: Q1 scalar counts/components phục vụ KPI và terminal composition; Q2 time×channel components phục vụ total trend và segmented trend khi rollup đủ proof; Q3 branch components phục vụ branch rate, exposure scatter và contribution/Pareto; Q4 channel aggregate nếu chưa thể rollup Q2; Q5 channel×weekday components phục vụ heatmap nếu compatibility cho phép. Tối đa hai fallback query shapes nằm trong cap. Mỗi view trên cùng result phải trả lời câu hỏi khác nhau và vượt semantic dedup; nếu implementation chưa có component/rollup này thì ghi **implementation gap cần làm**, không tăng cap hoặc lấy trung bình rate để giả reuse.

## 6. Bao phủ rộng toàn hệ thống, không riêng cancellation

### 6.1. Question families độc lập với domain

| Family | Core theo câu hỏi | Deep/Comprehensive tăng thêm | Guard quan trọng |
|---|---|---|---|
| Overview / hoạt động | trend nếu có lịch sử, segment, composition hợp lệ, distribution/comparison | cross-tab, peer/period comparison, contribution | snapshot không bịa history |
| KPI / ratio / conversion | metric + components, trend, segment rate, exposure/composition | interaction, paired exposure, comparison có mẫu số | weighted recompute, không pie rates |
| Ranking / Top-N | requested ranking giữ nguyên, distribution đầy đủ, contribution có denominator, trend theo tập chọn | persistent leaders, peer gap, breakdown hợp lệ | Top-N không tự thành toàn quần thể; không đổi tập top khi so metric khác |
| Trend / change | requested trend, valid comparable periods, segment, volume/components | segmented trend, cross-tab, descriptive driver | kỳ biên/gap/clock và chênh lệch percentage points vs % |
| Comparison | requested groups, aligned trend, absolute delta, compatible breakdown | mix/composition effect mô tả, decomposition nếu đủ evidence | nhóm khác mẫu số không giả đồng nhất/causal |
| Composition / concentration | toàn bộ denominator, share, rank contribution, trend share | concentration/Pareto, segment contribution | chỉ cộng disjoint additive; Others có proof |
| Relationship | paired requested relation, distribution hai biến, segment comparison, relation diagnostics | residual/strata nếu method governed, cross-tab | có pairing key, n, unit/cohort; correlation không causation |
| Forecast | historical trend, forecast+interval, backtest error, seasonal/coverage diagnostics | segment đủ dữ liệu, baseline models/holdout comparisons | không ép forecast nếu thiếu lịch sử; diagnostics không nhân chart bằng zoom |
| Risk / anomaly | signal trend, affected segments, severity/exposure, coverage/baseline view | hotspot cross-tab, peer comparison, incident context | giữ completeness/certificate/method gates, không kết luận rủi ro từ volume đơn thuần |
| Detail / lookup / nguồn hạn chế | verified table/KPI thích hợp | đề nghị bài toán phân tích có thể mở rộng | không buộc 4 charts cho hỏi một ID hoặc danh sách chi tiết; phân loại trước execution |

Không biến family thành UI mission mới trùng lặp. Giữ các mission đang visible và compatibility IDs; family là cách tổ chức metadata/lens requirements. Nếu người dùng chọn mission, core vẫn tuân mission evidence và requested kinds; không nới grammar chỉ để có thêm chart.

### 6.2. Ma trận 16 domain hiện có

Các cột dưới là danh sách **góc nhìn ứng viên cần hiện thực/kiểm khả năng**, không khẳng định mọi tổ hợp metric×dimension hiện đã compile được. P1 lập capability manifest cho từng tổ hợp và đánh dấu current/needs metadata/unsupported với lý do; không tạo bảng nguồn mới theo suy đoán.

| Domain ID | Góc nhìn có ích để xây report | Mở rộng có điều kiện / giới hạn |
|---|---|---|
| orders | doanh thu/đơn/rate, trend, store/channel/status, exposure | cancellation/completion denominator khác order_count; không suy actor hủy |
| order_items | lượng/giá trị dòng món, product/category mix, branch và time | không gọi item revenue là order revenue; chống fanout |
| products | product ranking, category contribution, lượng-vs-value, trend | price/profit/margin không có thì không bịa |
| stores | store ranking, city/region/store-vs-kiosk, AOV/volume, trend | distinct customer không cộng giữa stores; kiosk không suy từ tên |
| customers | role, loyalty/spend distribution, current customer overview | cohort/retention/RFM chỉ khi có IDs+events+clocks+definitions; không dùng lifetime_spend như doanh thu của kỳ |
| promotions | redemption count, discount, eligible revenue, promotion/branch/time | usage ≠ incrementality; không bịa uplift/ROI hoặc causal impact |
| payments | gateway/status counts/value, rate có definition, trend/cross-tab | payment amount/status khác order doanh thu; retries/duplicates phải đúng grain |
| delivery | delivery count/status, success rate/exposure, duration, driver comparison | shipment fact vs driver lifetime snapshot; failed/cancelled thống nhất contract; không gọi Top-N gold mart là toàn bộ |
| inventory | stock by product/store/category, low-stock counts, threshold view, distribution | snapshot không có stock history/turnover/days-cover nếu thiếu movement/demand definition |
| product_reviews | rating distribution nếu raw stars khả dụng, review count, product/category, trend | avg phải có count; reviews không đại diện mọi khách |
| store_reviews | store/city score+sample, distribution/trend nếu đủ clock, comparisons | sample nhỏ/selection bias; không gắn causal revenue effect |
| staff_shifts | shift/late count/rate, store/city, weekday/time nếu capability, attendance composition | ca làm ≠ cá nhân; không suy hiệu suất nhân viên từ số ca |
| cashier_reconciliation | signed difference, absolute discrepancy, reconciled shifts, store/time | không bù âm dương che mismatch; giữ enum DA_DUYET đã xác nhận |
| customer_surveys | response volume, store/city/time, response distribution có trường thật | không bịa NPS/sentiment/response-rate khi không có answers/denominator |
| wishlist_favorites | favorite counts, product/category, concentration, time | yêu thích ≠ conversion; distinct user nếu không có metric thì không cộng/đoán |
| hourly | order profile theo hour/weekday, store/city, heatmap/time | giờ địa phương đúng timezone; peak volume ≠ hiệu quả/lợi nhuận |

Đối với snapshot hoặc miền chỉ một measure, ưu tiên phân đoạn và phân bố thật thay vì bịa time series. Nếu không thể tạo bốn lens độc lập dù đã audit, capability báo limited rõ; không “đạt toàn hệ thống” bằng cách bỏ domain yếu khỏi mẫu số.

## 7. Chart grammar và thư viện hình thức

### 7.1. Tận dụng loại hiện có trước

`analyst_contract.DashboardVisual` hiện có bar, horizontal_bar, line, area, multi_line, donut, heatmap, grouped_bar, stacked_bar, stacked_100, scatter, table; frontend `components/Charts.tsx` đã render các loại này. Có thể tạo trải nghiệm đa dạng trước khi thêm thư viện chart nặng.

| Câu hỏi | Hình thức ưu tiên | Eligibility / tránh |
|---|---|---|
| Diễn biến | line/area hoặc multi-line | ≥2 thời điểm, clock hợp lệ; area chỉ khi additive/nonnegative thích hợp |
| Xếp hạng/so sánh | horizontal/grouped bar | ≥2 nhóm hoặc explicit singleton comparison có ý nghĩa; tên dài không tràn |
| Cơ cấu | donut/stacked_100 | full denominator, additive disjoint; tối đa 5–6 slices thấy rõ, phần khác chính xác |
| Hai chiều | heatmap | 2 dimensions, legend/unit/null rõ, ô có exposure khi là rate |
| Quan hệ | scatter | paired entities, n/units đúng; không ghép hai bảng preview theo vị trí |
| Phân bố | histogram hoặc box plot mới khi cần | bins/quantiles do server tính trên full population, có definitions/outlier policy |
| Đóng góp | Pareto mới hoặc bar tích lũy đã kiểm | cumulative denominator đầy đủ, order đúng, không dùng rate như additive |
| Chênh lệch | diverging bars; waterfall chỉ khi additive decomposition thật | signed values/baseline đầy đủ; không suy causal driver |
| Ngưỡng | threshold/bullet trong bars hiện có | ngưỡng từ contract/business thật; không gauge mục tiêu tự nghĩ |

Trong phạm vi FINAL: thêm **histogram và Pareto** như hai loại mới có use case/corpus thật. Box plot/waterfall chỉ cần nếu manifest chứng minh là lens cần thiết không có hình thức hiện tại thay thế; nếu không, ghi NEXT, không làm đẹp số loại chart. Không chọn map thiếu tọa độ, funnel thiếu ordered event stages, Sankey thiếu conserved flow, radar khác thang đo hoặc 3D chart.

### 7.2. Định dạng và truy vết

Tiếng Việt từ business labels; format nhất quán tiền/tỷ lệ/nghìn/triệu, tooltip giữ số đầy đủ và units. Không hiện enum như `LAY_TAI_QUAN` khi có business mapping. Màu theo cùng entity/status ổn định giữa views, không đổi theo vị trí render. Red cho adverse status có semantics, không mọi số giảm đều đỏ.

Mọi chart có lens/requirement ID, query/artifact/evidence refs, scope/time/population/denominator, full vs preview count và applied filters. “Xem dữ liệu” mở artifact đã bound, không query lại/ngầm gọi model. Không vẽ âm tính là thiếu, không nối gap, không đổi sample thành toàn bộ population.

## 8. UX/UI report dùng chung: gọn, có thứ bậc, đa chiều

### 8.1. Cấu trúc mặc định

```text
[Câu hỏi ngắn]       [Mức đang dùng] [Đủ 6/6 góc nhìn / giới hạn] [Lưu] [...]
[Thời gian] [Phạm vi] [Filter chips] [Áp dụng] [Xóa lọc] [Đồng bộ/coverage]
[KPI 1] [KPI 2] [KPI 3] [KPI 4]          (không viết lại thành đoạn văn dài)
[Chart trọng tâm: 8/12] [Chart cơ cấu/đối chiếu: 4/12]
[Chart phân đoạn: 6/12] [Chart phân đoạn: 6/12]
  Deep:              thêm hàng diagnostics 6/12 + 6/12
  Comprehensive:     thêm hàng extended 8/12 + 4/12
[▸ Trả lời ngắn] [▸ Điểm nổi bật] [▸ Kết luận & bước tiếp theo]
[Báo cáo | Kiểm chứng & nguồn | Dữ liệu / SQL | Lưu & xuất]
```

Tab bar có thể giữ vị trí hiện có nếu interaction tests tốt; không đảo layout chỉ để khớp wireframe. Mục tiêu là chart xuất hiện sớm sau KPI, không có đoạn “trả lời ngắn” dài che hết màn hình.

### 8.2. Thông số để Claude triển khai và QA

- Dùng grid 12 cột hiện có: 8/4, 7/5 hoặc 6/6 tùy vai trò; chart chính không tự chiếm 100% chỉ vì đứng đầu. Một chart lẻ cuối dùng full-width **chiều cao giới hạn**, không tăng chiều cao theo chiều rộng SVG.
- Chart plot height mặc định **214px** (cho phép 200–260 theo loại), card khoảng 300–350px gồm tiêu đề/legend/footer; heatmap cần thêm chỗ thì explicit bounded height, không nested scroll dọc cho chart bình thường.
- Title 13–15px, nội dung/controls 12–14px, axes 10–12px, KPI 24–30px; spacing 12–20px. Không dùng chữ nhỏ tới mức khó đọc để nhét dashboard. Kiểm ở browser zoom 100% và text zoom 200%.
- Desktop 1440×900: thấy header/filter gọn, hàng KPI và hàng chart đầu đầy đủ; màn 1280px không tràn ngang. Ở màn rộng, ưu tiên nhiều chart cân đối hơn là phóng một bar to bằng viewport. 768px xếp hợp lý hai/một cột; 390px một cột, table có scroll riêng.
- Metadata, cách đọc, nguồn/SQL, lưu ý chi tiết, nhận định và **kết luận** đều collapsed mặc định bằng disclosure dùng keyboard/aria-expanded. Không `open` mặc định và không copy cùng narrative ở nhiều khối.
- Lưu ý quan trọng về sai lệch/thiếu nguồn/denominator vẫn có **chip/câu ngắn luôn thấy**; chi tiết xổ ra. Không giấu lỗi làm số liệu có vẻ đầy đủ. Không dùng alert đỏ lớn cho mọi hạn chế thường gặp.
- Legend ngắn, tooltip cho label dài, full title trong accessible name. Không dùng opacity khiến axes khó đọc, không chỉ phân biệt màu. Có table equivalent, keyboard selection, reduced motion.
- Loading theo chart/section, hủy được; chart lỗi giữ phần khác đã verified cùng snapshot nếu contract cho partial. Không stale report mang badge mới, không placeholder giả như chart thật.
- Áp dụng cho **Báo cáo & Phân tích và Trợ lý AI qua ReportWorkspace**, giữ Tổng quan không bị thay cách tính. 16 presets giữ ID/filter/permission/no-provider behavior.

### 8.3. Tương tác BI phải có nghĩa và không dùng key

1. Filter bar hiển thị phạm vi chính và filter phát sinh; có Apply để gom nhiều thay đổi, mặc định không bắn query mỗi phím/hover. Chọn một datapoint tạo filter chip có thể xóa; pending/applied phải phân biệt.
2. Cross-filter trong cùng population: recompile trên server bằng dimension ID + typed value; client không gửi SQL. Áp filter vào numerator và denominator đúng nghĩa, KPI và toàn bộ chart liên quan cùng revision/snapshot. Không filter preview rows rồi giả tính tổng mới.
3. Không hỗ trợ một chiều ở chart khác thì gắn “không áp dụng”/khóa thao tác rõ; không im lặng để chart giữ toàn hệ thống cạnh chart đã lọc. Không cross-domain filter nếu chỉ có related-population edge mà không có scope mapping được kiểm.
4. Drilldown theo hierarchy đã governed, ví dụ region→city→store, category→product hoặc month→week→day. Breadcrumb/back/reset giữ history, không biến đường drill thành quyền xem entity ngoài scope.
5. Local sort/legend highlight/type switch chỉ dùng artifact khi bảo toàn nghĩa. Bất kỳ reaggregation ratio/distinct/average đều server-owned, không cộng lại preview.
6. “Hỏi tiếp bằng AI” là hành động rõ ràng trong tab AI, giữ context đã đóng băng, nêu filter/time đang kế thừa. Ngoài AI có thể điều hướng sang AI kèm draft, **không gọi provider tự động**.
7. Save/reopen giữ depth, view selection, applied filters, policy version và evidence. Reopen là snapshot đã lưu có as-of; refresh tạo revision mới có revalidation. Không tự sửa report cũ sang semantics mới.

### 8.4. Ngữ nghĩa tương tác dễ gây sai số

- **Filter quần thể khác với selection tử số.** Với cancellation rate, click `DA_HUY` trong chart terminal composition mặc định chỉ highlight/inspect tập hủy; không áp status filter cho cả denominator rồi báo 100% là rate của phạm vi gốc. Muốn phân tích riêng đơn hủy phải hiện metric/scope mới và không gắn label “tỷ lệ hủy trên đơn đã kết thúc” cũ. Các axes dùng định nghĩa numerator/denominator được metadata khóa hoặc khai báo selection behavior rõ.
- Tooltip/inspect/forecast/history không tự query hoặc gọi provider khi hover. Inspect mặc định dùng reference đã bound; paging qua endpoint hiện có phải reauthorize và giữ full-result semantics, không mở rộng columns/PII vì đang ở admin UI.
- Report mixed-domain chỉ cross-filter các lens có scope mapping được phép; những lens khác không được đặt cạnh nhau như thể cùng phạm vi. Default khóa cross-filter toàn-report khi không thể giải thích coherent scope; có thể mở drill riêng cho chart.
- So sánh kỳ trước là **comparison scope riêng** được khai báo trong plan/UI, không sửa time range chính. User chọn baseline hoặc requested intent đã rõ mới chạy; timezone, interval endpoints, kỳ đủ/thiếu và period alignment được compiler quyết định. Không suy tháng luôn có 30 ngày.
- Một click Apply tạo một input revision, giữ request cũ có label stale/pending cho tới khi kết quả mới hoàn tất; chỉ publish revision mới atomically. Không update riêng KPI trước rồi chart sau thành dashboard pha hai bộ lọc. Back/reset dùng cùng cơ chế revision và clear pending debounce.
- Default tab “Tất cả” hiển thị đủ 4/6/8 chart của mức đã chọn khi cuộn, không giấu diagnostics sau “Xem thêm”. Có thể lazy-mount khi vào viewport nhưng không fetch/model thêm và không tính skeleton thành chart. Các tab phân loại chỉ lọc cách xem; hiển thị cả số chart đang xem và tổng report rõ.
- Nút “Hỏi tiếp” ở ngoài AI chỉ chuyển tới draft AI; không auto-submit khi mount/chuyển tab. Khi rời AI, hủy debounce/client pending và không bắt đầu provider work mới từ component chung. Job AI đã được user gửi xử lý theo cancel/deadline hiện có, không hứa thu hồi request đã gửi.

## 9. Contracts, compatibility và observability

### 9.1. Một nguồn depth policy

Hợp nhất targets/budgets/labels/descriptions/candidate rules thành server-governed metadata đã validate; frontend lấy từ capabilities. `DEPTH_POLICIES`, dashboard_policy, supporting-chart budgets và verification không được còn bốn con số mâu thuẫn. Context/token-pack budgets có thể khác visual budget nhưng phải đặt tên khác, không dùng số packs làm số charts.

Contract depth mới versioned; legacy reports giữ version cũ. Cập nhật fingerprints chứa policy version, effective depth, selection contract, scope/access/catalog/snapshot, query meaning và relevant render semantics. Không dùng cache comprehensive trả cho deep mà giấu/dổi badge, không purge Redis toàn cục.

### 9.2. Diagnostics tối thiểu

```text
request/job/report correlation ID (opaque), policy/catalog versions,
requested_depth, effective_depth, selection_origin,
question_family, requirement IDs, core fingerprint,
candidate_lenses, admitted/rejected lens IDs + typed reasons,
core/diagnostic/extended: target, eligible, planned, rendered,
requested/supporting counts (compatibility), distinct semantic view count,
query attempts/rows/bytes, artifact reuse, snapshot generation,
provider physical sends (đo thực; null nghĩa chưa đo), duration by stage,
semantic/evidence/visual coverage states, data limitations
```

Reasons phải có cấu trúc: pinned_axis, singleton, no_time_axis, insufficient_periods, zero_denominator, incompatible_population, unsupported_join, missing_metric_component, duplicate_meaning, mission_grammar, cost_budget, source_unavailable, execution_failed, renderer_unsupported. Không catch rồi bỏ candidate im lặng. Log counts/IDs và enums, không question text/SQL/rows/PII/secrets.

### 9.3. Chất lượng report và trạng thái

- `semantic_verified`/`evidence_verified` giữ chức năng kiểm số và nguồn; thêm `analysis_coverage` độc lập với required lenses, eligible count và rendered count sau final gating.
- Có đủ candidate/dữ liệu mà rendered<target: không badge “báo cáo hoàn tất đầy đủ”. Báo partial + diagnostic và chặn gate FINAL cho case đó.
- Limited thật không bị nói sai là số liệu sai; verified number không bị đánh đồng là báo cáo giàu góc nhìn. UI hiển thị đơn giản “Số liệu đã kiểm chứng · 4/6 góc nhìn, thiếu dữ liệu cho 2”.
- Verifier phải tính lại semantic identity, numerator/denominator, referenced artifacts, eligibility và coverage; không tin `analysis_coverage.status` do assembler tự khai. Saved report bị sửa số/count/reference phải bị phát hiện.

### 9.4. Số view, schema và báo cáo cũ

Lập một **visual inventory server-owned** cho report, tham chiếu cả `charts`, derived charts và các plot hợp lệ trong `forecasts`. Không bắt forecast đổi sang generic DashboardVisual nếu contract hiện có tốt; dùng adapter có typed references. Một forecast panel có history+projection+interval overlay là **một view**; forecast error distribution/backtest residual chỉ là view khác khi có tập evidence độc lập tương ứng. KPI, bảng model scores, legend và interval band không được đếm như chart thêm.

Mỗi inventory entry có stable semantic identity, parent requirement, analytical role, artifact/forecast reference, render kind và eligibility. Backend coverage, frontend count, saved verifier và browser test dùng cùng nghĩa inventory; verifier vẫn tính lại từ evidence, không chỉ tin count. Default UI sau khi cuộn phải render được mọi entry counted, không tồn tại “đủ tám” trong payload nhưng chỉ ba thật trên màn hình.

Thêm fields theo schema version; field absent ở report cũ được đánh dấu legacy coverage/not evaluated, không default thành 0-chart failure hoặc tự đánh giá lại bằng policy mới. Không nhận fields security/coverage do client giả mạo làm authority. Generated TypeScript declarations/capabilities fixture, fingerprinting, serialization size/TTL và compatibility readers phải cập nhật cùng contract.

“Lưu & xuất” giữ dữ liệu/units/scope/filter/provenance nhất quán với report đã lưu. User không ưu tiên Word nên không thiết kế lại Word; chart type mới nếu exporter chưa hỗ trợ phải có fallback table/ảnh tĩnh đã kiểm hoặc thông báo export limitation, không âm thầm bỏ chart/số liệu. Nút export không gọi provider để viết lại kết luận.

## 10. Dữ liệu lớn nhưng chạy nhẹ máy

- Pushdown group/filter/bin/aggregate vào SQL compiler; không kéo cả bảng về browser/LLM để “phân tích big data”. Query result giới hạn hiện tại vẫn giữ: default 50.000 rows/operation, 8 operations, 500 chart points, 16 series, response 1MB, preview 50. Kiểm runtime effective values thay vì mặc định trong source là chắc chắn.
- Default SQL attempt budget hiện `2*operations+3` gồm EXPLAIN/metadata; giữ instrumented accounting. Số view không bằng số queries, một view không có quyền phát N queries ngoài cap.
- Query reuse theo signature và population; cached/derived view chỉ dùng full artifact đủ provenance. Histograms/quantiles/pareto tính đúng ở server, có bounded bins/points và full-population totals.
- Preview/downsampling cho trình bày phải công bố; bảo toàn gaps và extrema khi áp dụng. Không lấy 50 dòng preview tính percentile/correlation/total rồi ghi full population. Nếu không đủ full evidence thì dùng SQL query phù hợp hoặc loại method.
- Tải chart phía dưới theo viewport từ artifact đã tạo, không biến lazy rendering thành per-chart model/query fanout. Tắt animation nặng với nhiều marks, memoize selectors, dispose listeners, table pagination.
- Không bật Spark/Airflow chỉ để thêm chart. Runtime quiet caps đang đặt: API 0,5 CPU/1GiB; MinIO 0,2/768MiB; sync 0,2/384MiB; producer 0,1/256MiB; consumer 0,15/384MiB. Giữ hoặc đo lại, không tăng mặc định.
- Test tuần tự, một backend worker và một browser worker; suite lớn chạy sau targeted tests, không build đồng thời soak. Fixture containers chỉ khởi động khi phase cần và dừng đúng fixture sau test, không đụng volumes/runtime người dùng.
- P0 đo baseline query/render latency, CPU/RSS; P7 so cùng workload/máy/caps. Đích: không OOM/restart, không vượt caps, thao tác local p95<200ms; core artifact/render không thoái lui >20% trên cùng workload nếu không có giải thích được chấp nhận. Provider latency đo riêng, không dùng để che SQL/render regression. Mục tiêu UX không tự cấp quyền nới timeout/cap.

## 11. Bản đồ implementation — sửa đúng owner

Đường dẫn đầy đủ dưới đây tương đối với `data-platform/`. Tên Python viết tắt thuộc `analytics-api/services/`; `utils/` và `components/` frontend thuộc `web-ui/src/`; `evals/` thuộc `analytics-api/`. `ChartInsight.tsx` và `VerificationPanel.tsx` nằm cùng thư mục report; `ForecastPanel.tsx` thuộc `web-ui/src/components/`. Số dòng ở mục 1 là baseline, tìm symbol trước sửa. Chưa phải danh sách buộc phải sửa mọi file; Claude chọn diff nhỏ nhất theo responsibility.

| Owner hiện có | Công việc |
|---|---|
| `web-ui/src/views/AnalyticsView.tsx`, `utils/analysisInput.mjs`, `components/workspace/AnalystWorkspace.tsx`, `utils/missionWorkspace.mjs` | Explicit/default depth, UI labels, invalidate/revision và mode contract |
| `analytics-api/metadata/semantic_catalog.json` | Authoring semantic registry hiện tại: depth/lens/component definitions. Không giả định đây là artifact được sinh từ một semantic catalog khác |
| `metadata/data_contracts.json`, `metadata/warehouse_views.json`, `analytics-api/tools/regenerate_pipeline_metadata.py` | Canonical pipeline metadata; generator tạo `analytics-api/metadata/warehouse_views.json`, `analytics-api/metadata/data_health_contracts.json`, `metadata/runtime_data_contracts.json`. Chỉ regenerate nếu thay dependency tương ứng, không sửa generated mirrors tay |
| `analytics-api/services/domain_intelligence_service.py`, `analysis_expansion_service.py`, `analytical_resolver.py` | Mode policy, deterministic core/diagnostic/extended selection, eligibility-before-query, bounded replacement và plan ownership |
| `analytical_blueprint_service.py`, `mission_contract_service.py`, `analysis_intent.py`, `semantic_preflight_contract.py::evaluate_capability`, `analysis_query.py::compile_sql` | Validated lens/component capabilities, compiler-owned SQL/rollup, requested vs supplementary semantics, no silent mission change |
| `analytical_capacity_planner.py`, `analytical_query_service.py`, `query_execution_batch.py` | Gộp/reuse và budget nếu cần; giữ invariants, tránh sửa executor khi metadata planning đủ giải quyết |
| `dashboard_planner_service.py`, `chart_relevance_service.py`, `derived_chart_service.py`, `view_requirement_service.py` | Final coverage sau gating, relevant semantic uniqueness, histogram/Pareto, constraints và reasons |
| `analysis_quality_service.py`, `analysis_quality_contract.py`, `chart_insight_service.py`, `agent_pipeline.py` | Coverage độc lập, verified claims, provenance, diagnostics và report assembly |
| `analysis_job_service.py`, `session_service.py`, `result_artifact_store.py`, `provider_budget.py` | Reuse lifecycle/revision/ownership/deadline/no-provider guards hiện có; chỉ thay nếu contract mới đòi hỏi, không tạo execution path bỏ qua chúng |
| `forecast_service.py`, `answer_requirement_service.py`, `workspace_service.py`, frontend `ForecastPanel` | Forecast/derived visual inventory, evidence/mission layout và compatibility; giữ numerical methods đang ổn |
| `web-ui/src/components/report/ReportWorkspace.tsx`, `ChartInsight.tsx`, `VerificationPanel.tsx`, `components/Charts.tsx` | Shared compact grid, disclosures, chart renderers, inspection/interaction, coverage UI |
| `web-ui/src/utils/aiChartConfig.mjs`, `dashboardPresentation.mjs`, `reportPersistence.mjs` và `.d.ts` tương ứng | Render contract, stable IDs/grid, filters/depth saved semantics; types đồng nhất |
| `analytics-api/tests/`, `evals/`, `web-ui/src/utils/*.test.mjs`, `web-ui/tests/e2e/` | Red regressions, capability/depth corpus, independent oracle, browser + real HTTP boundaries |

Chỉ tách helper mới khi có responsibility rõ và tests; không thêm `final_planner_v4.py`/`smart_chart_fallback.py` song song owner cũ. Nếu thấy circular imports/duplicate owner, note và sửa nhỏ phần cần, không nhân scope thành kiến trúc mới.

## 12. Phases A–Z cho Claude, dependency và Definition of Done

Ước lượng lập lịch: khoảng **12–20 ngày công** tùy capability gaps; không phải cam kết thời gian hay lý do cắt scope. Mỗi phase cập nhật progress: files, invariant, tests, evidence, unresolved. Không lấy số test xanh thay chất lượng phân tích.

### P0 — Đóng băng baseline và tái hiện (0,5–1 ngày)

- Đọc tài liệu này và paused backlog; status/diff/hash trước sửa, không resume CI/release cũ.
- Chụp minimal source/policy/quiet resource baseline; liệt kê known working flows. Không đọc .env hoặc private profiles để lấy key.
- Lưu sanitized diagnostic receipt cho câu hủy, implicit/explicit ba depth; phân biệt live telemetry với offline fixture. Thêm test **đỏ đúng lý do** cho UI default-depth mismatch và zero-chart scalar analytical request trên rich fixture.
- DoD: biết request nào/family nào, điều gì chưa đo; frozen reproduction không cần model thật; không dùng tiny fixture vốn thiếu dữ liệu làm cớ cho mọi case.

Tạo `AI_DATA_ANALYST_FINAL_PLAN.progress.md` khi bắt đầu triển khai (chưa tạo giả progress trong lượt PLAN), ghi từng P0–P8 là NOT_STARTED/IN_PROGRESS/PASS/BLOCKED và link evidence. Dùng thư mục evidence riêng `evaluation/ai-data-final-20261019/`, không ghi đè receipts V3.4/V3.5 cũ. Nếu ngày triển khai khác, ghi thời điểm thực trong receipt, không backdate.

### P1 — Chốt depth contract và capability manifest (1–2 ngày)

- Hợp nhất policy 4/6/8; define core/diagnostic/extended và versioning. Explicit/default UI phải khớp backend; legacy-auto được nhận diện riêng.
- Audit 43 metrics/33 dimensions/16 domains: lịch sử/snapshot, components, compatible joins, aggregation/exposure, candidate lenses và methods. Mỗi domain có ít nhất hai bài toán đại diện + ca hạn chế; không chỉ first lens.
- Freeze acceptance manifest trước implementation: đủ điều kiện/limited/unsupported, expected lens roles và forbidden outcomes, không frozen chart style quá chặt.
- DoD: policy/capabilities/schema tests xanh; không đổi numeric semantics cũ, không đổi API permission/provider behavior. Với từng domain/family, chứng minh target nào achievable từ nguồn hiện có; gap do thiếu component/renderer trong phạm vi phải có owner/phase, không bị đổi thành “thiếu dữ liệu”.

### P2 — Planner có core thực và scope preservation (2–3 ngày)

- Implement trên expansion/resolver/blueprint owners. Giữ core selection độc lập mode; plan richer views theo family thay sorted generic metric/lens padding.
- Thêm ratio components/exposure evidence nếu thiếu qua catalog/compiler validation; không tự thêm DB schema.
- Lập operation allocation cho 4/6/8: query chính/fallback trong logical cap, EXPLAIN/metadata/execute trong physical cap theo mục 4.4; gộp query có meaning tương đương, reserve requested work. Giữ một batch/snapshot; proof cho component rollup và template đa-requirement bắt buộc trước mở rộng UI.
- DoD: rich cancellation case và additive/snapshot families có planned core đủ, mode monotonic; tất cả query chỉ từ approved plan và cùng filters/time/population đúng nghĩa.

### P3 — Chart eligibility, replacement và coverage độc lập (2–3 ngày)

- Kiểm sau execution và sau final gate; loại singleton/irrelevant/duplicate padding. Một lượt chọn fallback từ artifacts cùng batch; SQL mới cần deterministic replan/revision và toàn-report snapshot mới, không hidden provider/query loop.
- Implement coverage verification, typed reasons, correctness vs breadth status. Cập nhật stale tests đang cho scalar-only verified là đủ visual experience; giữ numeric verification cũ.
- DoD: xóa chart/core lens hoặc tráo denominator làm gate đỏ; data-limited thật ra đúng state; mode target không còn chỉ là diagnostics trang trí.

### P4 — Đa dạng chart có evidence và report narrative gọn (1–2 ngày)

- Tận dụng 11 loại plot hiện có; histogram/Pareto thêm contract/compiler/renderer/oracle khi có use case đã freeze.
- Candidate types theo grammar; insight/conclusion từ validated evidence, không tự sinh causal findings. Kết luận và giải thích collapsed, không thêm model synthesis path.
- DoD: chart semantics/unit/legend/null/cardinality và loại mới có independent oracle; thay chart type không đổi nghĩa/số.

### P5 — Workspace UI compact và mode comparison (1,5–2,5 ngày)

- Shared grid/cards/disclosures; chart heights hữu hạn; dùng actual report payloads rich và limited.
- Cho thấy ngắn gọn khác biệt mode trước submit và effective mode/coverage sau report. Có thể xem thêm diagnostics theo section, không yêu cầu user đọc SQL để biết vì sao 0 chart.
- DoD: screenshots desktop/tablet/mobile, text zoom/keyboard; default collapsed; không plot khổng lồ, không overflow, không model send khi mở/chuyển view.

### P6 — Tương tác và compatibility (1–2 ngày)

- Typed cross-filter và drilldown, breadcrumb/reset, batch Apply; scope/access validation server; không filter preview để tính số.
- Save/reopen/refresh, follow-up, mode upgrade và stale-response suppression. Version cũ mở lại được, verifier semantics cũ đúng, không auto rewrite artifacts.
- DoD: interaction tests chứng minh số/filter/numerator/denominator đồng bộ và 0 extra provider sends; click DA_HUY không đổi denominator ngầm; unauthorized/expired artifacts fail đúng; atomic publication, back/reset và upgrade/downgrade không trộn snapshot.

### P7 — Regression, hiệu năng và runtime proof (1,5–3 ngày)

- Chạy corpus/targeted suites → full backend/web/eval/browser cần thiết **tuần tự**; giữ fixture isolation và zero-network guards. Rerun chỉ khi thay code mới/lỗi liên quan.
- Read-only runtime smoke cùng câu cancellation và representative queries: trước hết reuse saved/artifact/guided semantic intent đã xác minh; kiểm nguồn, API → browser thực, counts/latency/resource. Không gọi provider thật chỉ để có screenshot.
- Nếu cần chứng minh live interpretation, chuẩn bị frozen prompts, expected semantics, cap physical sends, ledger baseline và phương án no-progress stop rồi **xin duyệt mới cho lượt đó**; quota còn không đồng nghĩa được phép chi tiêu. Trong khi chưa duyệt, đánh dấu live interpretation NOT_RUN, không giả pass; không chặn phần offline không phụ thuộc.
- DoD: receipts theo exact source fingerprint/candidate, không pha bằng chứng revision khác; gaps, budget, null-vs-zero metrics rõ.

### P8 — Review, demo và bàn giao (0,5–1 ngày)

- Review diff/invariants, không refactor các phần đang ổn. Tự sửa findings có bằng chứng; cập nhật progress và acceptance hiện trạng, không sửa lịch sử receipts cũ.
- Demo 4/6/8 cùng câu, thêm một snapshot domain, một câu cross-domain hợp lệ và một no-data/unsupported case. Chỉ số core giữ nghĩa khi đổi mode.
- Bàn giao file changes, commands/checks, screenshots, limitations, rollback; **không commit/push/trigger CI**. CI remote sau này do người dùng đẩy; ghi pending đúng, không gọi toàn bộ release FINAL_VERIFIED khi chưa có bằng chứng.

Thứ tự: P0→P1→P2→P3; P4/P5 theo contracts ổn; P6 sau coverage/UX; P7→P8. Ưu tiên sửa default-depth và core relevance sớm, nhưng không dừng ở patch UI default.

## 13. Kế hoạch kiểm thử và tiêu chí nghiệm thu cứng

### 13.1. Corpus rộng và frozen trước sửa

- **Tối thiểu 32 domain scenarios**: hai cho mỗi 16 domain, ba depth → **96 lượt** deterministic integration. P1 phân loại mỗi scenario/depth là `RICH_ELIGIBLE`, `LIMITED_BY_DATA`, `LIMITED_BY_SOURCE_CAPABILITY` hoặc `IMPLEMENTATION_GAP`, kèm proof. Fixture rich phải có đủ cardinality/clock/variations trên schema/metric thật; không chèn lịch sử hay fields nguồn không có. Implementation gap thuộc phạm vi PLAN phải được sửa, không chuyển thành exception. Domain không đủ tám lens thật vẫn xuất hiện ở cả ba mức với expected honest state; không giả rich để ép chart.
- **Tối thiểu 18 family scenarios**: hai cho mỗi chín analytic families ở mục 6.1, ba depth → **54 lượt**, phân loại eligibility giống domain manifest (không đếm detail/lookup vào promise chart). Có thể reuse fixture data, nhưng ID/expectations riêng, không đếm trùng 96 lượt domain như thêm coverage mới.
- **Tối thiểu 24 edge scenarios**, mỗi case qua ba depth khi có nghĩa: no rows, all null, zero numerator, zero denominator, singleton/pinned dimension, one time point, no history, sparse/partial periods, missing source, source stale, permission denied, wrong joins/fanout, unequal exposure, duplicate labels/IDs, high cardinality, query cap/timeouts, cancellation/revoke, tampered saved artifacts, repeated/multi-metric intent, filtered ratio, cross-domain incompatibility, Top-N vs full denominator, provider unavailable, stale UI response.
- Case hủy HCM: implicit/default, explicit ba mức, có/không mission, thay synonym có/không dấu, ngày/thành phố khác và no-data. Fixture rate tính độc lập, không “bắt trả 4,7%”.
- Holdout thêm phrasing/domain combinations chưa dùng để tune; freeze trước P7. Tất cả family/domain cả limited đều có trong manifest; không chỉ chạy bộ demo đẹp.

Manifest máy đọc được tối thiểu: `case_id, domain/family, question, canonical_intent, requested_depth, input_mode, policy_version, fixture_hash, expected_state, eligible_lens_ids, required_core_ids, expected_min_views, expected_max_queries, forbidden_views, oracle_ref, exception_proof`. P1 freeze ít nhất **một chuỗi 4→6→8 rich** cho mỗi analytic family có đủ khả năng, và ít nhất **tám domain khác nhau** có rich core≥4. Nếu audit chưa đạt mức đa dạng này, đó là blocker coverage cần hoàn thiện, không được hạ mẫu số hoặc tuyên bố FINAL bằng vài case sales. Source capability thiếu thật phải được công bố để người dùng quyết scope, không tự bịa nguồn.

Test phải tách **semantic understanding** và **deterministic execution**: scripted intent kiểm planner/SQL/render, không chứng minh model hiểu mọi paraphrase. Giữ semantic corpus hiện có, bổ sung held-out prompt→intent expectations độc lập; live interpretation chưa chạy phải ghi riêng NOT_RUN. Không dùng intent tự viết làm bằng chứng hệ thống đã hiểu đúng câu nói thật.

### 13.2. Assertions bắt buộc

| Gate | Điều kiện pass |
|---|---|
| Depth authority | UI badge, payload, proposal, job, report, saved/reopen đều cùng depth; explicit không bị hạ; legacy auto rõ |
| Rich visual floor | Từng scenario/depth được freeze là RICH_ELIGIBLE đạt **≥4 / ≥6 / ≥8** charts độc lập tương ứng, đúng vai trò; không vượt cap 8 mặc định. Một case đủ focused nhưng thiếu chiều cho comprehensive dùng expectation/proof riêng cho từng mức |
| Relevance | 100% admitted charts có analytical question và evidence phù hợp; **0 irrelevant-padding, 0 fake singleton-padding, 0 duplicates** |
| Monotonicity | Cùng intent/snapshot/access: core lens set F ⊆ D ⊆ C; core KPI/phạm vi/denominator không thay |
| Arithmetic | Independent Python/SQL oracle kiểm counts, weighted rate, average/distinct/additive và full population; không dùng compiler output làm expected của chính nó |
| Coverage honesty | No-data/limited/capacity/source-error khác nhau; fixture đủ dữ liệu thiếu core là fail; correctness verified không tự pass breadth |
| Denominator | Tỷ lệ hủy dùng terminal cohort; scalar và grouped/rerun/filter đều đúng; 0 denominator = null/undefined, không 0% giả |
| Bounds | ≤8 logical operations kể cả fallback đã duyệt, physical attempts theo QueryBudget, chart points/series/rows/bytes không vượt effective cap; không SQL bù sau snapshot đóng |
| Provider boundary | Mocked spy + actual HTTP fixture chặn external: non-AI tabs/filter/save/export/type switch/depth expansion = **0 physical sends**; không chỉ assert call_count của facade |
| Persistence/security | Owner/access/catalog/policy/snapshot fingerprints, idempotency/cancel/revoke và saved legacy behavior giữ; tamper bị chặn |
| UI | Chart height hữu hạn, 12-col ratio hợp lý, 4/6/8 views hiện được theo mode, disclosures đóng, keyboard/mobile/text-zoom đúng |
| Inventory | Forecast/derived/generic plots đếm nhất quán; không đếm bands/KPI/table; mọi counted view render được trong “Tất cả” khi cuộn |
| Filter semantics | Numerator/status selection không làm denominator thành chính numerator; atomic revision, stale responses và mixed-domain mapping đúng |
| Regression | Existing semantic/capability/mission/16 presets/jobs/auth/query safety/fixtures vẫn xanh hoặc phải báo regression đúng; không xóa test để đạt |

Hai chỉ số coverage cần report riêng: tỷ lệ rich scenarios đạt target và tỷ lệ **mọi scenarios** trả đúng semantics/state. Không bỏ limited/unsupported khỏi mẫu số toàn hệ thống; không phạt honest limited bằng cách ép fake chart.

### 13.3. Kiểm tra ở từng tầng

- Unit: policy/default-depth, candidate scoring/relevance, ratio components, dedup/eligibility/fallback/coverage, renderer transforms và saved contract migration.
- Integration: production resolver/compiler/executor/artifact/verification trên fixture; giữ network/DB external guards. PostgreSQL fixture cho SQL mới/shape mới, SQLite chỉ oracle algebra không chứng minh PostgreSQL runtime.
- Browser mocked và actual-HTTP fixture: cùng câu ba mức, assertion chart semantic IDs/labels chứ không chỉ screenshot/số card; click filter/drill/reset/reopen/back/cancel. Assert requests/provider transport, không chỉ DOM.
- Metamorphic: đảo requirement order không đổi core meaning; tương đương filter synonyms sau grounding; thêm unrelated metadata không đổi relevance; tăng depth không đổi requested scope; đổi top-N/render preview không đổi full totals; dữ liệu cùng rate khác exposure không suy cùng mức chắc chắn. Thử 2–3 requirements thuộc nhiều domain để kiểm fairness, requested preservation và cap; thử grammar cũ max-one-per-form, default UI chưa chọn lại depth, upgrade rồi downgrade và page reload/reopen.
- Fault: optional lens query fail nhưng core tốt; core query fail; candidate bị mission grammar loại; expired artifact; permission revoke; query timeout; provider unavailable. Không đổi failed core thành success bằng chart context.
- Hiệu năng: 4/6/8 charts, nhiều entity, 500 points/16 series giới hạn; worst-case candidate count bounded, một selection fallback vòng. Cùng máy/caps kiểm CPU/RSS/render p95 và no restart. Benchmark dữ liệu synthetic scale lớn chỉ trong fixture cô lập (ít nhất hai mức kích thước được ghi nhận); không seed/copy raw production vào repo. Report rows scanned/returned, aggregation placement, cache hit/miss và timings để chứng minh xử lý rộng, không lấy số chart làm bằng chứng “big data”.

### 13.4. Lệnh và nguyên tắc chạy

Dùng runner repo hiện có; các tên test mới do Claude chọn theo responsibility. Không chạy lệnh provider live mặc định. Kiểm lại CI/scripts để không dùng counts lịch sử như expected số test mới.

```bash
# Chạy ở repo root; targeted modules trước, thay tên bằng module thật đã thêm/sửa.
.claude/scripts/dp-test.sh module tests.test_dashboard_minimum_views_v212 tests.test_v32_mission_reliability
.claude/scripts/dp-test.sh web
.claude/scripts/dp-test.sh eval
.claude/scripts/dp-test.sh e2e
# Full backend sau khi targeted xanh, một lần cuối cho source candidate:
.claude/scripts/dp-test.sh backend
```

Các lệnh này thuộc **triển khai sau**, không phải đã chạy lại trong lượt PLAN. Actual HTTP fixture qua `.claude/scripts/dp-fixture-http.sh` sau khi đọc cách dùng và caps. Không start toàn stack bằng `up -d` chung. Nếu đổi web, build/recreate **chỉ dịch vụ cần** theo rules và xác minh bundle cổng 8501 thực tế; kiểm dependencies trước, tránh `up --build web-ui` kéo restart API giữa test/job. Không tuyên bố UI live đã cập nhật chỉ dựa `npm run build` local.

Khi chạm metadata pipeline: `python3 data-platform/analytics-api/tools/regenerate_pipeline_metadata.py --check` chạy offline ở root; nếu cần regenerate thì chạy cùng script không `--check` rồi review đúng generated diffs. Semantic registry validation/capabilities fixture dùng validator và `tools/regenerate_capabilities_fixture.py` hiện có theo hướng dẫn script; generator pipeline **không** tự compile mọi semantic formula/lens. Test mới gọi production pipeline hiện tại; không vô tình import `tests.archive_planner` rồi chứng minh nhầm legacy engine.

## 14. Rollout, compatibility và rollback

1. Giữ policy cũ cho saved reports cũ; plan mới versioned chỉ áp report mới/explicit refresh. Stage deterministic feature flag/policy switch nhỏ trong owner hiện có nếu cần rollback, không thiết kế dual engines.
2. Chạy shadow comparison **offline** trước: canonical intent cũ vs lens policy mới, numbers/filters/provenance phải bảo toàn. Không mirror provider calls thật để shadow.
3. Canary rich cancellation cả ba depth, additive sales, snapshot inventory và limited case; kiểm UI/API/resources. Xác minh default UI mới không đi auto focused.
4. Mở rộng đủ corpus/16domains/16presets; rollout only changed service với resource caps giữ. Tiếp tục tuân gói quyền/schema đã duyệt; không coi PLAN này là duyệt mọi thay đổi DB/paid calls.
5. Nếu numeric/scope/auth regression hoặc CPU runaway: tắt policy mới qua switch có kiểm, giữ report artifacts/version cũ; không reset Redis/DB/offset, không rollback user changes bằng Git. Ghi failed case, evidence và điều kiện bật lại.
6. Không gắn FINAL chỉ vì canary ổn. Cần P8 và checklist dưới đủ bằng chứng.

## 15. Định nghĩa FINAL cho phần AI Data trong phạm vi này

- [ ] Hai lỗi gốc default-depth mismatch và scalar analytical request nghèo views có red→green evidence.
- [ ] Một nguồn policy 4/6/8; UI/server/job/reopen khớp; nâng mode có giá trị và monotonic lens coverage thật.
- [ ] Toàn bộ rich domain/family corpus đạt target; holdout không bị hardcode. Không irrelevant revenue padding cho cancellation.
- [ ] Limited/unsupported/source/capacity states trung thực, có typed reasons; đủ dữ liệu mà thiếu chart vẫn fail.
- [ ] Numerator/denominator, scope/time/joins/SQL guard/verification giữ đúng; chặn rate sum/mean và fanout.
- [ ] Histogram/Pareto theo use case có provenance; tận dụng chart library hiện có, không chỉ đổi style để tăng loại/số chart.
- [ ] Snapshot/batch/approved-plan contract giữ nguyên; fallback không mở query ngoài revision; ratio components/rollups có proof và độc lập với rounding.
- [ ] Forecast/derived visual inventory và default canvas count khớp; legacy reports/export có fallback tương thích, không bỏ nội dung im lặng.
- [ ] Reports/AI workspace compact, responsive, disclosures và kết luận đóng; cross-filter/drilldown/save/reopen có test và UX rõ.
- [ ] Không phát sinh provider usage ngoài workflow AI; expansion/filter/export 0 sends; ledger/quota không reset hoặc tăng ngầm.
- [ ] Existing working flow/regression gates xanh; có runtime bundle/API smoke và performance trong quiet caps.
- [ ] Source fingerprint, commands/logs, screenshots, exceptions/limitations và manual demo được bàn giao. Không dùng bằng chứng cũ như vừa chạy lại.
- [ ] Người dùng có thể giải thích khi demo: focused là 4 core views; deep thêm 2 diagnostic views; comprehensive giữ 6 và thêm 2 extended views; chỉ số/phạm vi không đổi.

Gói bàn giao tối thiểu gồm: progress P0–P8; capability/eligibility manifest và frozen corpus hashes; red→green reproduction; domain×family×depth acceptance matrix; source/diff fingerprint; numeric/relevance/coverage test receipts; provider-boundary measured sends; snapshot/budget/performance receipts; desktop/mobile screenshots và manual demo; compatibility/export limitations; rollback switch/steps. Mỗi receipt có command, thời gian, source fingerprint, pass/fail/not-run và phạm vi. Không cần commit để tạo fingerprint; hash file nội dung cùng diff là bằng chứng candidate local, không mượn SHA cũ để mô tả source đã sửa.

Nghiệm thu local của phần AI này có thể ghi **AI_SCOPE_LOCAL_ACCEPTED** khi đủ gate tương ứng. Global release/remote CI cũ vẫn theo backlog riêng; CI chưa chạy hoặc live interpretation chưa duyệt phải ghi NOT_RUN/PENDING, không gọi FINAL_VERIFIED toàn hệ thống. Không làm mới mục tiêu bằng những tính năng ngoài phạm vi để trì hoãn hoàn thành.

## 16. Nguồn tham khảo official đã đọc và cách áp dụng có chọn lọc

Đã mở tài liệu ngày 19/10/2026. Một số URL user gửi đã redirect sang trang mới; bên dưới dùng đích chính thức. Đây là cơ sở tham khảo, còn **4/6/8, budgets, phases và invariants là thiết kế đề xuất cho Avengers**, không phải vendor đảm bảo.

| Nguồn | Ý lấy cho Avengers |
|---|---|
| [Databricks Genie](https://docs.databricks.com/aws/en/genie), [Chat in Genie One](https://docs.databricks.com/aws/en/genie-one/chat) | Hỏi dữ liệu với context nghiệp vụ được quản trị, xem knowledge sources; áp vào scope/context/evidence rõ và follow-up có kiểm soát. Không copy quyền cho AI tạo/xóa agents hay công cụ external |
| [AI/BI Dashboards](https://docs.databricks.com/aws/en/dashboards), [dashboard settings](https://docs.databricks.com/aws/en/dashboards/manage/settings) | Canvas, cấu hình format/theme; Apply filters gom thao tác để giảm query. Không bật AI khi xem dashboard |
| [ThoughtSpot Spotter docs](https://docs.thoughtspot.com/cloud/26.10.0.cl/spotter), [Using Spotter](https://docs.thoughtspot.com/cloud/26.10.0.cl/spotter-using) | Natural-language analytics dựa model/business context; dùng làm tham khảo luồng câu hỏi và khám phá. Trang [Spotter product](https://www.thoughtspot.com/product/agents/spotter) là marketing, không dùng để chứng minh capability local |
| [ThoughtSpot Liveboards and Answers](https://docs.thoughtspot.com/cloud/26.10.0.cl/liveboards) | KPI/charts/tables cùng workspace, drill/filter/back/reset, chia tab theo audience; chuyển thành report canvas compact, có hướng khám phá |
| [Power BI report creation](https://learn.microsoft.com/en-us/power-bi/create-reports/), [visual interactions](https://learn.microsoft.com/en-us/power-bi/create-reports/service-reports-visual-interactions) | Tách filter, highlight và drill; mỗi tương tác có phạm vi rõ, không mặc định mọi chart cùng filter được |
| [Microsoft Fabric overview](https://learn.microsoft.com/en-us/fabric/fundamentals/microsoft-fabric-overview) | Tham khảo cách thống nhất trải nghiệm analytics trên dữ liệu/governance chung; không thêm workload cloud/OneLake vào hệ thống |
| [Snowflake Snowsight](https://docs.snowflake.com/en/user-guide/ui-snowsight), [Cortex Analyst](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst) | Worksheet/data/chart/query history khác nhau; semantic definitions/relationships và verified examples giúp giảm mơ hồ. Avengers tiếp tục compiler/server ownership hiện tại, không chuyển sang model-generated SQL trực tiếp |
| [Looker Explore](https://docs.cloud.google.com/looker/docs/creating-and-editing-explores), [LookML](https://docs.cloud.google.com/looker/docs/what-is-lookml) | Dimension/measure/filter và logic dùng lại từ semantic model; không tự cộng distinct/average chỉ vì table có subtotal |
| [Tableau dashboards](https://help.tableau.com/current/pro/desktop/en-us/dashboards.htm), [Dashboard Actions](https://help.tableau.com/current/pro/desktop/en-us/actions.htm) | Action filtering/highlighting/navigation có chủ đích; chọn datapoint có hành vi và reset rõ |
| [Monte Carlo observability concepts](https://montecarlo.ai/blog-what-is-data-observability) | Freshness, quality, volume, schema, lineage gợi cách diễn giải data health. URL platform user gửi hiện redirect sang [Agents](https://montecarlo.ai/platform/agents); không biến thành yêu cầu thêm agent framework |
| [Bigeye dashboard docs](https://docs.bigeye.com/docs/dashboard) | Health/coverage/reliability gắn time/source filters và đi tới issue liên quan. URL `/product` user gửi không tải được qua công cụ; đã dùng docs chính thức, không bịa đã xem UI trang đó |

Không có yêu cầu nhúng vendor, dùng key của họ, scraping UI hoặc sao chép branding. UI tham khảo trong ảnh chỉ thể hiện mong muốn density/hierarchy; giữ thiết kế và nguồn dữ liệu Avengers.

## 17. Prompt giao Claude — có thể dùng nguyên văn

> Đọc `CLAUDE.md`, rules liên quan, `data-platform/AI_DATA_ANALYST_FINAL_PLAN_20261019.md` và `AI_DATA_PAUSED_WORK_20261019.md`. Triển khai P0–P8 của PLAN AI mới, giữ nguyên phần hệ thống đã chạy ổn. Công việc CI/release cũ tạm dừng, chỉ ghi backlog, không tự resume. Trước tiên tái hiện UI mặc định deep nhưng payload thiếu depth và scalar cancellation bị focused/0 chart bằng test offline, rồi sửa đúng owner và làm bộ core/diagnostic/extended 4/6/8 cho toàn bộ question families/domain capabilities. Không chỉ sửa prompt hủy đơn, không tăng count bằng chart một cột/khác metric không liên quan, không fabricate khi thiếu dữ liệu. Giữ metric formula, terminal denominator, scope/time, readonly SQL, security/jobs/cancel/revoke/CAS/ledger và compatibility. Provider chỉ workflow Trợ lý AI; mọi BI/filter/drilldown/save/export/type switch/depth expansion 0 physical sends. Không gọi live provider khi chưa có duyệt mới cho đợt kiểm đó. CPU/RAM chạy nhẹ, test tuần tự. Mỗi phase cập nhật progress và bằng chứng, chạy checks đúng phạm vi; product changes chỉ sau khi test đỏ rõ và contracts đã chốt. Không commit/push, không đổi Git history, không tự trigger remote CI; để tôi tự đẩy. Kết thúc bằng acceptance trung thực theo source fingerprint, manual demo, những gì đã pass và những gì chưa chạy/đang blocked; không ghi FINAL khi còn planning gaps hoặc hard gates đỏ.

> Tuân quyết định R2: một approved batch/snapshot mỗi report revision; fallback chỉ chọn artifacts cùng batch, SQL mới phải replan/revision đúng quyền; phân biệt logical operations với physical attempts. Status selection không được làm sai mẫu số. Freeze eligibility từng scenario/depth, inventory gồm cả forecast và kiểm actual rendered views; implementation gap không được đổi thành ngoại lệ thiếu dữ liệu. Những giả định về capability/rollup chưa chứng minh phải được giải quyết tại P1–P2 trước khi tuyên bố đủ 4/6/8.

## 18. Checklist tự kiểm của người triển khai trước bàn giao

1. Mở lần đầu không bấm lại nút depth: UI deep phải gửi deep và backend deep.
2. Cùng câu cancellation HCM tháng 9 trên rich fixture: bốn core views đúng cancellation; deep giữ bốn và thêm hai diagnostics; comprehensive giữ sáu và thêm hai extension.
3. Trên dữ liệu thật nếu cardinality khác, giải thích/ghi receipts đúng; không hardcode số chart/KPI mong muốn và không bịa khả năng nguồn.
4. Mở report: biểu đồ xuất hiện sớm; trả lời dài/nhận định/kết luận chỉ xuất hiện khi bấm mở. Một chart không phóng cao theo viewport width.
5. Chọn branch/channel filter: KPI và chart liên quan thay cùng revision, rate denominator đúng; reset trở về phạm vi ban đầu; stale response không thay kết quả mới.
6. Tắt/mock provider unavailable: presets, inspect, filter, save, export và deterministic depth expansion còn hoạt động theo dữ liệu/quyền; không key fallback ngoài tab AI.
7. Saved report cũ mở đúng version/as-of; refresh tạo report mới đã kiểm; không dùng stale certificate hoặc quyền cũ.
8. Tất cả kiểm tra, giới hạn và ảnh có revision/thời gian; Git chỉ được đọc. Bàn giao rõ để người dùng tự commit/push.

## 19. Ghi nhận rà soát R2

Đã đối chiếu lại source về batch/snapshot/cache, approved-plan và jobs, capability/compiler, metadata generator, mission grammar, forecast renderer và physical SQL accounting. Các khoảng trống được chốt thêm: fallback sau execution; rollup ratio; filter trạng thái và atomic report revision; phân bổ nhiều requirements; inventory forecast; legacy/export; eligibility theo domain/depth; evidence và điều kiện nghiệm thu. Rà soát này chỉ cập nhật PLAN, không phải kết quả chạy lại test sản phẩm.

Các điểm phải chứng minh khi triển khai vẫn được giữ rõ: component/rollup có compile được trong budget; nguồn thực có đủ lens độc lập theo manifest; mixed-domain filter mapping; latency/CPU ở quiet caps; model hiểu held-out prompts. Không mặc định các điểm này đã đạt vì tài liệu đã hoàn chỉnh. P1–P2 phải ghi proof hoặc blocker cụ thể; không tự giảm mục tiêu, thay công thức, nới quyền/cap hoặc bỏ domain để đóng FINAL.
