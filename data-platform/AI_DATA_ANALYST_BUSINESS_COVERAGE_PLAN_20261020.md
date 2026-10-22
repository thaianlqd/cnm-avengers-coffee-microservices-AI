# PLAN — AI Data Analyst hiểu đúng phạm vi toàn hệ thống

**Cập nhật 21/10/2026 · revision R4 — bổ sung PLAN khóa ý nghĩa đầu vào tại mục C · INPUT_PLAN_READY / IP1–IP7_NOT_IMPLEMENTED.** Kết quả triển khai business coverage P0–P8 và các blocker riêng nằm ở phụ lục B; không dùng trạng thái PLAN đầu vào để phủ lại các kết quả đó. Một tài liệu duy nhất gồm prompt giao Claude, kế hoạch, audit và checkpoint; bằng chứng đầu vào mới nằm ở `evaluation/input-integrity-20261021/`.


## Cách dùng và mục lục

Chỉ cần giao file này cho Claude. Đọc prompt bên dưới, mục 0–2 và checkpoint; sau đó mở đúng phase và nhóm nghiệp vụ Bxx đang làm. Không cần nạp lại toàn bộ PLAN trong mỗi lượt. Audit nằm ở phụ lục A, checkpoint cập nhật trực tiếp ở phụ lục B.

- [Prompt giao Claude](#claude-handoff)
- [Kế hoạch triển khai: mục 0–10](#implementation-plan)
- [Audit và ma trận 34 nhóm nghiệp vụ](#business-audit)
- [Checkpoint và bước tiếp theo](#execution-checkpoint)
- [PLAN khóa đầu vào toàn luồng — cập nhật mới nhất 21/10](#input-integrity-plan)

**Kết quả vòng rà thứ hai:** bản R2 còn thiếu độ sâu ở khách vãng lai, tài xế có hệ đăng nhập riêng, đánh giá tài xế, AI commerce, callbacks/outbox và dữ liệu JSON/cache. R3 bổ sung ma trận 10 ngữ cảnh actor con người, actor kỹ thuật riêng, 34 nhóm Bxx và các phát hiện A17–A27. Đây là audit code + truy vấn DB chỉ đọc; **chưa phải xác nhận mọi chức năng đã chạy đúng hoặc mọi actor đã được live test**. Xem A.6–A.8 để triển khai mà không phải khám phá lại toàn repo.

<a id="claude-handoff"></a>
## Prompt giao Claude

Đây là chỉ dẫn cho lượt **triển khai** khi người dùng giao PLAN này cho Claude. Lượt tạo/hợp nhất tài liệu hiện tại chưa triển khai product code.

Khi giao triển khai yêu cầu mới ngày 21/10, ưu tiên **mục C: IP1–IP7 / IG1–IG8** để khóa đầu vào toàn luồng; đọc baseline 22 ca và checkpoint trước khi sửa. Lượt lập PLAN hiện tại chỉ audit/viết tài liệu, chưa sửa product. Không chỉ thêm regex cho câu tỉnh lạ.

Bạn triển khai PLAN tại `data-platform/AI_DATA_ANALYST_BUSINESS_COVERAGE_PLAN_20261020.md` từ P0 đến P8, tiến tới G1–G8; không dừng ở việc đề xuất sửa riêng câu hỏi đánh giá. Đọc `CLAUDE.md`, rules liên quan, checkpoint tại phụ lục B và mục đang làm. Đọc audit tại phụ lục A của file này để lấy bản đồ chức năng/nguồn thực đã khảo sát. Ưu tiên source code/API/DB; browser dùng xác minh hành vi cần thiết, không cần mở lại từng màn hình chỉ để biết nó có tab nào.

Yêu cầu mới này mở rộng scope ingestion projections/semantic/business coverage của PLAN19/10; vẫn giữ các bất biến hardening. Retail chỉ bật/tắt mở bán, không phải quản lý số lượng tồn kho. Combo kiosk là nghiệp vụ riêng. Tên vai trò kế toán có thể đổi thành quản lý chủ kiosk; bám capability và dữ liệu, không tự rename role/auth.

Trước sửa: `git status --short`, branch/HEAD, diff các file sẽ chạm. Có changes hardening chưa commit, phải giữ nguyên. Không commit/push/reset/clean/stash/restore. Không tiếp tục remote CI thay việc này.

Bằng chứng audit quan trọng:

- Câu “Phân tích đánh giá của khách hàng về các sản phẩm” retrieve nhầm customers/products, chỉ đưa 4 sales/customer metrics cho model, bỏ review metrics đã có.
- D09 tính quantity 394.395/low-stock 306 từ trường nguồn, nhưng manager/mobile/checkout dùng flag mở bán; không dùng count đó làm nghiệp vụ tồn kho thực.
- Review mẫu 3.004/3.005; branch review có APPROVED 12 và HIEN_THI 2.065, public API và Silver khác population.
- Có active wallet/gift/franchise/debt/royalty/kiosk/survey features chưa đủ nguồn/metrics/NL. Bảng auxiliary finance/context có dữ liệu nhưng provenance chưa chứng minh nghiệp vụ.
- `sync_history` reader thiếu quyền đọc các cột được truy vấn; worker vẫn chạy. Incremental không có full snapshot proof. Không làm xanh banner bằng bỏ kiểm chứng.
- Source app và data-sync là cùng PostgreSQL endpoint public IP; chưa xác minh nhà cung cấp Supabase hoặc project khác. Dùng runtime config an toàn, không tự đoán DB khác.
- Vòng hai: API shipper được UI gọi có KPI/tài chính cố định; rating tài xế là giá trị cập nhật trọng số, không phải trung bình tất cả reviews. Có 7.472 delivery rows chứa hai khóa tài xế khác nhau; phải đối soát khóa chuẩn trước phân tích theo tài xế.
- Gift transfer gọi `topUp()` tạo PENDING rồi xóa số dư thẻ, chưa chứng minh ghi có ví; không coi REDEEMED là tiền đã chuyển. Guest link thay owner trên order; không suy lịch sử guest→member từ owner hiện tại.

Thực hiện từng lát cắt feature→source→projection→semantics→retrieval→report→oracle. Chỉ sửa owner engine hiện tại, không tạo planner/provider path khác. Không hardcode câu demo/số audit. Kết thúc mọi feature trong registry bằng implementation hoặc limitation được chứng minh; không dùng unsupported che thiếu code. Test numeric oracle độc lập với production compiler; candidate-only, scripted-intent và live-model scores tách riêng.

User cho phép live AI test theo P7/§8: campaign tối đa 120 physical sends và 500.000 input + output tokens, concurrency 1, không reset ledger/quota, không gửi PII. Chỉ chạy sau offline gates. UI business/source DB thật chỉ đọc; fixture mutation phải cô lập. Migrations/grants DB dùng thật cần gói reviewable và approval theo repo rules, nhưng chuẩn bị toàn bộ code/test trước và tiếp tục phần không phụ thuộc.

Tối ưu token: chỉ đọc section hiện tại, `rg`/range reads, reuse audit artifacts, targeted tests giữa phases, full suites một lần cuối. Không spawn subagents khi user chưa yêu cầu. Checkpoint nhỏ sau mỗi phase và trước hết context. Chỉ đánh dấu DONE khi đạt acceptance; nếu blocked thì nêu gate chính xác, evidence và phần đã hoàn tất, không tuyên bố “hiểu toàn hệ thống” dựa vào tests cũ.

Đầu ra cuối: code + tests + feature/source matrix + data dictionary + offline/live receipts + exact-source acceptance + hướng dẫn demo/bảo vệ; người dùng tự commit/push.

<a id="implementation-plan"></a>

## 0. Chỉ dẫn ưu tiên và mục tiêu

Yêu cầu mới nhất: **lượt hiện tại chỉ audit và viết PLAN**. Khi user giao PLAN này cho Claude để triển khai, làm các phase dưới đây đến khi đạt goals, không dừng ở lời đề xuất. Không tiếp tục việc remote CI cũ thay cho mục tiêu mới. Giữ PLAN/hardening lịch sử; không tách lại audit/handoff/progress của PLAN này thành ba file. Ba tài liệu business trước đã hợp nhất theo yêu cầu user.

Plan này mở rộng scope cũ sang **phát hiện nghiệp vụ, source contracts, các projection Silver và semantic coverage thực có**. Các bất biến bảo mật, SQL, jobs, provider, saved reports, depth và snapshot của PLAN 19/10/hardening 20/10 vẫn giữ. Những nội dung cũ coi inventory quantity là nghiệp vụ bán hàng hiện hành phải được thay thế theo xác nhận mới của user: hệ thống retail quản lý **bật/tắt mở bán**, không triển khai quản lý kho vật lý mới.

“Hiểu toàn hệ thống” được đo bằng: mọi chức năng và bảng được kiểm kê/phân loại; mọi bài toán có nguồn đủ và thuộc nghiệp vụ thật đi qua cùng engine; phần thiếu dữ liệu được nhận diện đúng, giải thích đúng và không trả số giả. Không hứa trả lời vô hạn, không dùng danh mục 16 domain cũ làm ranh giới hoàn thành mới.

### 0.1. Goals bắt buộc

| Goal | Điều kiện hoàn thành có thể đo |
|---|---|
| G1 Phạm vi đóng kín | 100% feature IDs của mọi role/tab/route và 100% nguồn discovery có disposition + evidence + owner + test/limitation; orphan feature/table=0; mã mới phát hiện được thêm vào denominator |
| G2 Đúng nghiệp vụ | B01–B34 trong audit có hợp đồng approved-in-code hoặc limitation có chứng cứ; inventory retail chỉ availability; wallet/customer/franchise/shipper và review/product/store tách đúng |
| G3 NL đúng miền | Corpus holdout có mọi domain active; candidate recall=100% cho required metrics/domains trên corpus; câu review gốc + paraphrase unseen không lạc sang revenue/customer count; genuine ambiguity vẫn hỏi |
| G4 Số có thể bảo vệ | Independent oracle trên nguồn/fixture, grain/population/date/status/denominator/joins rõ; dashboard/AI/export bằng nhau khi cùng contract, scope và snapshot |
| G5 Nguồn minh bạch | Load freshness, event recency, snapshot parity, period closure, provenance và analytical coverage tách riêng; không unknown giả vì lỗi reader bị nuốt; không certificate giả |
| G6 Toàn luồng dùng được | Preflight→proposal→execute→report→filter/drill/follow-up→save/reopen→Word/export hoạt động cho miền mới, bounded và đúng quyền; typed empty/unsupported/source failure |
| G7 Không hồi quy | Giữ ratio/additive semantics, 4/6/8 có eligibility, shared snapshot, readonly, jobs/CAS/cancel/revoke, provider budgets; suites liên quan pass |
| G8 Bàn giao thật | Exact working-source manifest + audit matrix + offline/live first-pass receipts + data health proof + demo script + remaining blockers; chỉ READY khi toàn bộ gate cần thiết pass |

Không đóng goal bằng cách đánh dấu feature active là unsupported vì chưa code. Phân biệt `IMPLEMENTATION_GAP` (phải làm) với `SOURCE_NOT_CAPTURED` (nguồn thật không lưu), `NO_ROWS`, `SOURCE_INTEGRITY_ISSUE`, `UNVERIFIED_PROVENANCE`, `TECHNICAL_EXCLUDED`, `POLICY_RESTRICTED`. Chỉ mục không phải analytics hoặc không có nguồn hợp lệ mới được khép bằng limitation có dẫn chứng. Bài toán có source hiện tại, write-path thật và semantics đủ phải triển khai trong scope này.

### 0.2. Quyền và ranh giới thực hiện

- User cho phép đọc config DB cần thiết, audit chỉ đọc, live test AI và đăng nhập tài khoản đã cấp. Không ghi credentials vào docs/log/prompt/fixtures. `.env` chỉ parse keys cần dùng nội bộ; không `cat`, không dump env/inspect/compose config.
- Git chỉ đọc; không commit/push/reset/clean/stash/restore. Giữ mọi changes hardening hiện có, so `git diff <file>` trước sửa. Không tự gọi remote CI hoặc tuyên bố FINAL_VERIFIED.
- Không rewrite engine, không microservice/provider/planner mới, không SQL tự do từ model. Sửa owner hiện có và metadata/contracts; không hardcode câu hỏi, tên món, role demo, tháng demo, count audit hoặc test ID.
- Có thể viết và test migration/view/projection ở **DB fixture cô lập**. Trước DDL/grant/source migration trên DB dùng thật, chuẩn bị gói cụ thể có diff, rollback, dry-run, impact rồi xin duyệt một lần; đây là yêu cầu `.claude/rules/data-platform.md` về schema, không dùng nó để dừng phần code/test độc lập. Không tự mở rộng quyền vì một SELECT bị lỗi.
- Live DB audit = readonly với timeout; live UI business = navigation/read sau khi kiểm side effects của API được gọi. HTTP GET không đủ chứng minh readonly: customer/shipper getWallet có thể tạo row; recommend GET có thể khởi tạo background work. Không gọi các đường đó trên nguồn dùng thật để audit. Mutation để test (order/review/wallet/refund/spin/franchise) chỉ ở tenant/DB fixture đã cô lập, không charge/pay/send notification thật. User cho live AI test không có nghĩa authorize tiền thật hoặc phá dữ liệu.
- Tên “kế toán” dự kiến đổi thành quản lý các chủ kiosk: dùng capability/domain ổn định, giữ role enum/permission hiện tại cho đến migration riêng; không tự rename ACCOUNTANT hoặc mở quyền analytics cho các role khác. Audit đủ dữ liệu mọi role **không đồng nghĩa** cấp mọi role truy cập toàn bộ AI Analyst (hiện ADMIN-only).

## 1. Baseline, evidence và contract cần giữ

Đọc phụ lục A, mục A.1–A.3 trước. Số liệu audit là snapshot 20/10, không expected production cố định. Bằng chứng nhỏ trong `evaluation/business-coverage-20261020/`: `candidates.json`, `preflight.json`, `details.json`, `health-summary.json`; file lớn `db-audit.json`, `relations.json`, `source-ledger.json` chỉ đọc đúng table đang làm. Vòng hai xem `actor-route-inventory-round2.json`, `data-shapes-round2.json`, `data-shapes-round2-keys.json` và A.6–A.8; không chạy lại mọi aggregate nếu source liên quan chưa đổi.

Câu review gốc có candidate menu chỉ `[customer_count,product_revenue,quantity_sold,total_spent]`; review metrics đã có. Đây là regression tiên quyết. Bộ hardening trước pass trên catalog/corpus cũ không đủ chứng minh G1–G3. Không sửa receipts lịch sử.

Giữ nguyên: access principal/owner/branch scope; column allowlist + redaction; read-only transaction/AST/statement timeout; query cost/concurrency; query batch cùng snapshot; row artifacts immutable; revision/CAS/save/reopen; cancellation/revocation; provider reservation trước send; circuit shared và ledger bền; 0 provider ở preset/explorer/preflight/filter/drill/refresh/save/export. Natural-language follow-up mới được vào interpreter có budget. Không tự nâng SQL limits để đạt số chart.

## 2. Hợp đồng kiểm kê nghiệp vụ — làm trước khi mở rộng metrics

Tạo `data-platform/metadata/business_feature_registry.json` (tên mới dự kiến) cùng schema validation và generator coverage report. Mỗi feature chứa tối thiểu:

```json
{
  "feature_id": "reviews.product", "domain_id": "product_reviews",
  "roles": ["CUSTOMER", "MANAGER"], "surfaces": ["web-customer/product-detail", "web-admin/customer-care"],
  "code_evidence": [{"path": "relative/path", "symbol": "functionName"}],
  "api_routes": [], "source_tables": [], "write_path_status": "verified_static",
  "data_origin": "mixed_or_unknown", "analytic_state": "IMPLEMENTATION_GAP",
  "supported_questions": [], "unsupported_questions": [],
  "metric_refs": [], "test_refs": [], "owner": "avengers-data-team"
}
```

Schema thực dùng enum typed, không ép ví dụ này thành approved metric. `data_origin`: `observed_application|marked_sample|mixed|unknown`; chứng cứ sample prefix là một tín hiệu, không quy mọi dòng thiếu prefix thành “thật”. Chuỗi reference phải resolve, không free-text PASS. UI navigation/read-only browser là mức kiểm chứng riêng, không ghi “live tested” từ source read.

Kiểm kê hai chiều:

1. App routes/nav/role guards + controller endpoints + DTO/entity + raw SQL trong service → features. Bao gồm mobile và các tab con, không chỉ menu chính.
2. DB schemas/tables/columns/keys/enums → contracts→Silver→semantic→lenses→preset/AI→test. So ngược phát hiện orphan: bảng có dữ liệu nhưng chưa được phân loại, domain có metric nhưng thiếu write-path.
3. Freeze baseline feature IDs và table list ở P0; sau mỗi phase discovery diff. Mục thêm không được lờ đi; mục loại phải ghi lý do và evidence. Không giảm denominator để đạt100%.
4. Mỗi candidate metric cần định nghĩa: question family, formula, unit, grain, primary key, business clock/timezone, population/filters/status, numerator/denominator/exposure, additive rules, dimensions/joins/cardinality, provenance, source freshness and coverage, historical capability, privacy/scope, examples và counterexamples.
5. Mỗi metric active phải được discoverable qua capabilities/“Hỏi được gì?”, retrieval và preset thích hợp; có tooltip nguồn/định nghĩa và oracle. Không chỉ tạo SQL view rồi coi hoàn thành.

### 2.1. Denominator actor, chức năng và dữ liệu phải tách riêng

- Map **10 ngữ cảnh actor** tại A.6, không dùng 8 giá trị `identity.nguoi_dung.vai_tro` làm toàn bộ actor. Mỗi feature có actor×platform×scope×action; phân biệt có tab, có API, API được module/gateway đăng ký, guard thực tế và live-tested. Menu hiện ra không chứng minh backend cấp quyền.
- Registry thêm `actor_contexts`, `platform_support`, `auth_owner`, `scope_keys`, `storage_kind`, `persistence`, `side_effects`, `verification_level`, `source_integrity_issues`. Có thể dùng bảng liên kết thay vì lặp dữ liệu; references phải resolve. Với browser/mobile không có portal riêng, đánh dấu `UI_NOT_IMPLEMENTED` có evidence; không xây portal mới chỉ để đạt parity.
- Phân loại **từng cột** nguồn thành business fact/dimension, nested payload cần projection, technical control hoặc restricted; JSON phải ghi shape/version/key policy và allowed analytical fields. `excluded` cần lý do, không chỉ phân loại tên bảng rồi bỏ các cột còn lại. Metadata vòng một có 43 jsonb + 1 json + 2 ARRAY; probe vòng hai kiểm shape 44 JSON columns, 2 ARRAY chỉ kiểm metadata.
- Kiểm nguồn ngoài bảng: Redis, trạng thái client, WebSocket, static knowledge JSON, model/index trong RAM, callback/outbox và các artifacts của Data Platform. Ghi rõ durable/ephemeral/derived; không copy cache/tokens/raw chat vào warehouse để đạt “đủ dữ liệu”.
- Thống kê riêng coverage actor/platform, feature/action, relation/column, nested field và analytical question. Mẫu số tăng theo discovery. 34 nhóm là bản đồ giao việc, không thay danh sách feature chi tiết và không phải 34 domain bắt buộc tạo mới.

## 3. Quyết định semantics bắt buộc

### 3.1. Availability thay cho tồn kho retail

Owner: `MenuPanel`, `useAdminDashboard`, `InventoryScreen`, order checkout availability policy; analytic catalog/domain inventory/D09, missions/risk signals/templates/exports/tests.

- D09 đổi nội dung thành **“Khả dụng bán theo điểm bán”**, giữ ID cho compatibility. New metrics dự kiến: configured positions, explicitly paused positions, available positions và paused share; quy định denominator rõ. Không gọi flag=false là thiếu nguyên liệu hoặc “sắp hết”.
- Xây effective availability theo đúng code checkout/menu hiện tại, bao gồm global menu state, branch override, missing override và inactive branches/products. Missing override không đồng nghĩa unavailable. Không mặc định cross product1.215×118 là tập sản phẩm được phân phối; nếu app menu toàn hệ thống áp dụng tại mỗi branch thì cần ghi rõ quy tắc và tính bounded.
- Tách “3 paused configured records” khỏi “số món hiệu lực ngừng bán” trên toàn catalog/branch. Mỗi KPI phải cho biết đếm distinct product hay product×store. Query tổng số configured positions không đại diện toàn bộ menu khả dụng.
- Deprecate `stock_quantity`, `low_stock_count`, stock detail/warning threshold và stock-based risk/predictions khỏi active business capabilities. Không xóa source columns/API. Old saved report giữ artifact lịch sử kèm “định nghĩa cũ không dùng cho nghiệp vụ hiện hành”; reopen không đổi KPI âm thầm, refresh phải replan sang availability có thông báo.
- Audit manager overview và mobile labels còn dùng so_luong_ton; sửa presentation khi cần để không tiếp tục tuyên bố quản lý kho. Không bỏ quy trình combo nhượng quyền có số lượng thật: đó là B24, không phải tồn món retail.
- Không có history flag thì historical unavailable, duration out-of-stock, lost sales, stock-out forecast không tính được. Nếu cần bổ sung event capture thì đưa gói instrumentation tương lai; không dựng quá khứ từ cap_nhat_luc hiện tại.

### 3.2. Review và khảo sát đủ chiều

- Broad “phân tích đánh giá sản phẩm” có default governed bundle: rating mean + count + star distribution + low-rating share, group product/category/time khi đủ dữ liệu. “Đánh giá doanh thu/hiệu quả nhân viên” không phải customer review. Bare “đánh giá” thật sự mơ hồ thì hỏi product/store/driver hoặc KPI đúng ngữ cảnh.
- Ratings avg theo review grain; aggregate weighted bằng total stars/count, không avg các avg. Low-rating threshold 1–3 được công bố, không gọi đó là sentiment NLP. Top/bottom luôn hiện exposure, cỡ mẫu tối thiểu policy và tie handling; tránh khen món1 review hơn món nhiều review bằng số thô.
- `review_count`, `distinct_reviewer_count`, `reviewed_order_count` và `reviewed_product_count` khác nhau. Review rate cần denominator đủ điều kiện viết review từ order/review service, dedup cùng key và thời gian attribution. Chưa chứng minh eligible orders thì chỉ count, không suy tỷ lệ.
- Reply backlog/time từ phan_hoi_quan_ly/thoi_gian_phan_hoi; 0 reply thật ≠ missing source. Null hoặc timestamp trước review được báo quality issue, không clamp để đẹp.
- Branch reviews: lưu raw_status + normalized_visibility + mapping_version trong analytical projection. Default public-visible dùng đúng public API; all-manager scope explicit; unknown/legacy status separate. `HIEN_THI` phải có mapping evidence/decision, không âm thầm đổi source. Giữ tieu_chi riêng từng loại và missing denominator từng tiêu chí.
- Product→branch qua order có cardinality verified; kiosk field ưu tiên theo provenance, không join branch/product review trực tiếp tạo fanout. Review→sales comparison aggregate mỗi fact trước join theo product/time, không khẳng định review gây doanh thu.
- Survey: giữ form/question ID/type/version với answer grain(response_id,question_id). Detect mutable form overwritten: thiếu version lịch sử thì không tự gán text hiện tại cho câu trả lời cũ. Mẫu số trả lời từng câu, multi-select khác respondent count; malformed/unknown question được đếm riêng. Không gộp scale1–5 với0–10.
- Nội dung nhận xét: core release hỗ trợ thống kê rating, phản hồi và theme extraction có kiểm chứng nếu có nguồn/anonymization. Text input là dữ liệu không tin cậy; không obey prompt injection trong review. Nếu dùng model tóm tắt chỉ trong AI workflow, bounded sample, redacted text, provenance/sample coverage, citations về row IDs nội bộ, không khẳng định tỷ lệ toàn dân từ sample. Không gửi PII/raw chat ra provider; sentiment/topic suy luận phải ghi method/version và confidence, không gắn nhãn dữ kiện đo trực tiếp. Nếu chưa triển khai text analysis, capability phải nói rõ **đã hỗ trợ số sao; chưa phân loại nội dung**, không chuyển câu hỏi cảm nhận thành revenue.

### 3.3. Tài chính, loyalty và liên miền

- Wallet customer, wallet franchisee (`identity.vi_giao_dich`/user balance), shipper wallet/COD là3 bounded contexts. Source contract dùng type/status/sign và reference idempotency. TOP_UP không revenue; refund khác cancellation; balance hiện tại không balance lịch sử nếu thiếu opening ledger.
- Gift card issuance/claim/redeem/current_balance không tự coi tất cả ACTIVE là đã thanh toán. Đọc gift-card service xác định funded/ownership/redeem path. Không expose redeem codes. Không double count gift funding và order payment.
- Loyalty: diem_loyalty, diem_kha_dung, tong_chi_tieu và chi_tieu_thang_nay có nghĩa khác nhau; tier thresholds/config đúng thời điểm nếu có history. Retention/RFM xây từ order events và population customer, không từ last balance. Guests/users deleted phải có policy.
- Spin: thực hiện được issued voucher/count/redemption từ event provenance hiện có. Không chứng nhận tổngspin/win rate của mọi giải khi không ledger. Không tự thêm source ledger/migration để tuyên bố quá khứ đầy đủ.
- Promotions identity vs orders voucher khác namespace; bridge dùng claim/service evidence. Delivery attempts vs delivered orders, payment attempts vs paid orders, refunds vs cashflows đều khác grain. Join qua fact không được nhân tổng.
- Franchise: canonical site mapping giữ source kind/ID/code và mapping cardinality. branch 50 franchise-type vs franchise.kiosk 51 không bằng nhau; unmatched phải surfaced. `kiosk_id` UUID khác `ma_kiosk` string và `co_so_ma`. Historical revenue dùng order price; kiosk price override là snapshot.
- Debt outstanding/overdue/phí, royalty billed/confirmed/paid, thu_chi cashflow, reconcile differences và retail revenue phải phân biệt. ACCOUNTANT đổi display name sau không đổi meaning, owner hay access.
- finance/context/master_data chỉ dùng sau xác minh lineage/write-path/provenance và mapping period. Nếu seed/legacy thì giữ demo-only/quarantine. Có bảng chi phí chưa đủ công thức profit/ROI. Thời tiết correlation chỉ observational, cần spatial/time matching, exposure và đủ samples.

### 3.4. Các luồng phải sửa định nghĩa sau audit vòng hai

1. **Shipper KPI và tài chính:** `getKpiData()` có avg_rating=4.8/on_time_rate=96.5, bỏ qua range, lấy 5 dòng đầu làm top; `getFinanceData()` có tổng/số dư cố định. UI admin gọi các endpoint này. Không ingest hoặc dùng chúng làm oracle. Tính lại metric từ fact có clock/status đủ; thiếu SLA thì không phát tỷ lệ đúng giờ. Đối chiếu `total_deliveries` counter với delivery/order grain; không mặc định counter là số đơn giao thành công. Sửa các nhãn/số giả tại API/UI liên quan trong phạm vi cần để kết quả phân tích có thể bảo vệ.
2. **Khóa tài xế:** Silver `giao_hang` dùng `shipper_id`; TypeORM relation có `shipperId`. Audit 7.857 rows: 335 thiếu `shipperId`, 7.472 có cả hai nhưng khác nhau, orphan mỗi khóa=0. Không COALESCE, join OR hoặc overwrite nguồn để che xung đột. Truy write-path/seed/import; định nghĩa canonical key với evidence; giữ mismatch quality flag và scope đúng. Tạm không chứng nhận breakdown theo tài xế khi chưa khép xung đột; tổng delivery không tự mất vì lỗi dimension.
3. **Đánh giá tài xế:** `rateShipper()` tính `round(old_rating*0.8 + new_rating*0.2)` rồi ghi đè `delivery_note`. Đổi nghĩa/nhãn `driver_rating` thành điểm hồ sơ hiện tại nếu tiếp tục AVG trên các shipper; không nói là trung bình mọi lượt đánh giá. Không có rating event ID/rated_at đầy đủ thì không cung cấp lịch sử sao/review count chuẩn. Parse note chỉ là nguồn suy xuất có giới hạn, không tự chứng nhận. Audit hiện không có note mang marker đánh giá; vẫn có rating profile, không được suy ra “đã có N lượt đánh giá”.
4. **Cấu hình/tiền shipper:** dispatch update/commission setter trả success nhưng không lưu; completeDelivery cộng mức 15.000 vào ví, finance summary dùng công thức khác. Phân biệt phí trên delivery, số ghi có ví, COD giữ hộ, tiền đã nộp, hoa hồng tính theo policy và payout thực. Không dựng lịch sử commission từ cấu hình hiện tại hoặc payout từ số dư. Bảng giao dịch không đủ thì giới hạn đúng metric; muốn bổ sung persistence phải có migration/test gói riêng, không bịa quá khứ.
5. **Gift → wallet:** `transferGiftCardBalance()` gọi `CustomerWalletService.topUp()`, hàm này tạo TOP_UP/PENDING + URL thanh toán, chưa credit balance; caller vẫn đặt card REDEEMED/0 và báo thành công. API phát hành cũng trả điểm loyalty tính bằng công thức nhưng không ghi award ở đường code đó. Phân loại `SOURCE_INTEGRITY_ISSUE`, không chỉ thiếu metric. Chỉ báo issued/claimed/current state có thật; chưa báo funded/credited/earned thành công khi thiếu chứng từ. Chuẩn bị sửa đường chuyển tiền tối thiểu theo atomic transaction + dedicated transfer reference/idempotency + credit ledger nếu triển khai nguồn; kiểm rollback/retry/concurrent redeem bằng fixture. Không dùng external top-up payment để giả lập chuyển tiền nội bộ, không tự sửa bù các giao dịch cũ trên DB thật. Analytics phần không phụ thuộc vẫn triển khai; metric tiền chuyển thành công bị chặn đến khi integrity gate được khép.
6. **Guest/link/reorder/cart merge:** current owner có thể thay sau link; bulk link còn xóa guest session/contact. Order có `ma_nguoi_dung` varchar, không mặc định UUID hoặc coi NULL là dữ liệu lỗi. Khách không có tài khoản, khách POS và tài khoản đăng ký là các ngữ cảnh khác nhau. Giữ order count theo PK; guest current-owner share khác conversion lịch sử. Không suy identity-link funnel/reorder rate từ preview/cart snapshot khi thiếu event. Test merge chống trùng line/đơn, ownership scope, anonymous→member và tài khoản bị xóa.
7. **Loyalty và các ví:** bổ sung manual tier/config, birthday, tier-up, freeship, monthly spend, wheel và rollback award theo write-path thật. Không gộp mọi voucher thành WHEEL. Identity wallet API cho cả FRANCHISEE và CUSTOMER; consumer đã thấy là franchise portal. Phân loại ví theo service/ledger, không chỉ role; không cộng `identity.vi_giao_dich` và `orders.customer_wallet_transaction` như cùng một sổ. Reference payment hiện thiếu ở 62/72 SUCCESS PAYMENT rows; chưa thể đối soát order-level toàn bộ chỉ bằng reference.
8. **AI commerce:** recommendation, forecast, behavior insights, RAG/chat/voice/order-intent có UI/API active, không gom toàn bộ thành bảng legacy. Nhận diện model/source version, training cutoff, predicted horizon, forecast method/fallback, actual vs predicted và missingness. Không suy conversion uplift/độ chính xác từ số request nếu thiếu exposure/outcome/holdout. Nhận diện khả năng và lineage có thể triển khai; không tự train/reload model hoặc mở provider path ngoài engine Analyst. Prompt/chat/audio/PII vẫn restricted.

### 3.5. Kiểu dữ liệu, JSON và lịch sử

- Money dùng numeric/decimal và quy tắc làm tròn đơn vị VND; integer cents của gateway phải normalize theo contract. Không dùng float để đối soát ví/royalty. `NULL`, 0, chuỗi rỗng, false và “chưa thu thập” khác nhau.
- Timestamp có timezone và không timezone cùng tồn tại (80 và 70 cột trong metadata audit), cộng date-only. Chốt timezone nghiệp vụ Asia/Ho_Chi_Minh và writer semantics từng clock; không tự cast tất cả naive timestamp thành UTC. Test biên ngày/tháng, callback đến muộn, created/paid/delivered/refunded khác nhau.
- JSON hiện quan sát: product options là **object**, order toppings **array**, custom_attributes **object**, survey questions/answers **array**, branch criteria **object**, membership config có cả array/object theo bản ghi. Không mặc định tất cả JSON là array. Shape đúng chưa chứng minh nội dung hợp lệ; P0 kiểm allowed keys/types/range/version bằng aggregate đã redact.
- Explode toppings/options/answers/history theo child grain riêng. Giữ base order/order-item totals trước explode, không cộng doanh thu lại trên từng topping. 72.063 item custom_attributes đều `{}` tại audit: metric từ trường này phải empty thật, không tự lấy cấu hình món hiện tại thay lịch sử.
- Order history có ORDER/PAYMENT events; chốt dedup, status transition, missing/reordered timestamps, source coverage trước tính duration/funnel. Snapshot cash reconciliation/shift JSON là số đã chốt, không cộng với ledger lần nữa. `cod_details` là map số dư theo branch, không phải COD movement log.
- Attachment/image URL, GPS, free text, chat, audio, auth/config/SMTP và notification payload cần allowlist riêng. Presence/count hoặc chất lượng có thể đo khi được phép; không đưa nội dung/credentials vào semantic discovery, provider, export. Không tải ảnh/âm thanh chỉ để kiểm kê dữ liệu.

## 4. Retrieval và khả năng hiểu ngôn ngữ toàn hệ thống

Sửa các owner hiện tại: `domain_intelligence_service.py`, `semantic_candidate_service.py`, `request_anchors.py`, `semantic_preflight_contract.py`, `hybrid_analyst_planner.py`, `analysis_issue_service.py`, catalog và index/manifest validation. Không tạo engine thứ hai.

1. Thêm business concepts/subject intents và semantic aliases có nghĩa, không match cả câu demo. “Đánh giá của khách hàng về sản phẩm”, “phản hồi món”, “review”, “sao thấp” phải retrieve review; “đánh giá doanh thu” giữ sales. Entity mentions(customer/product) là context, không được lấn át analytical topic(review).
2. Candidate retrieval hỗ trợ topic/domain + relations + metric anchor. Strong metric locks bảo toàn; khi chưa metric nhưng chủ đề rõ thì lấy default bundle/lenses của chủ đề. Không bảo vệ domain chỉ vì một entity noun generic. Multi-topic clauses giữ required domains, tránh top-3 truncation làm rơi câu thứ hai.
3. Index và compact manifest sinh từ **registry duy nhất**. Recall check thực hiện trước prompt truncation và sau packet serialization. Nếu budget không đủ giữ required meaning, typed capacity clarification chia câu hỏi; không âm thầm bỏ metrics hoặc nhét cả catalog vào prompt.
4. Truy hồi poor confidence dùng compact domain directory một lần theo policy hiện có; không provider fan-out, không recursive routing loops. Không tăng token cap để né indexing.
5. Clarification options dựa resolved topic, required business population và available metrics; nhãn missing_fields sinh từ semantic candidates, không cố định revenue/AOV. Options có nghĩa cụ thể; không yêu cầu user chọn metric mà domain default bundle đã đủ để trả tổng quan hữu ích.
6. Capability taxonomy: AVAILABLE, EMPTY, SOURCE_NOT_CAPTURED, SOURCE_UNAVAILABLE, SOURCE_INTEGRITY_ISSUE, POLICY_RESTRICTED, UNSUPPORTED_ANALYSIS, IMPLEMENTATION_GAP. Source có xung đột khóa/ghi nhận tiền phải hiện integrity issue cho metric bị ảnh hưởng. Source tồn tại nhưng metric chưa code phải hiện khoảng trống kỹ thuật trong admin diagnostics, không nói “hệ thống không có dữ liệu”.
7. Follow-up “còn cửa hàng?”, “chỉ 1–3 sao”, “chưa trả lời”, “tách kiosk”, phủ định “không xét doanh thu”, tiếng Việt không dấu, từ đồng nghĩa, mixed Vietnamese/English, typo nhẹ, multi-intent phải có cases.
8. LLM chỉ chọn semantics từ contract; compiler/resolver tính số. Không thêm arbitrary SQL để hỗ trợ nhanh miền mới. Dùng typed unsupported khi model xin relation không governed.

## 5. Data contracts, health và cách giải thích khi bảo vệ

### 5.1. Tách sáu trạng thái

| Trạng thái | Đo bằng | Không được suy ra |
|---|---|---|
| Nạp dữ liệu | last_success/attempt,error,lag so với SLA | Không có event mới không có nghĩa worker chết |
| Tính đúng bản sao tại mốc | PK sets/content hash/count/controls source↔target cùng projection/cutoff | COUNT bằng nhau không chứng minh cùng nội dung |
| Cập nhật incremental | cursor/overlap/generation/deletion policy/late commit contract | Incremental thành công không bằng full completeness |
| Kỳ nghiệp vụ đủ | bounded period closure + owner attestation + reconciliation | Snapshot parity không xác nhận giao dịch ngoài hệ thống đã nhập đủ |
| Nguồn gốc dữ liệu | app event/demo/import/unknown + lineage | Key hợp lệ không biến sample thành dữ liệu thật |
| Bao phủ bài toán | active feature→metric→dimensions→eval | Sync23 nguồn không có nghĩa hiểu78 bảng hoặc mọi chức năng |

Sửa `data_coverage_service` để last_sync lấy projection ingestion status mà dedicated reader được phép, tốt nhất reuse checkpoints/health view. Nếu thêm view/grants, migration allowlist chỉ cột timestamp/status/sourceID; không grant SELECT toàn source/raw user tables. Query errors có typed cause và observability, không swallow thành “—” vô nghĩa. `last_success` cho report dependency phải dùng đúng các nguồn cần thiết, không lấy max một nguồn để che nguồn khác hỏng.

Cho mỗi report hiển thị: “Dữ liệu quan sát đến…”, “Nạp thành công lúc…”, “Đối chiếu toàn nguồn gần nhất…”, “Kỳ đã xác nhận…/chưa xác nhận”, “Nguồn có dữ liệu mẫu…”. Global banner gọn; chi tiết mỗi nguồn expand. Health của bảng không dùng bởi report không làm report đó sai; các fact clock không lấy max chung để lấp dữ liệu review dừng sớm.

### 5.2. Chứng cứ bền giữa full và incremental

Giữ strict certificate validity. Bản hiện tại full interval 3600s vs proof age 900s, incremental thay envelope không có snapshot. **Không sửa thành complete bằng cách copy snapshot cũ sang generation mới, kéo TTL vô hạn hoặc giảm kiểm chứng.**

Thiết kế triển khai:

- Lưu/hiển thị `last_verified_full_snapshot` như bằng chứng lịch sử độc lập có generation/cutoff/hash/expiry riêng; current_generation_load_health độc lập. UI có thể nói “nạp mới; lần đối chiếu đầy đủ trước đó…” mà không chứng nhận current content.
- Nếu cần current snapshot verified liên tục cho demo/report, chọn scoped reconciliation lúc refresh/report request, cache theo exact generation + contract + access + source bound, hoặc full reconciliation cadence phù hợp SLA sau đo chi phí. Không full-scan toàn bộ 78 bảng mỗi keystroke.
- Chọn một thiết kế ở P2 bằng performance evidence, không chạy cả hai hệ thống song song. Đọc lại worker certificate implementation để giữ transaction fencing, MVCC và atomic publish.
- Deletes/late commits, NULL clocks, malformed enum, new columns/schema drift, missing key, duplicate keys, reference orphan, pending outbox phải có quality behavior. Bảng không update clock dùng full scan bounded hoặc source event contract đã có; không giả incremental dựa created_at.
- Certified closed month 09/2026 hiện chỉ đúng các contracts đã attested; không mở sang reviews/franchise/tháng 10 tự động. Trong demo dùng period verified và sample provenance thật; không sửa date/currenttime để banner xanh.

### 5.3. So sánh kỳ và insight

So sánh bằng cùng metric/grain, timezone, equal duration/cadence và coverage. Chỉ phát %delta khi denominator khác 0 và cả kỳ comparable; chưa đủ thì current result vẫn hiện nhưng delta suppressed/limited với lý do cụ thể. Không lấy 26 reviews đầu tháng 10 so cả tháng 9 rồi diễn giải tụt nhu cầu. Cần tái hiện đúng −98.6% ảnh từ artifact hoặc request cụ thể; không mặc định nguyên nhân đã xác minh. Baseline selection must be visible trong report/export.

### 5.4. Dossier bảo vệ

Tạo một `BUSINESS_COVERAGE_ACCEPTANCE.md` cuối cùng với 4 luồng minh họa: product review 120 (sample disclosed), availability product×branch, wallet transaction classification, franchise debt/royalty. Mỗi luồng có UI question→intent→formula/population→SQL/query fingerprint→source/control totals→report/export và snapshot IDs. Dữ liệu source thay đổi thì expected derive theo snapshot, không hardcode số audit.

Câu giải thích mẫu đúng bản chất: “Chưa được chứng nhận” nghĩa chưa có bằng chứng đối chiếu đủ cho **phạm vi/kỳ này**, không tự khẳng định số sai. Sau triển khai phải nêu được nguồn nào, vì sao, lần kiểm gần nhất và hành động đối chiếu; không dùng cảnh báo chung để né việc thiếu triển khai. Chứng nhận kỹ thuật nội bộ không phải chứng chỉ bên thứ ba hay kiểm toán doanh nghiệp.

## 6. Các phase triển khai và gate

Chỉ một phase active; cập nhật checkpoint nhỏ tại phụ lục B sau mỗi phase: changed files, decision, tests+receipt, next exact command, blockers. Hết context đọc phụ lục B, không audit lại toàn repo.

| Phase | Công việc và files owner | Gate để sang phase sau |
|---|---|---|
| P0 Freeze discovery | Feature registry + source-ledger; B01–B34/A.6–A.8; 10 actor contexts + technical actors; nav/module/gateway/guards; columns/JSON/non-DB storage | Every feature/source/column classified; unresolved list cụ thể; baseline corpus/oracle frozen; platform unsupported và evidence level riêng; no source mutations |
| P1 Stop wrong semantics | A01–A05/A07: retrieval topic, contextual clarification; D09 availability; review visibility policy; old saved compatibility; A18/A19 static shipper KPI/score semantics | Regression exact question candidate includes reviews; counterexamples sales vẫn đúng; manager/checkout parity flag missing/false/global; old reports reopen honest |
| P2 Source/data health foundation | contracts/views projection and schema migrations fixture; G5; checkpoint reader; provenance; site bridges; missing satellite combo table; A20/A21/A27 source integrity gates theo §3.4 | Reader path works without admin grants; no fake certificate; source/target parity and scoped health failure cases; fixtures schema/data drift tests; assignment-key/gift-credit/wallet-reference integrity receipts |
| P3 Existing domains complete | B01–B07,B11,B14–B18,B22: reviews/surveys/replies, loyalty/birthday/manual-tier/config, channel/refund/shifts/delivery/site mapping | Every active requested dimension/metric has semantic contract and oracle; not only primary KPI; all affected presets and AI parity |
| P4 Missing active domains | B09/B10/B19/B20/B23–B28; B08/B12/B13/B21/B29/B30 boundaries; B31 guest/link, B32 shipper rating/dispatch, B33 AI commerce, B34 callback/outbox; ingestion→Silver→semantic→report per domain | Every source-backed active business question supported; no implementation gap disguised as source gap; absent history explicitly tested |
| P5 Unified UX/report | capabilities, suggestions, grouped missions, presets/overview/Explorer, reports/save/export, health/provenance and scoped follow-up | Every domain discoverable and no retired stock recommendation; end-to-end state/revision/access tests; 4/6/8 only meaningful eligible views |
| P6 Offline independent acceptance | Corpus/holdouts, oracle SQL, multi-domain, malformed/edge, pipeline fixture and two-API regressions | Required offline gates pass; no model calls; frozen denominator intact; exact code changes reviewed |
| P7 Bounded live acceptance | Provider only AI flow, budget below; read-only deployed data; role/UI smoke for available sessions; discrepancy triage | First-pass and eventual scores reported separately; mandatory user cases pass; no misleading certification or privacy leaks |
| P8 Final release dossier | Targeted reruns for fixes, full suites once, served bundle check if UI changed, source manifest/evidence; uncommitted handoff | All G1–G8 conditions met or precise blocked gate; never “done” while P0 feature registry has unexplained gaps |

Dependency: P1 can reproduce/fix retrieval before new DB rollout; P3/P4 use P2 contracts. Prepare code/tests/fixtures for source DDL blocked items, continue independent domains. Do not ask broad permission before a reviewable deployment package exists. At completion if real DB rollout approval remains, status `IMPLEMENTED_FIXTURE_VERIFIED_ROLLOUT_PENDING`, not fully accepted.

### 6.1. Mỗi domain là một lát cắt hoàn chỉnh

Thứ tự làm một domain: feature/source evidence → semantics → source contract/redacted projection → Silver/joins → metric+dimensions+lenses → retrieval/capabilities → tests/numeric oracle → preset/shared report/save/export → evidence. Không làm 50 metrics trước rồi mới phát hiện chúng không truy vấn được hoặc không có câu hỏi.

Reuse helpers/contracts hiện tại; shared metric behavior validated once per type rồi parameterized domain cases. JSON answers/custom attributes phải có bounded relational projection và row multiplicity tests. Nullable/new columns default restricted until classified. Không kéo raw PII vào prompt để model “hiểu dữ liệu hơn”.

## 7. Nghiệm thu độc lập

### 7.1. Corpus và oracle

Tạo `evals/business_coverage_cases.json` cùng manifest của fixtures và holdout. Mỗi case chứa feature IDs, question, context, expected domains/metrics, forbidden substitutions, allowed clarification, scope/time/population, expected result state, numeric oracle độc lập, provenance và provider budget expectation.

- Ít nhất **264 câu độc lập** trước biến thể depth: mỗi nhóm B01–B34 có ít nhất 6 cases, cộng ít nhất 60 cases liên miền, phủ định, follow-up và adversarial. Sau P0, nếu matrix còn nhóm mới thì tăng corpus để mỗi feature có coverage. 264 là mức sàn, không phải trần.
- Mỗi domain active có câu tổng quan, metric cụ thể, cách nói không dấu, so sánh/kỳ thời gian, follow-up và edge case. Features không đủ nguồn cũng có cases chứng minh nhận diện đúng phần làm được và phần không đo được.
- Holdout ít nhất 25%, không đưa vào aliases hoặc few-shots. Xây expected từ workflow/business definition trước sửa; freeze bằng hash. Khi phát hiện oracle sai, lưu lý do và evidence độc lập, giữ lịch sử thay đổi.
- Numeric oracle **không import expression/compiler của production**. Viết SQL hoặc phép tính độc lập từ định nghĩa nghiệp vụ. Fixtures phải có nhóm không đều, nhiều payment attempts, refund, duplicate claims, zero denominator và joins nhiều dòng để phát hiện lỗi.
- Tách ba receipts: candidate-only đo retrieval; scripted intent đo resolver/numeric/report; live model đo khả năng hiểu. Không gọi scripted pass 100% là model hiểu 100%.

### 7.2. Trường hợp bắt buộc

| Cụm | Cases và hành vi kỳ vọng |
|---|---|
| Review NL | Câu gốc; “khách chê món nào”; “phan hoi ve do uong”; “đánh giá doanh thu” không thành review; “điểm tài xế” không thành cửa hàng; “đánh giá” mơ hồ hỏi đúng lựa chọn |
| Review numeric | Sao 1–5, invalid/missing, cỡ mẫu nhỏ, đồng hạng, nhóm có số review khác nhau, chưa phản hồi, thiếu timestamp, dữ liệu mẫu/trộn, APPROVED/HIEN_THI/HIDDEN |
| Availability | Flag true với quantity 0; flag false với quantity dương; thiếu override; sản phẩm/chi nhánh inactive; duplicate position; câu hỏi hiện trạng và lịch sử |
| Health | Worker mới/events cũ; worker cũ/events mới; reader denied; proof thiếu/hết hạn; generation mới dùng proof cũ; late commit/delete; nguồn không liên quan bị lỗi |
| Finance | TOP_UP pending/success; nhiều payment attempts/order; refund không đếm đôi; claim khác redeem; ba ví khác nhau; thiếu opening balance; debt paid khác royalty receivable |
| Scope | KIOSK_STAFF khác FRANCHISE_STAFF; UUID/code/parent branch; site không map được; đổi tên hiển thị role; truy cập chéo owner/branch; saved report sau revoke |
| Surveys | Câu hỏi đổi version, multi-select, JSON hỏng, thiếu question ID, thang điểm khác nhau, 0 responses khác thiếu bảng, thiếu mẫu số người được mời |
| Events/history | Voucher giải thưởng không đại diện mọi spin; giỏ hiện tại không phải abandonment; news không có CTR; bàn có đơn không phải seat occupancy; tier hiện tại không có lịch sử tăng hạng |
| Liên miền | “món sao thấp nhưng bán nhiều”; “nợ quá hạn theo kiosk và royalty tháng này”; “hoàn ví so với hủy đơn”; aggregate từng fact trước join |
| Runtime | Browser qua API thật; đổi depth; filter/drill/save/export; server restart; response cũ về muộn; 0 provider ngoài AI; empty/restricted/source failure phân biệt đúng |
| Privacy/text | Prompt injection trong review; hỏi redeem code/email/password; redaction; không lộ PII qua export, SQL preview, log hoặc provider payload |
| Actor/platform | Mỗi10actor contexts có action được phép và bị cấm; guest session chéo; manager parent/child scope; owner vs franchise staff POS permissions; mobile fallback menu không nâng quyền; callback không dùng user scope |
| Delivery keys/rating | Hai khóa giống/khác/NULL/orphan; tổng delivery vs tài xế breakdown; profile rating weighted khác review mean; marker note thiếu/ghi đè; không có SLA/rating timestamp thì không dựng lịch sử |
| Gift integrity | PENDING topup không credit; card REDEEMED nhưng ledger chưa chứng minh tiền vào; transfer retry/concurrency/rollback trong fixture; purchase simulated loyalty không thành award thật; không tự sửa bù live |
| Wallet reconciliation | SUCCESS payment thiếu reference; opening balance thiếu; identity wallet CUSTOMER vs franchise; phí delivery/credited/payout/COD riêng; config không persist không được coi effective policy |
| JSON/clock | Object↔array drift, null/empty/invalid scalar, unknown keys, historical form/config version; toppings fanout, duplicate order history; date-only/naive/aware timestamps, boundaries theo timezone và tiền numeric |
| Guest/AI/async | Link đổi owner không thêm order/conversion event; reorder-preview không là order; forecast actual/predicted riêng; thiếu exposure không có uplift; callback replay/out-of-order, outbox pending không paid; Redis TTL hết không mất delivery thật |

Product 120 chỉ là diagnostic reference, không dùng literal trong production control flow. Kết quả nguồn thực được đối chiếu cùng visibility, branch scope và snapshot; không dùng số audit làm expected cố định.

### 7.3. Ngưỡng release

- Feature/source classification coverage 100%; mọi metric/lens/source/test reference resolve; orphan chưa giải thích = 0.
- Coverage bảng đạt100% chưa đủ: actor×platform×action, source columns/nested fields được chọn và non-DB stores đều có disposition/evidence. Mọi source integrity issue có affected metrics + resolution hoặc block rõ; không chứng nhận metric bị ảnh hưởng bằng count parity hay static API response.
- Required-domain/metric candidate recall 100% trên corpus đã freeze; forbidden substitution = 0. Candidate packet vẫn trong giới hạn hiện tại, lưu size và p95.
- Numeric oracle 100% trên supported cases; lỗi nghiêm trọng về scope, privacy, provenance, certification và false successful money transfer = 0; phân biệt thiếu nguồn/không có dòng/thiếu implementation đúng 100%.
- Preset/AI/save/export parity 100% khi cùng snapshot và contract; report mới không dùng metric tồn kho đã ngừng hỗ trợ.
- Live mandatory regressions pass 100%; holdout first-pass semantic correctness ít nhất 95% toàn bộ. Mỗi domain active có ít nhất 2 live cases và không domain nào 0/2. Nếu domain chưa pass cả hai, điều tra, mở rộng regression offline rồi retest trong budget; không che bằng điểm tổng.
- Lưu first-pass, eventual và số lần thử riêng. Clarification hợp lệ chấm theo oracle, không phạt vì hệ thống không đoán điều thiếu.
- Giữ provider/SQL/concurrency limits. Đo p95 latency, tokens và packet size trước/sau trên workload tương đương; tăng trên 20% phải có nguyên nhân và quyết định tradeoff rõ hoặc tối ưu lại.
- Chart count không thay coverage: đúng core metric/scope/evidence trước; 4/6/8 trên rich fixtures, sparse cases hiển thị phần có ích và lý do hạn chế thật.

## 8. Live test được phép, hữu hạn và tiết kiệm

User đã yêu cầu **cho phép Claude live test**. Không hỏi lại chỉ để chạy phase này khi offline gates đã xanh và còn budget. Cap dưới đây là campaign mới; không reset ledger lịch sử hoặc nới per-turn limits của production.

- Tối đa **120 physical provider sends** và **500.000 input + output tokens** toàn campaign, concurrency 1. Ghi provider/model/request ID, tokens/cache tokens, latency và outcome; không log secret/PII. Chạm một trong hai cap thì dừng sends, tiếp tục phần offline và báo gate còn thiếu. Tăng cap cần user cho phép riêng.
- Phân bổ tối đa: pilot 12, domain holdout 72, follow-up/liên miền 16, reserve retest 20. Tổng không vượt 120; không cần dùng hết.
- P0 phải lập lịch gửi cụ thể theo **analytical domains active**, không theo số Bxx hay số actor. Nếu discovery làm yêu cầu tối thiểu vượt budget, ghi gate và tối ưu coverage bằng case multi-domain có oracle từng phần; không giảm denominator hoặc âm thầm vượt cap. Không gọi provider cho mỗi tổ hợp role/tab; quyền và numeric kiểm deterministic bằng fixtures.
- Hai live cases mỗi domain có thể nằm trong pilot/holdout. Không gọi model ba lần chỉ để kiểm ba mức depth; reuse intent hợp lệ, chạy expansion deterministic và assert không có provider send mới.
- Mọi retry, repair, fallback đều tính physical sends. Production per-turn cap nếu thấp hơn vẫn giữ. Network failure cũng tính lần gửi đã thực hiện. Không switch provider để né circuit/ledger, không lặp đến khi pass.
- Chỉ câu hỏi thử không PII và metadata/semantic IDs được gửi. Nội dung review/chat thật không nằm trong campaign mặc định; kiểm text path bằng fixtures synthetic/redacted. Keys ở server, không nằm trong browser hoặc repository.
- Nếu provider không sẵn/quota hết: ghi `LIVE_BLOCKED`, giữ kết quả offline, không báo FULL_ACCEPTED. Hết context thì checkpoint và tiếp tục phase đang làm, không bỏ live gate vì muốn tiết kiệm token.

## 9. Quy trình tiết kiệm token cho Claude

1. Đọc prompt đầu file, checkpoint phụ lục B và section của phase hiện tại. Dùng `rg` và range reads; chỉ mở Bxx/metadata của domain đang làm, không nạp 78 bảng mỗi lượt.
2. Tạo map feature→file/symbol dùng lại. Khi resume chỉ kiểm hash/diff những file đổi; không khám phá lại toàn repo và không đọc lại doc vừa viết.
3. Gom các lượt đọc độc lập; edits tuần tự. Không spawn subagents nếu chưa được yêu cầu; không chạy full suites song song hoặc mở nhiều host để xem cùng logic.
4. Tạo fixtures dùng lại theo domain; parameterize checks chung theo metric type. Tests phải bắt lỗi nghiệp vụ, không chỉ chứng minh JSON được copy. Chạy affected modules, lưu receipt; full suites một lần cuối, chạy lại khi thay đổi/failure mới yêu cầu.
5. Log dài ghi file, chỉ in summary và failures. Dùng `.claude/scripts/dp-test.sh` và runner chuẩn `tools.run_tests_v29`; không coi baseline 913 tests cũ trong rules là expected hiện tại.
6. Giữ một engine và registry; sinh derived docs/capabilities fixtures từ metadata validated. Numeric oracle độc lập không được generator production thay expected.
7. Đọc DB metadata/aggregates một lần rồi reuse audit bundle; refresh nguồn liên quan khi cần. Không SELECT * business rows, full scan mọi bảng cho mỗi câu, nhờ LLM đọc repo hoặc tính số.
8. Checkpoint phụ lục B dưới 150 dòng: phase, decisions, file paths, failed case IDs, receipts, budget, next action. Lưu bằng chứng lớn ngoài context. Tiết kiệm bằng tránh làm lại, không giảm coverage hoặc bỏ gates.

## 10. Validation, rollout và bàn giao

Commands hiện có (kiểm tra scripts trước chạy): `.claude/scripts/dp-test.sh backend`, `module tests.<module>`, `web`, `eval`. Runner business coverage mới phải mặc định offline, chặn network; live cần `--live --max-calls` explicit và cap token.

Pipeline changes cần unit data-sync/pipeline-runtime và real PostgreSQL fixtures cho parity, deletes, snapshot, drift, reader grants. Shared engine changes cần final acceptance, two-API regressions, browser qua API thật và saved compatibility. Dùng receipts hardening để xác định các checks liên quan, không dùng receipt sai source fingerprint làm bằng chứng phiên bản mới. Nếu sửa app UI/logic thì chạy build/tests tương ứng; chỉ mở rộng regression ai-commerce khi có dependency bị chạm.

UI analytics thay đổi → build container `docker compose -f docker-compose.data.yml up -d --no-deps --build web-ui`, verify served asset hash/markers. Không recreate API giữa tests. App UI khác chỉ rebuild service bị sửa. DB rollout chuẩn bị dry-run, diff, impact, rollback và approval theo §0.2; không xóa volume hay tự cấp thêm quyền. Readiness cần kiểm reader và truy vấn thực, không chỉ SELECT 1.

Deliverables khi Claude hoàn thành:

- Feature registry/version/schema và coverage matrix mọi role/tab/source.
- Contracts, projections, semantic catalog, lenses, capabilities, presets và compatibility cho availability/domains mới.
- Data dictionary về formula, population, provenance và giới hạn từ registry.
- Corpus/holdouts, independent oracles, offline/live receipts, first-pass scores, provider ledger, source parity/health proofs, browser checks và served bundle verification.
- Acceptance report từng G1–G8, numerator/denominator, blockers, exact working-source fingerprint kể cả changes chưa commit. Không ghi credentials hay PII.
- Cập nhật checkpoint/handoff ngay trong file PLAN này: việc đã làm, phần còn chờ rollout và lệnh tiếp theo. Remote CI chỉ xác minh sau khi user push; local business acceptance không thay trạng thái remote release.

**Definition of done:** Không còn feature gap có nguồn active và đủ semantics mà chưa triển khai; câu review và paraphrases hiểu đúng; D09 không tuyên bố số lượng kho; wallet/gift/franchise/survey/review/kiosk được phân biệt đúng; nguồn có bằng chứng đúng phạm vi; mọi gate bắt buộc pass. Thiếu quyền, schema hoặc provider budget là blocker có evidence, không phải lý do đổi goal hoặc tự gắn DONE.

<a id="business-audit"></a>
## Phụ lục A. Audit nghiệp vụ và dữ liệu — 20/10/2026

**AUDIT_ONLY — chưa triển khai kế hoạch mới.** Kết quả bên dưới là nền tảng cho mục 0–10, không phải acceptance sau triển khai. Bằng chứng: [manifest](evaluation/business-coverage-20261020/manifest.json).

### A.1. Phạm vi và độ tin cậy

- HEAD khảo sát `790eae42026441bb74bc6a53dc29e08934846944`, branch `branch_thaian`, working tree có changes hardening trước đó. Audit không sửa product code, schema, grants hay dữ liệu; không commit/push; **0 provider sends**.
- Đã đọc cấu hình DB cần thiết bằng chương trình, không in secret. App identity và data-sync dùng cùng endpoint PostgreSQL dạng public IP. Không có bằng chứng đủ để gọi endpoint đó là Supabase: tài liệu/code cũ gọi “Supabase” không xác minh nhà cung cấp. Số liệu dưới đây là **DB PostgreSQL thực đang cấu hình cho hệ thống**, không phải DB local giả định. Nếu còn một Supabase project khác, phải đối chiếu trước khi gọi nó là nguồn chuẩn.
- Metadata nguồn có **78 quan hệ ngoài các schema hệ thống đã loại trừ**, hợp đồng ingestion quản trị **23 nguồn**, semantic catalog **21 Silver tables, 52 metrics, 16 domain profiles, 18 subjects, 33 dimensions**. Đây là các loại đối tượng khác nhau, không tính 23/78 thành tỷ lệ nghiệp vụ hoàn thành.
- Quét metadata cột, PK/FK/unique (102 constraints), counts được chọn, enum nghiệp vụ và kiểm tra join review. Không tải business rows hoặc nội dung nhận xét. Nguồn và replica ở hai transaction READ ONLY riêng: counts/aggregates khớp chỉ là kiểm tra đối chiếu, **không phải chứng nhận toàn bộ nội dung bản sao**.
- Quan sát DB khoảng 09:40–09:50 ngày 20/10/2026 giờ Việt Nam; worker tiếp tục chạy nên generation giữa probes khác nhau. Không trộn chúng thành một snapshot chứng nhận.
- Browser xác minh: customer profile; manager overview, menu, đánh giá, khảo sát. Các role còn lại kiểm bằng navigation/components/controller/entity; **chưa browser acceptance từng tab/role**. User đã cho tài khoản và sau đó yêu cầu ưu tiên đọc code; credentials không lưu vào tài liệu.

### A.2. Những lỗi/khoảng trống xác nhận

| ID | Bằng chứng | Kết luận và tác động |
|---|---|---|
| A01 | `semantic_candidate_service.candidate_packet` chạy offline với câu “Phân tích đánh giá của khách hàng về các sản phẩm”: domains `customers,products`; metrics `customer_count,product_revenue,quantity_sold,total_spent` | Review domain bị mất **trước khi gọi model**. Không thể chữa bền bằng đổi model hoặc chỉ sửa câu chữ UI. [candidates.json](evaluation/business-coverage-20261020/candidates.json) |
| A02 | `preflight_service.run` nhận câu trên là READY_FOR_AI, metrics rỗng; câu “đánh giá chi nhánh” nhận được avg_store_rating | Không kết luận preflight chặn câu review. Lỗi nằm ở retrieval/menu candidate và cần live replay sau sửa để kiểm model thực. [preflight.json](evaluation/business-coverage-20261020/preflight.json) |
| A03 | `HybridAnalystPlanner.related_capabilities` lấy metrics của retrieved domains; `analysis_issue_service.py` có nhãn metric_ids cố định doanh thu/số đơn/số lượng/AOV | Lựa chọn clarification và thông điệp lạc chủ đề do domain bị chọn sai và nhãn dùng chung quá hẹp |
| A04 | `MenuPanel` mô tả bật/tắt mở bán; manager live 118 món, 117 mở, 1 ngưng. `capNhatTrangThaiBanMon` POST dang_kinh_doanh, giữ nguyên số lượng; mobile InventoryScreen tương tự. Order service kiểm flag, missing inventory row không tự coi hết hàng | Người dùng đúng: nghiệp vụ hiển thị là khả dụng bán. Backend còn API số lượng và overview dùng trường cũ; sự tồn tại đó không chứng minh có quy trình quản lý tồn thực |
| A05 | inventory 3.232 dòng, tổng quantity 394.395, dưới ngưỡng 306; 3 dòng flag=false, 3.229=true | Hai KPI D09 khớp phép tính cột nguồn, nhưng **sai định vị nghiệp vụ**. “306 món sắp hết” không tương đương 3 vị trí tạm ngưng. Không xóa dữ liệu hoặc sửa số để làm đẹp |
| A06 | 3.005 product reviews; 3.004 comment có prefix `[Dữ liệu mẫu]`, 0 reply quản lý, 0 invalid stars, 0 missing product/order/user. Product120:21, avg4.4286, stars5/4/3=12/6/3 | Tái hiện được ảnh customer (làm tròn 4.4). Đó là dữ liệu có nhãn mẫu, không chứng minh trải nghiệm khách thực. Review join hợp lệ không chứng minh tính xác thực. `scripts/review-seed/seed_product_reviews.py` định nghĩa prefix |
| A07 | 2.077 branch reviews: 12 APPROVED, 2.065 HIEN_THI. Public branch-review service lọc APPROVED; Silver view không lọc status và bỏ cột status | UI công khai và analytics dùng khác population; phải có visible/all/legacy policy rõ. Không tự map HIEN_THI=APPROVED hoặc sửa source |
| A08 | Silver branch reviews bỏ tieu_chi, status, kiosk; product view thiếu thời gian phản hồi/kiosk. Survey có 12 responses và 1 form nhưng chỉ metric đếm responses | Các chức năng phản hồi, tiêu chí phục vụ/vệ sinh/tốc độ, phân tích câu trả lời và phạm vi kiosk chưa đủ semantics |
| A09 | DB có wallet112 transactions, gift13, franchise51 kiosks/25 debts/5 royalties/9 contracts/9 combo orders/3 reconciliations; không có domains tương ứng trong16profiles | Thiếu nguồn/chiếu Silver/metric/NL cho nghiệp vụ thật. customer_wallet_transaction đã sync nhưng chưa thành domain phân tích ví |
| A10 | Câu “Phân tích công nợ nhượng quyền” bị BLOCKED/unrecognized_question; “ví điện tử khách hàng” chỉ nhận payment_method=VI_DIEN_TU | Hệ thống chưa phân biệt sổ ví với phương thức trả tiền; chưa hiểu finance nhượng quyền hiện có |
| A11 | Worker latest success09:38:17; checkpoint các nguồn cập nhật khoảng09:40–09:42. Reader SELECT privilege trên sync_history.finished_at/status đều false; `_query` nuốt exception rồi last_sync=None | Dấu “—” không chứng minh worker ngừng sync. Phải dùng health projection đã cấp quyền hoặc gói grant tối thiểu được duyệt; không cấp reader đặc quyền rộng |
| A12 | Checkpoints reviews có envelope nhưng snapshot=null/completeness=unknown; orders có closed_period1 nên partial. `sync.py` chỉ tạo snapshot_certificate khi full; `load_evidence` complete iff snapshot. full interval3600s, cert maxage900s | Incremental thành công không có bằng chứng current full snapshot. Không được tái gắn proof cũ vào generation mới. Cần hiển thị last verified snapshot + current load riêng, và thiết kế cadence/proof đúng |
| A13 | API health last_sync=None, max_data_timestamp18/10, stale=true vì data lag>48h; product review max05/10, tháng10 chỉ26 review | Banner trộn độ cũ của sự kiện với độ trễ ingestion. Chưa chứng minh số−98.6% trong ảnh có baseline hợp lệ; phải kiểm đúng metric/date/window/coverage trước kết luận kinh doanh |
| A14 | Source không có `inventory.kiosk_combo_delivery` nhưng entity/controller/service và manager/kiosk components có | Schema/code drift cụ thể, chưa xác minh môi trường khác có bảng. Không tạo bảng trong audit; feature cần trạng thái unavailable rõ, migration riêng nếu thực sự cần |
| A15 | `quayMayMan` giảm điểm, phát điểm hoặc khuyến mãi LUCKY_WHEEL; không thấy event ledger đầy đủ cho mọi spin trong luồng đã đọc | Có thể phân tích voucher được phát/đổi; không suy ra tổng lượt quay/xác suất thực nghiệm từ voucher vì giải điểm không sinh voucher |
| A16 | finance.chi_phi_van_hanh26.220, finance.hop_dong_nq984, master_data.co_so1.008, context.thoi_tiet_ngay1.173 | Có bảng không đồng nghĩa có nghiệp vụ app. Chưa thấy write-path active tương ứng trong phạm vi search; phải xác minh provenance/key mapping trước P&L/ROI/thời tiết. Không trộn hợp đồng finance cũ với franchise.hop_dong_nhuong_quyen |
| A17 | Identity có 8 role; shipper có login/profile trong orders.shipper riêng; customer web/mobile có guest/session/POS owner ngoài UUID user | 8 role không phải toàn bộ actor. Audit cần guest + shipper và actor kỹ thuật; xem A.6. Không mở quyền Analyst cho các actor mới |
| A18 | AdminShipperPanel gọi getKpiData/getFinanceData/getDispatchConfig. KPI có 4.8/96.5 cố định, range không dùng, top là slice5; finance trả tổng/số dư cố định; setter config/commission không persist | Nguồn API/UI có thể trả số không phải số đo. Không dùng dashboard này làm oracle; phải tính từ fact hoặc ghi limitation, không hứa lịch sử config |
| A19 | rateShipper cập nhật trọng số 0.8/0.2 và ghi đè note; 301 profile rating4.50–4.98; 0/7.857 delivery có note marker đánh giá tại probe | Profile score khác review fact. Không suy review count, star histogram hay mean customer ratings từ AVG(profile.rating); 0 note không chứng minh chưa từng có rating |
| A20 | 7.857 delivery: shipper_id đầy đủ; shipperId NULL335; cả hai khác nhau7.472; orphan cả hai khóa đều0. Silver chọn shipper_id, ORM relation dùng khóa khác | FK hợp lệ không chứng minh attribution đúng. Phải chứng minh canonical assignment key; không tự sửa dữ liệu hoặc chứng nhận breakdown tài xế từ parity count |
| A21 | Gift transfer gọi topUp tạo PENDING rồi card REDEEMED/0, không có credit trong đường đó; purchase trả loyalty_points_earned nhưng không ghi award. Source có REDEEMED2/zero balance2 | Lỗi integrity nguồn ảnh hưởng ý nghĩa metric; chưa tái hiện mutation thật, chưa truy nguyên từng thẻ. Không suy 2 thẻ đã chuyển tiền thành công hoặc 4 topup PENDING đều do gift |
| A22 | 40.460 orders có14.228 NULL/empty user,26.232 UUID-shaped user,18 session còn lưu; bulk guest link thay user và xóa guest metadata | Current owner không là actor lúc tạo đơn; UUID-shaped chưa chứng minh FK tồn tại. Cần guest/reorder/link contract, không loại14.228 order khỏi tổng bán hàng |
| A23 | 44 JSON columns được profile shape +2 ARRAY metadata; item toppings arrays có46.904 rỗng/72.063, custom_attributes72.063 đều object rỗng; survey answers arrays; product option objects | Table coverage chưa đủ nested coverage; xử lý object/array/null/empty/unknown keys, không nhân doanh thu khi explode. Không suy missing historical selections từ menu hiện tại |
| A24 | Shipper batch cache Redis TTL86.400s + localBatchedMap mobile; shipper notifications gồm derived available-count/static tip; customer/shipper getWallet có thể tạo row | Cache/notification generated không là event ledger. GET không mặc nhiên readonly; audit không gọi các đường tạo wallet, login demo, train/reload hoặc notification thật |
| A25 | Web/mobile admin gọi AI model stats/forecast/recommend; customer mobile gọi recommend. RAG nạp static raw_data/*.json + nguồn menu, giữ sparse index snapshot trong RAM | Một phần ai/analytics/public là luồng active cần lineage, không gom hết vào legacy. Prediction khác actual; RAG index không là warehouse fact và không được coi raw SQL logs là dữ liệu công khai |
| A26 | Admin-mobile DrawerMenu phân ADMIN/MANAGER/nhóm còn lại; web có portal franchisee/accountant/franchise staff riêng; identity workspace policy phân5workspace | Role/platform parity chưa được chứng minh. Không coi fallback staff menu là đã hỗ trợ đủ franchise/accountant trên mobile; kiểm guard/action/scope, không xây portal mới ngoài scope |
| A27 | Customer wallet112 tx:72 SUCCESS PAYMENT nhưng chỉ10 có reference; topups34 SUCCESS/4 PENDING đều không reference; refunds2 có reference. Identity wallet routes nhận FRANCHISEE và CUSTOMER | Không đối soát mọi payment với order khi62 dòng thiếu reference; TOP_UP thiếu order reference có thể hợp lý, phải phân loại theo type. Ba ledger context không phân chia chỉ theo role |

### A.3. Ma trận nghiệp vụ cần khép kín

Mã Bxx là nhóm để giao việc và xây corpus. “Bổ sung” là yêu cầu PLAN, không phải tính năng đã có. Mọi bảng trong [source-ledger.json](evaluation/business-coverage-20261020/source-ledger.json) phải được phân loại đến cùng; matrix này không thay thế bảng kiểm kê 78 quan hệ.

| ID / nghiệp vụ | Vai trò/tab và source code chính | Nguồn dữ liệu/hiện trạng | Đích phân tích và giới hạn |
|---|---|---|---|
| B01 Đơn hàng/kênh | customer orders/tracking; staff POS/orders; `thanh-toan.service.ts` | orders.don_hang40.460; order_items72.063; đã có domain | State funnel, hủy/hoàn thành, kênh, giờ, branch; đối chiếu mọi enum thực gồm LAY_TAI_QUAN; không coi order count là lượt truy cập |
| B02 Món/biến thể | customer detail/cart; admin menu/categories | menu products118, variants1.393,categories25,attributes6; order customizations JSON | Top món, mix size/topping, category hierarchy; order-item price là lịch sử, menu price là hiện tại; không dùng explode JSON gây nhân doanh thu |
| B03 Khả dụng bán | manager/staff MenuPanel; admin-mobile InventoryScreen | inventory flag3.232 + global menu status; metric hiện là tồn kho | Available/paused/config coverage theo product×branch, fallback đúng checkout; snapshot only; không tự xây nhập/xuất/COGS |
| B04 Product review | customer detail/profile reviews; manager customer-care | review3.005 + order/product/user; basic stars/count có | Sao1–5, low-rating share, exposure-aware ranking, reply backlog/time, review vs sold; mẫu riêng; unique reviewers không bằng review count |
| B05 Branch review | customer stores; admin BranchDetailReviewsView | branch review2.077; status/tieu_chi/kiosk mất ở Silver | Public approved vs manager all; tiêu chí riêng, distribution, branch/kiosk mapping; không trộn rating shipper/product |
| B06 Survey | customer SurveyScreen; manager/admin survey | responses12, form1, JSON answers; chỉ count | Câu hỏi/type/version, phân bố lựa chọn, rating theo câu, missing answers, voucher state; không tính response rate nếu không có invitation denominator |
| B07 Khách hàng/loyalty | profile/membership; admin customers/membership-config | users342 (318CUSTOMER),config2,loyalty_order_award0 | Cohort mua/retention từ orders; tier hiện tại, điểm tích lũy vs khả dụng, cấu hình tier; không suy lịch sử thăng hạng từ current balance |
| B08 Vòng quay | profile wheel/mobile; user.service.quayMayMan | config và promotions LUCKY_WHEEL, không ledger đầy đủ | Phát/đổi voucher vòng quay nếu source có provenance; tổng spins/giải điểm historical = unavailable; không bịa xác suất quan sát |
| B09 Wallet khách | profile Wallet; customer-wallet.service | wallets4,transactions112; txn đã sync | Topup/payment/refund theo SUCCESS, pending riêng; balance là snapshot; tiền nạp không là doanh thu cà phê; chống đếm lại refund |
| B10 Gift card | customer giftcard/profile; gift-card.service | gift_cards13/theme9,ACTIVE10,REDEEMED2,CLAIMED1 | Phát hành, claimed/redeemed, số dư theo status; không lộ code/contact; không cộng issuance và spending thành hai lần doanh thu |
| B11 Khuyến mãi/voucher | customer voucher hub/cart; admin promotions | identity khuyen_mai38/usage4.013; orders voucher9; claims/outbox | Issuance/redemption/discount/eligibility; namespace/code bridge explicit, không union count voucher trùng; không gọi tương quan là uplift nhân quả |
| B12 Yêu thích/giỏ hàng | profile favorites/cart | favorite637,cart15 + metadata/operations | Favorites hiện tại; cart snapshot; không gọi abandoned-cart/conversion funnel khi thiếu session/event history |
| B13 Địa chỉ | profile addresses; delivery selectors | identity address503 + order frozen address | Count/coverage địa bàn tối thiểu cần thiết; địa chỉ đặt hàng lịch sử≠địa chỉ hồ sơ hiện tại; cấm expose PII/location detail |
| B14 Payment/refund | checkout,staff refund/void modal | payment38.843; wallet refund2; order state/history | Attempts vs settled amount vs refund/void; transaction/order grain, idempotency; refunded order≠canceled unpaid order |
| B15 Bàn/QR | manager/staff table-management | UI dựng danh sách bàn, order.ma_ban/status | Đơn/doanh thu theo bàn, bàn có order mở hiện tại; không seat occupancy/turnover duration chuẩn khi thiếu capacity và occupancy events |
| B16 Workforce | staff schedule; manager approve/workforce/employee | shifts4.144 | Requested vs approved, attendance/late/absence, worked duration có timestamp; không payroll hay đánh giá hiệu suất cá nhân từ số thô |
| B17 Chốt ca | staff/manager shift/approval | reconciliation4.140 | Expected/declared cash/difference, approved pending, refunds/cash method; cash discrepancy là tín hiệu đối chiếu không cáo buộc gian lận |
| B18 Delivery | staff delivery/manager shipper; shipper web/mobile | shipper301,delivery7.857,tracking7.875 | Assignment/order dedup, success/duration, mode Lalamove/internal, retry/batched; null timestamp không 0phút; không raw tọa độ/PII |
| B19 Shipper ví/COD | shipper-mobile Wallet/Earnings/Report | wallets9,cod_remit15,schedule0,exception0 | COD holding/remitted, commission/pending, wallet balance; dữ liệu rỗng khác thiếu bảng; không gộp ví shipper và ví khách |
| B20 CSKH/chat | customer chat/support; manager/staff inbox | conversation5,message33; chatbot schemas/logs riêng | Conversation/message counts,response time nếu timestamp/role hợp lệ; nội dung chỉ xử lý khi policy cho phép; không suy CSAT từ số tin nhắn |
| B21 News/support/static | customer news/about/careers/contact; staff news | news.articles3; nhiều trang static | Published/content coverage; không engagement/CTR/recruitment funnel nếu không event/application source |
| B22 Mạng lưới | customer stores; admin branches/satellite/kiosk | branches1.215:main1.155,satellite10,franchise50; franchise.kiosk51 | Model điểm bán canonical, parent-child, city/region,type; không join chỉ bằng tên; giải thích50 vs51 bằng mapping/status, không ép equality |
| B23 Franchise onboarding | customer nhuong-quyen; FranchisePanel | applications25,contracts9,kiosk51 | Hồ sơ stage, approved/rejected/contract/opening timestamps, expiry; mã DA_DUYET hợp lệ; không giả funnel history từ status hiện tại |
| B24 Combo franchise | franchisee order/history; staff kiosk combo | combo3,combo_orders9; satellite delivery table absent | Đặt/giao/tạm hoãn combo, giá trị mua; combo quantity khác retail stock; hai quy trình franchise và satellite riêng |
| B25 Debt/royalty | franchisee debt/royalty; accountant management | debts25,royalty5 | Outstanding/overdue/paid, phí chậm, rate/base/month; royalty phải thu khác cash receipt; ngày tháng theo entity thật |
| B26 Reconcile/cashflow | accountant thu-chi/FranchisePanel/DongTienTab | reconcile3,thu_chi0,violations0,audit54 | Reconciliation difference/status; cashflow empty truthful; audit actions != cash transactions; role display name có thể đổi |
| B27 Franchise POS/ca/giá | franchisee13tabs; franchise staff4tabs | kiosk_shift_session6,price overrides798,orders/users fields | Kiosk revenue/shift counts, session cash; mapping ma_kiosk/id/co_so_ma; price overrides không là giá thực thu lịch sử |
| B28 Ví identity / chủ kiosk | franchisee wallet; identity wallet routes cho FRANCHISEE/CUSTOMER | identity.vi_giao_dich6,user.so_du_vi | Consumer xác nhận là franchise portal; ledger context không độc quyền theo role. Tách khỏi customer-wallet; audit type/sign/reference trước sums; không double-count combo/debt payment |
| B29 Account/config/notification | admin users/SMTP; account/security; notifications | roles8,notification1.211,SMTP config | Role counts/config health chỉ nếu cần; secrets/password/tokens ngoài analytics; notification records không chứng minh delivered/read nếu thiếu event |
| B30 Auxiliary sources | finance/context/master_data; phần ai/analytics/public cần map B33/B34 | bảng seeded/legacy/technical chưa xác nhận riêng từng write-path | Phân loại từng table, không gộp cả schema là legacy; chưa chứng nhận nguồn thì không tạo ROI/P&L sử dụng nó; technical observability tách business metrics |
| B31 Guest/identity link/reorder | customer guest checkout/tracking/link orders, cart merge; staff POS anonymous | order owner varchar/session; cart operations/quote, current owner có thể bị đổi | Order grain không mất guest; current ownership vs creation identity; preview/merge không là order mới; historical conversion chưa có ledger thì unavailable |
| B32 Shipper rating/dispatch | customer rate-shipper; admin config/KPI/finance; shipper schedule/exception/batch | rating profile+note overwrite, 2 assignment keys lệch, config không lưu, Redis/client batch state | Score snapshot vs rating events; assignment semantics, config provenance, bounded batch snapshot; không giả SLA/payout/history. Liên kết B18/B19, không cộng trùng metrics |
| B33 AI commerce/ML/RAG | customer chatbot/voice/recommendation; admin web/mobile AiAnalytics/SystemOps | AI sessions/logs, models/forecast API; static knowledge JSON + in-memory index | Capability/source/model status và forecast provenance; actual/predicted riêng; outcome/uplift/quality phải có oracle/exposure; raw prompt/PII restricted |
| B34 Callback/async/technical | payment VNPAY/SePay, delivery Lalamove, checkout outbox/idempotency, data-sync/Kafka | persisted outcomes, quote/operation/outbox, gateway/service handlers và checkpoint | Callback attempts không là payment mới; queued≠settled, replay chống nhân số; technical freshness/failed jobs riêng, không biến mọi technical table thành business KPI |

### A.4. Hosts và đường dẫn đọc tiếp

- Runtime Docker: web-admin **5174**, web-customer **5175**, data UI **8501**, analytics API **8502**, gateway **3000**, order **3005**, ai commerce **8009**, analytics PG **5434**, local app PG **6543**. Sự tồn tại local PG không chứng minh app dùng nó; runtime app source hiện là endpoint ngoài máy.
- Config web-shipper cũng đặt5175, trùng customer; shipper-launcher5176. Không thấy container web-shipper/launcher trong `docker ps` lúc audit. Không khởi động đè port; Claude phải phát hiện host thực và chọn port trống cho test riêng.
- Customer: `apps/web-customer/src/App.jsx`, `components/Profile*`, `apps/customer-mobile/src/navigation` và `screens`.
- Admin: `apps/web-admin/src/features/actor-admin/components/AdminSystemConsole.jsx`: overview/categories/menu/promotions/customers/membership/survey/branches/shippers/kiosks/satellite/users/SMTP/account.
- Manager/staff/kiosk: `apps/web-admin/src/App.jsx:190`, `features/admin-dashboard/{constants.js,components, hooks/useAdminDashboard.js}`; manager thêm customer-care/survey/employee/workforce/shipper/satellite/shift-approval. KIOSK_STAFF khác FRANCHISE_STAFF.
- Franchise: `features/franchise/{FranchiseePortal,FranchiseStaffPortal,FranchisePanel,AccountantFranchiseShell,DongTienTab,BiDashboard}.jsx`; identity `auth/workspace-policy.ts` và `modules/franchise`; order kiosk-shift-session.
- Analytics: `services/{semantic_candidate_service,domain_intelligence_service,request_anchors,hybrid_analyst_planner,analysis_issue_service,data_coverage_service}.py`; `metadata/semantic_catalog.json`; `data-platform/metadata/{data_contracts,runtime_data_contracts,warehouse_views}.json`; `data-sync/sync.py`; `pipeline-common/pipeline_runtime.py`.

### A.5. Giới hạn phải giữ trong handoff

Chưa gọi model thật với câu lỗi; chưa kiểm số−98.6% bằng đúng report artifact; chưa duyệt toàn bộ các tab bằng mọi tài khoản; chưa xác minh nhà cung cấp Supabase hay một project riêng; chưa chứng nhận full key/content parity mọi nguồn; chưa khẳng định các bảng auxiliary là dữ liệu kinh doanh thật. Các phần này là gate triển khai, không được ghi PASS trước.

Các test hardening cũ xác nhận cơ chế trong corpus/catalog cũ. Chúng **không chứng minh phát hiện đầy đủ chức năng hệ thống hoặc retrieval đúng với mọi câu hỏi**. Giữ nguyên receipts cũ và bổ sung lớp nghiệm thu theo business coverage mới.

### A.6. Actor × nền tảng × phạm vi

Các dòng dưới là **ngữ cảnh nghiệp vụ**, không phải đề xuất thêm role. Count role từ `relations.json`; đăng nhập riêng và guest không nằm trong count đó. Capability/auth thực phải theo guard và source scope, không theo tên tab.

| Actor | Surface/owner đã đọc | Phạm vi dữ liệu và nhóm bắt buộc | Mức kiểm chứng / phần còn phải kiểm |
|---|---|---|---|
| GUEST / khách POS không tài khoản | web-customer, customer-mobile; cart/checkout/tracking/link/reorder | Session/order ownership; catalog/stores/reviews công khai; B01–B06/B11–B15/B31 | Static + DB aggregates; không giả mọi anonymous ID là user; live fixture cần chống link chéo session |
| CUSTOMER (318) | Profile/menu/detail/cart/orders/tracking/membership/wheel/wallet/gift/address/favorite/survey/chat; web+mobile | Own orders/profile/benefits và public content; B01–B15/B20/B21/B23/B31/B33 | Customer web profile đã quan sát vòng1; chưa test mọi tab/action/mobile. Gift sender/receiver/claimer là quan hệ trong feature, không role mới |
| ADMIN (1) | web-admin actor-admin/AdminSystemConsole; admin-mobile DrawerMenu/MainShell | Users,menu,categories,promotions,membership,survey,branches,shippers,kiosk,satellite,SMTP,AI/system; B01–B34 theo capability | Static. Đây là role hiện được vào Analyst; user counts không phải quyền đọc PII. Analytics data scope phải vẫn qua principal/allowlist |
| MANAGER (6) | web dashboard/customer-care/workforce/employee/shipper/satellite/shift approval; admin-mobile | Assigned branch/cluster và child sites theo policy, không toàn hệ thống mặc định; B01–B06/B15–B22/B24/B29/B32 | Web overview/menu/review/survey đã quan sát vòng1; các module còn lại static, branch hierarchy cần fixture scope |
| STAFF (10) | web dashboard/POS/orders/menu flag/chat/news/shift/workforce/profile; admin-mobile | Own/assigned branch, shift và order permissions; B01–B05/B12/B14–B21/B29/B31 | Static; cashier display name không mặc nhiên là stable user FK; POS permissions JSON cần tests allow/deny |
| KIOSK_STAFF (1) | Staff workspace + kiosk/satellite context; roles guard mở rộng STAFF | Assigned satellite/kiosk, branch parent, combo deliveries khác franchise orders; B01/B03/B14–B17/B22/B24/B29 | Static; bảng satellite delivery đang thiếu. Không đồng nhất với FRANCHISE_STAFF hoặc fallback mobile staff |
| FRANCHISEE (2) | FranchiseePortal: POS/orders/menu/price/staff/shifts/combo/debt/royalty/wallet/contracts/reconcile theo nav thực | Kiosk ownership/pos_permissions, franchise ledger; B01/B03/B14/B22–B29 | Static; map13tab từng action ở P0. Identity wallet API cũng cho CUSTOMER, không suy độc quyền theo role |
| FRANCHISE_STAFF (3) | FranchiseStaffPortal, staff login workspace | Assigned franchise kiosk, POS/orders/ca và rights được cấp; B01/B03/B14/B22/B24/B27/B29 | Static; legacy STAFF+kiosk normalization phải theo workspace-policy tests; không coi giống quyền chủ kiosk |
| ACCOUNTANT (1) | AccountantFranchiseShell/FranchisePanel/DongTienTab/BiDashboard | Quản lý chủ kiosk/hợp đồng/công nợ/royalty/thu-chi/đối soát theo guard; B22–B29 | Static; tên nghiệp vụ có thể đổi, giữ enum/auth. Mobile chưa có shell riêng được xác nhận; không suy mọi kế toán được đọc toàn bộ khách hàng |
| SHIPPER (301 profile, auth riêng) | web-shipper, shipper-mobile, launcher; order-service ShipperModule | Assigned deliveries, own wallet/COD/history/vehicle/schedule/exception/notifications/batch/GPS; B18/B19/B29/B32 | Static + DB; không có host shipper live đã xác minh. Không gọi demo login tạo tài khoản hoặc mở wallet mới để audit |

Actor kỹ thuật riêng: payment callback VNPAY/SePay, delivery callback Lalamove, checkout quote/outbox worker, AI commerce, ingestion/Kafka worker. Map trusted caller, event id/idempotency, event time vs processing time, source owner và persisted outcome; không cấp cho chúng user role hay coi callback request là giao dịch kinh doanh thành công.

Web/mobile là các surface khác nhau. Screens trong MainShell hoặc hidden stack chưa chứng minh route accessible/guard đúng. Launcher là điểm khởi chạy, không thêm actor kinh doanh. P0 phải đối chiếu nav→screen→API consumer→gateway→controller→module registration→guard→service→source; các đường gián tiếp/dynamic còn chưa resolve giữ trong unresolved list, không tự đánh dấu PASS.

### A.7. Bản đồ dữ liệu bổ sung và evidence vòng hai

| Dữ liệu | Writer/consumer cần theo | Hợp đồng/giới hạn bắt buộc |
|---|---|---|
| Product options/variants/toppings | menu config + cart/order customization | Current config và frozen order selection riêng; object vs array, source precedence, giá/topping grain, unknown option keys |
| Order status history/checkout ops | order/payment/shipper + quote/cart mutation/outbox | Event class/status/clock/duplicates; request/result cache không thêm order; retries không nhân payment/refund |
| Review criteria/survey answers | BranchReview/Survey services | Criteria/question ID/version/scale/missing denominator; image URL chỉ metadata được phép |
| Membership/permissions JSON | user config + POS authorization | Config current vs effective history; role không thay quyền POS; secrets/config nhạy cảm excluded |
| Cash close/kiosk shift JSON | ca_doi_soat/kiosk_shift_session | Frozen summary vs transaction ledger; partial/null JSON và scope; không double count |
| COD details + delivery keys | shipper service + wallet + remit | Snapshot per branch, movement khác nhau; hai khóa tài xế xung đột; không coi wallet balance là đã chi tiền |
| Chat/notification/session/log JSON | chat service/WebSocket; AI conversation/turn log; notification service | Stored message vs event emitted vs delivered/read, redact nội dung; realtime event không bảo đảm persisted history |
| Redis/client state | shipper batch TTL86400, mobile localBatchedMap/session; cart/chat state theo owner | Ephemeral/rebuildable, không warehouse fact lịch sử; không đọc token/device storage để analytics |
| Static knowledge/model state | ai-service RAG raw_data JSON/menu ingestion, sparse in-memory index; forecast/recommend runtime | Static fact/operational fact/prediction phân biệt; source/model version và cutoff; không mặc định FAISS/joblib nếu runtime không dùng |
| Data Platform artifacts | report/job/session/certificate/provider ledger theo hardening hiện có | Observability/control data; owner/revision/CAS/redaction; không trộn vào doanh thu nguồn hoặc mở quyền SQL/log cho business user |

Bằng chứng mới, không ghi đè probes vòng1:

- [actor-route-inventory-round2.json](evaluation/business-coverage-20261020/actor-route-inventory-round2.json): inventory **110 files** controller/entity/gateway/module ở services và gateway (29 controller,55 entity); **381 decorator declarations**, gồm Controller và WebSocket, **không phải 381 endpoint đã chạy**. Có hashes và15 refs trọng tâm; source column-type census. Đây là index để đọc tiết kiệm, không chứng minh mọi route active hoặc authorized.
- [data-shapes-round2.json](evaluation/business-coverage-20261020/data-shapes-round2.json): probe source READ ONLY ngày20/10 khoảng10:19 giờ Việt Nam; 44 JSON shape profiles,2 ARRAY metadata, guest/delivery/profile/gift/wallet aggregates. Không xuất nội dung/PII/ID business rows; không gửi provider.
- [data-shapes-round2-keys.json](evaluation/business-coverage-20261020/data-shapes-round2-keys.json): probe riêng khoảng10:20, tách NULL-key khỏi conflicting-key và kiểm orphan. Đây là transaction khác; không ghép thành full snapshot certificate.

**Các giới hạn còn lại:** chưa kiểm mọi nested key/type/value; chưa xác nhận mọi endpoint/module/gateway path bằng runtime; chưa kiểm Redis/client contents hay mọi model artifact; chưa replay các lỗi chuyển tiền/rating trên fixture; chưa truy nguyên provenance từng delivery key/seeded wallet. P0/P2/P6 phải khép các điểm này bằng evidence. Không báo “đã hiểu hết” chỉ vì đọc đủ filenames hoặc count tables.

### A.8. Quy tắc xử lý findings và phần còn chờ

| Ưu tiên | Findings/nhóm | Việc phải làm / phase | Bằng chứng để khép |
|---|---|---|---|
| P0 bắt buộc | A17/A23/A25/A26; B31–B34 | Actor/platform/source-column registry, nested field + non-DB storage disposition; active UI/API vs declaration-only | Denominator versioned, orphan/unresolved list, schema/reference checks; không dùng route count thay feature coverage |
| P1 chặn diễn giải sai | A01–A08/A18/A19 | Review retrieval, availability, visibility, driver score labeling, bỏ static KPI khỏi nguồn được tin cậy | Independent candidate/numeric/presentation counterexamples; API/UI không phát số giả như dữ kiện |
| P2 integrity | A20/A21/A27/A14 | Delivery key contract, gift-credit integrity, wallet references, missing satellite source; fixture migrations nếu cần | Control totals + row-level reconciliation trong môi trường được phép; issue classification và metrics affected; không tự sửa source production |
| P2 health | A11–A13/A16 | Reader/lineage/proof/period closure và provenance | Health/certificate tests và scope-specific proof; unknown không bị đổi thành verified |
| P3/P4 business | B01–B34 | Mỗi feature đủ nguồn đi hết source→report; thiếu history được giới hạn đúng; membership/guest/shipper/AI active không bỏ sót | Metric contract, scope/time/source oracle, NL + preset/save/export parity; không gọi IMPLEMENTATION_GAP là unsupported |
| P6/P7 acceptance | Toàn bộ | Cross-role negative tests, JSON/grain/clock/money/key drift, live bounded | First-pass receipts + unresolved0 đối với release gates; browser chỉ luồng cần xác minh, không lặp đọc mọi tab |

Phần cần lịch sử mới (rating events, flag history, wheel full ledger, recommendation exposure, dispatch policy history) phải có capability giới hạn đúng và instrumentation proposal có owner; không bắt xây ngược quá khứ hoặc thêm toàn bộ microservice mới. Phần **đang có nguồn active và đủ semantics** vẫn là implementation bắt buộc. Phần **nguồn đang sai/mâu thuẫn** là integrity blocker của metric bị ảnh hưởng, phải nêu chứng cứ và dependency cụ thể; không làm xanh bằng nhãn `SOURCE_NOT_CAPTURED`.

<a id="execution-checkpoint"></a>
## Phụ lục B. Checkpoint thực hiện

Cập nhật trực tiếp mục này khi triển khai; không cần một file progress riêng.

Status: **IMPLEMENTED — LIVE_GATE_NOT_MET** (P0–P8 đã làm; gate live first-pass holdout 69% < 95%; cập nhật 20/10/2026, lượt triển khai 3). Không phải FULL_ACCEPTED.

### Đã làm ở lượt audit/PLAN

- Kiểm kê metadata nguồn 78 quan hệ, constraints và aggregate profiles; đối chiếu 23 hợp đồng ingestion,21 Silver tables,52 metrics,16 profiles.
- Đọc role navigation, APIs/services/entities; browser xác minh customer profile và manager overview/menu/reviews/surveys ở vòng1. Vòng2 bổ sung guest + shipper auth riêng, mobile/platform và technical actors; không ghi thêm live UI pass.
- Tái hiện offline candidate packet sai miền cho câu review; xác định contextual clarification bị lạc.
- Đối chiếu mở bán vs quantity; mẫu review; branch review visibility; các nghiệp vụ chưa bao phủ.
- Xác minh reader không đọc được sync_history và tách incremental health khỏi full snapshot proof.
- Rà vòng2: inventory110 declaration files (29 controller/55 entity), 44 JSON shape profiles +2 ARRAY metadata; thêm A17–A27 và B31–B34. Xác minh static shipper KPI/config, rating trọng số, gift-transfer chưa credit, guest ownership, 7.472 conflicting delivery keys, 62 payment references thiếu.
- Hợp nhất actor matrix, dữ liệu ngoài DB, phase ownership và integrity gates trong cùng PLAN R3; corpus floor264.
- Lưu evidence không credentials/PII tại `evaluation/business-coverage-20261020/`.
- Chưa sửa product code/schema/grants/source data; 0 provider sends. Không làm mất changes hardening cũ.

### Phần phải đọc trong PLAN này

1. Prompt giao Claude ở đầu file.
2. Mục 0–2 rồi phase đang làm trong mục 6.
3. Phụ lục A: nhóm Bxx tương ứng và evidence liên quan.

### Lượt triển khai 1 — 20/10/2026 (HEAD 790eae42 + thay đổi chưa commit; 0 provider send, 0 DB write)

| Phase | Trạng thái | Files/symbols | Receipt |
|---|---|---|---|
| P0 registry | PARTIAL | `analytics-api/metadata/business_feature_registry.json` (34 nhóm, 78/78 bảng ledger, 15 actor; đặt trong analytics-api vì container chỉ mount thư mục này); `services/business_registry.py` (`validate_registry`, `coverage_report`); `tests/test_business_registry.py` | orphan bảng=0; state: AVAILABLE 14, IMPLEMENTATION_GAP 11, POLICY_RESTRICTED 3, SOURCE_INTEGRITY_ISSUE 2, TECHNICAL_EXCLUDED 2, SOURCE_NOT_CAPTURED 1, UNVERIFIED_PROVENANCE 1; 24 mục IMPLEMENTATION_GAP mở |
| P0 corpus | PARTIAL | `evals/business_coverage_cases.json` v1: 16 ca candidate-only (4 holdout), đóng băng trước sửa | trước sửa 8/14 fail (+2 ca hồi quy thêm sau); sau sửa 16/16. Còn thiếu tới sàn 264 ca |
| P1 A01 retrieval review | DONE (offline) | catalog `domain_intelligence.topic_concepts` (customer_feedback); `DomainIntelligence.resolve_topics/topic_vocabulary`; `candidate_packet` (topic_context, bundle chủ đề, `unresolved_meaning.topic_target`) | câu gốc → `product_reviews` + `avg_product_rating,review_count`; "đánh giá doanh thu" giữ orders; "đánh giá" trơn → hỏi lại 3 lựa chọn |
| P1 A19 điểm tài xế | DONE | `driver_rating` → "Điểm hồ sơ tài xế hiện tại" (trọng số 80/20), bỏ alias chung "đánh giá"/"sao" | "món sao thấp" không còn lạc sang delivery |
| P1 A04/A05 D09 | DONE (offline) | 2 metric `sale_positions, paused_sale_positions` (bỏ "đang mở" = cấu hình − tạm ngưng và "số món distinct" để giữ ngân sách context đã kiểm bởi test capacity) theo đúng checkout (`dang_kinh_doanh IS NOT TRUE` mới chặn; thiếu dòng không chặn); `stock_quantity/low_stock_count` + 2 dimension → `deprecated` (giữ để compile báo cáo cũ, ẩn khỏi anchor/manifest/menu; validate cấm profile/template/risk dùng lại); D09 v2.0.0 "Khả dụng bán theo điểm bán"; risk `paused_positions_exist`; unsupported `physical_stock_quantity`; preflight cảnh báo snapshot ở mức chủ đề | `tests/test_business_coverage_availability.py` (oracle Python độc lập: 5/3); D09 1.0.0 đã lưu → `dashboard_unavailable` (refresh), không đổi KPI âm thầm |
| P1 A03 nhãn clarification | DONE | `analysis_issue_service.topic_metric_labels` | nhãn lấy theo miền đã retrieve, không cố định doanh thu/AOV |
| P1 A07 visibility review chi nhánh | BLOCKED_APPROVAL | gói đề xuất bên dưới | — |
| P1 A18 KPI/tài chính shipper cố định | OUT_OF_SCOPE_THIS_TURN | API NestJS (`getKpiData/getFinanceData`), ngoài data-platform | analytics không ingest các endpoint này (B19 ghi SOURCE_INTEGRITY_ISSUE) |

Test cập nhật theo định nghĩa mới (không nới assertion): `test_one_shot_v24` (6 view khả dụng), `test_workspace_v31`, `test_v33_identity` (56/47 metric), `test_hybrid_v28` (public 45), `test_v35_dashboards` (D09 2.0.0), eval `inv_01/02, v31_inv_01..03`, `web-ui/src/utils/workspace.test.mjs`; tái sinh `tests/fixtures/capabilities_v31.json` bằng `tools.regenerate_capabilities_fixture`.
Receipts: eval offline 146/146 (retrieval_domain 110/110, metric 110/110, preflight 20/20); web-ui node tests 191/191; 17 module liên quan xanh trừ `test_hot_path_latency_and_no_io` (p95 ~66–75ms > 50ms, **tái hiện cả với catalog HEAD và tắt topic resolution** → do máy tải cao, load avg ~9; chưa kiểm chứng trên máy rảnh). Full backend (`dp-test.sh backend`, lần 2): **1384 test, 2 fail** — chỉ hai ngưỡng latency p95<50ms (`test_hot_path_latency_and_no_io` 67ms, `test_warm_preflight_p95...` 70.6ms, p50 ~15ms); lần 1 phát hiện 5 hồi quy thật đã sửa: "đánh giá toàn diện…" bị hiểu thành review (thêm evaluative_objects, bỏ fallback lấy đối tượng ở cả câu; ca BC-REV-015/016) và vượt ngân sách context (prompt chỉ gửi đầy đủ `unavailable_definitions` cho khái niệm được neo, không gửi aliases; gọn tên/định nghĩa; còn 2 metric khả dụng). Không nới ngưỡng test nào.
Quyết định tự đưa ra: "bán" vào `retrieval_stopwords` (fallback chọn miền theo từ trùng nhãn); tỷ lệ vị trí tạm ngưng (ratio) chưa thêm vì cần component metrics; `health_signals` inventory dùng peer theo store, `comparable_exposure=false`.

**User đã duyệt (20/10, lượt 2): toàn bộ gói DDL kho analytics (hợp đồng ingest mới, view silver, rebuild data-sync; không ghi DB nguồn) và live test P7 theo cap §8.** Gói A07 (DDL view kho analytics): `metadata/warehouse_views.json` `silver.danh_gia_chi_nhanh` thêm `dg.trang_thai AS raw_status`, `CASE WHEN dg.trang_thai='APPROVED' THEN 'PUBLIC_VISIBLE' WHEN dg.trang_thai IS NULL THEN 'UNKNOWN' ELSE 'NOT_PUBLIC' END AS normalized_visibility`, `'v1' AS visibility_mapping_version`, `dg.tieu_chi`; replica đã có cả hai cột (data_contracts). Sau đó catalog: dimension `review_visibility`, metric mặc định lọc PUBLIC_VISIBLE, phạm vi manager "tất cả" explicit. Rollback = view cũ (CREATE OR REPLACE). Không map HIEN_THI=APPROVED khi chưa có quyết định nghiệp vụ.

### Lượt triển khai 2 — 20/10/2026 (user duyệt DDL kho analytics + live P7)

| Phase | Trạng thái | Kết quả chính |
|---|---|---|
| P2 nguồn | DONE (kho thật) | +26 hợp đồng ingest (`metadata/data_contracts.json`, 53 cột liên hệ/văn bản/mã/ảnh/tọa độ `restricted`+`redacted`), bằng chứng schema chỉ-đọc `evaluation/business-coverage-20261020/round3/`; tool `analytics-api/tools/deploy_business_coverage_round3.py` (plan offline + apply có cờ duyệt, 1 transaction, chỉ additive) đã áp: 26 bảng, 26 view (24 mới + `danh_gia_chi_nhanh` thêm hiển thị công khai, `giao_hang` thêm cờ lệch khóa); data-sync rebuild: **49/49 bảng, 125.326 dòng, success**; sửa so sánh cột `json` (42883). Reader đọc được mọi view có ngữ nghĩa, `sync_history` (G5) |
| P2 G5 | DONE | `data_coverage_service`: lỗi quyền đọc lịch sử → `history_reader=denied` thay vì unknown giả; `routers/system.py` kiểm quyền theo cột |
| P3/P4 ngữ nghĩa | DONE | catalog 106 metric (52 mới), 26 miền (+customer_wallet, gift_cards, shipper_finance, customer_care, news_content, franchise_network, franchise_finance, kiosk_operations, survey_answers, loyalty_awards); B05 `public_store_review_count` + `review_visibility`; B18 `delivery_driver_key_conflict_count` (7.472); B31 `anonymous_order_count`; 13 khái niệm giới hạn có quản trị (vòng quay, bàn, bỏ giỏ, CTR, nội dung chat/nhận xét, SLA, uplift AI, thông báo, chi trả shipper, callback, thẻ quà→ví, thời gian duyệt hồ sơ); PII tiếng Anh |
| Oracle | DONE | `tests/test_business_coverage_oracles.py`: 100% metric mới có oracle Python độc lập (fixture có bẫy pending/paid/open shift/dấu âm/chọn nhiều/NULL) |
| P6 corpus | DONE (candidate-only) | `evals/business_coverage_cases.json` v2: 282 ca, mọi B01–B34 ≥6 + 66 liên miền, 85 holdout (30%), hash `evals/business_coverage_manifest.json`; lần đầu 258/282, sau sửa tổng quát 282/282; 3 oracle sửa có lý do trong history |
| Sửa hệ thống khi mở rộng | DONE | `available()` dùng manifest đầy đủ (trước đây miền bị cắt khi catalog lớn); fallback retrieval so khớp có dấu ("hôm qua"≠"quà"); metric nằm trong cụm subject dài hơn thuộc subject; follow-up tỉnh lược giữ chủ đề; caveat chỉ gửi khi gói dùng; alias không trùng giá trị phạm vi |

Quyết định đánh đổi: planner lưu trữ `OneShotPlanner` (không route production) được test trên phạm vi catalog lịch sử (`tests/archive_planner.historical_catalog`); ca "6 miền" của nó tăng 33,8k→35,0k (+3,5%, PLAN §7.3) do metric B05/B18/B31 — ngưỡng test 35.500 và vẫn ≤ ngân sách server. Registry: AVAILABLE 25 nhóm.

### Lượt triển khai 3 — 20/10/2026 (đóng P5–P8)

| Phase | Trạng thái | Kết quả chính |
|---|---|---|
| P5 khoảng trống | DONE | B02: view `silver.topping_don_hang` (tách mảng JSON topping), `topping_selection_count`, dim `topping`/`item_size`/`ice_level`/`sweetness`, lens `topping_mix`; B14: `settled_payment_amount` (SUCCESS/THANH_CONG/DA_THANH_TOAN), `unsettled_payment_count`; B11: limitation có chứng cứ (không có khóa nghiệp vụ nối voucher identity↔đơn). Rollout lần 4: 26 bảng, 27 view, guard 23 (`migrations/029` tái sinh), bằng chứng `round3/rollout-applied-4.json`; reader đọc view mới (topping ~8,4k lượt/loại; thanh toán thành công 38.819 giao dịch) |
| P5 retrieval | DONE | Server tự hỏi lại khi "đánh giá" thiếu đối tượng (`subject_ambiguous`, lựa chọn sinh từ `topic_concepts`, 0 provider send); alias không dấu ("tra") không còn khớp trong câu có dấu ("kiểm tra"); giá trị lọc trùng từ đồng nghĩa subject ("đồ uống") được bỏ có ghi `subject_synonym_not_a_filter` |
| P7 live | DONE — gate chưa đạt | 63 ca (mọi miền active ≥1 ca, 42 holdout), 98/120 send dự trữ, 86 HTTP thật, 248.151 token đo được (+pilot-1 ≤50k ước tính) / 500k; first-pass 47/63, holdout 29/42 (69%); sau sửa tổng quát + retest có giới hạn: 60/63, holdout 39/42; 7/7 ca bắt buộc (first-pass 4/7). Còn trượt: BC-B14-006, BC-B18-005, BC-B22-006 (hành vi model). `round3/live-*.json` |
| Hồi quy full suite | DONE | Planner lưu trữ: một catalog lịch sử cho cả proposal/execute/saved-report (`tests/archive_planner.py`), giữ subject cũ của miền có subject mới, bỏ D17+; `item_size`/`ice_level`/`sweetness` `filter_anchor=false` ("lớn nhất" không thành lọc size); bỏ dim trùng (dùng `payment_transaction_status` có sẵn); `news_overview` mặc định chỉ số có lịch sử; prompt chỉ gửi khái niệm chưa hỗ trợ được nhắc trong câu (ngữ cảnh câu món 14,0k→≤13,2k); cache `value_text` (10 job offline 25,3s→17,7s, preflight p50 77→7ms); fixture warehouse có dữ liệu cho 26 miền (26/26 dashboard mặc định ≥4 view) |
| P8 hồ sơ | DONE | Từ điển nghiệp vụ sinh tự động `round3/business-data-dictionary.md`; báo cáo G1–G8 dưới đây |

#### Nghiệm thu G1–G8

| Gate | Kết quả | Bằng chứng |
|---|---|---|
| G1 phạm vi | ĐẠT (data-platform): 34/34 nhóm có trạng thái + chứng cứ; 78 bảng nguồn đã phân loại; 0 IMPLEMENTATION_GAP | `metadata/business_feature_registry.json`, `tests/test_business_registry.py` |
| G2 nghiệp vụ | ĐẠT: 25 AVAILABLE; còn lại POLICY_RESTRICTED (B13,B33), SOURCE_INTEGRITY_ISSUE (B10,B32), SOURCE_NOT_CAPTURED (B08,B15), TECHNICAL_EXCLUDED (B29,B34), UNVERIFIED_PROVENANCE (B30); tồn kho chỉ còn khả dụng bán | registry + catalog 109 metric / 26 miền / 15 khái niệm giới hạn |
| G3 NL đúng miền | ĐẠT offline (candidate recall 282/282, câu review gốc + paraphrase không lạc sang doanh thu); live: 0 miền không có ca pass | `tests/test_business_coverage_corpus.py`, `round3/live-summary.json` |
| G4 số bảo vệ được | ĐẠT: 100% metric mới có oracle độc lập | `tests/test_business_coverage_oracles.py` |
| G5 nguồn minh bạch | ĐẠT: `history_reader` ok/empty/denied/unavailable; 49/49 bảng sync | `data_coverage_service`, `round3/reader-verification.json` |
| G6 toàn luồng | ĐẠT một phần: preflight→proposal→execute→report chạy thật cho 26 miền (live); filter/drill/save/Word cho miền mới chỉ kiểm offline + demo thủ công bên dưới (chưa kiểm chứng UI mọi role) | live rows, web 191/191 |
| G7 không hồi quy | ĐẠT trừ 2 test latency: full backend 1561 test, còn 2 FAIL p95<50ms (`test_hot_path_latency_and_no_io` 59ms, `test_warm_preflight_p95…` 62ms; p50 7ms, CPU/vòng ~10ms ≪ wall → do tải máy, chưa kiểm chứng trên máy rảnh) + 1 lỗi natural_v26 đã sửa và chạy lại riêng 24/24 OK; eval 146/146; web 191/191; pipeline 65/65; data-sync 5/5 | `.claude/scripts/dp-test.sh backend|eval|web` |
| G8 bàn giao | CHƯA READY: gate live first-pass holdout 69% < 95% | mục này |

#### Kịch bản demo thủ công (web-ui :8501, tab AI Data Analyst)

1. "Đánh giá tuần này thế nào?" → hỏi lại chọn đánh giá món / chi nhánh / tài xế (không gọi AI).
2. "Điểm đánh giá trung bình của món theo tháng" → biểu đồ rating món, không lẫn doanh thu.
3. "Topping nào được chọn nhiều nhất?" → xếp hạng `topping_selection_count`.
4. "Tiền thanh toán thành công so với giao dịch chưa thanh toán theo phương thức" → 2 chỉ số tách biệt.
5. "Số dư ví khách hàng", "Thẻ quà tặng còn dư", "COD shipper chưa nộp" → miền mới, có caveat.
6. "Số điện thoại khách hàng" → bị chặn quyền riêng tư; "Tỷ lệ giao đúng giờ" → khái niệm chưa hỗ trợ kèm giải thích.
7. Lưu báo cáo → mở lại → xuất Word.

#### Blocker còn lại

- Gate live first-pass holdout (95%) chưa đạt — cần cải thiện prompt/planner tổng quát rồi chạy campaign mới (còn 22 send dự trữ trong ledger của campaign này).
- Receipt live được đo trước các sửa của vòng hồi quy cuối (khớp alias có dấu, `filter_anchor`, thu gọn khái niệm chưa hỗ trợ, B02/B14); chưa chạy live lại trên code cuối.
- A18 KPI shipper tĩnh ở NestJS (ngoài data-platform). B11 namespace voucher: limitation. Mapping `HIEN_THI` của đánh giá chi nhánh cần chủ nghiệp vụ xác nhận.
- Test latency `test_hot_path_latency_and_no_io` (p95 < 50ms) đo 67–81ms khi máy tải; cũng trượt với catalog HEAD — chưa kiểm chứng trên máy rảnh.

### Bước tiếp theo cho Claude

1. Nếu user muốn đạt G8: phân tích 16 ca first-pass trượt (`round3/live-main.json`), sửa tổng quát (không vá theo câu), chạy campaign live mới khi được duyệt. 2. Kiểm UI thủ công theo kịch bản trên cho mọi role. Lệnh nhanh: `.claude/scripts/dp-test.sh module tests.test_business_coverage_corpus tests.test_business_coverage_oracles tests.test_business_registry`.

### Những điều chưa được xác minh

- Model thật với câu review; full UI acceptance mọi role; baseline chính xác của −98.6% ảnh.
- Supabase vendor/project riêng; source hiện audit là runtime PostgreSQL chung app/ingestion.
- Full key/content parity mọi nguồn; provenance finance/context/master_data; mapping site 50 vs 51.
- Bảng satellite combo thiếu ở source đã kiểm: cần migration dependency review, không tự tạo.
- Canonical delivery assignment key/provenance; gift→wallet atomic credit; thiếu reference của62 payments; full nested-key contents và runtime route/role checks chưa khép. Xem A.7/A.8, không đánh dấu audit findings là đã sửa.

### Mẫu cập nhật mỗi phase

Phase/status | files/symbols | quyết định | tests+receipt | corpus/fingerprint | provider sends/tokens cumulative | blocker | next exact action.

Không dùng kết quả hardening cũ làm chứng minh business coverage mới; không đổi status sang DONE trước G1–G8.

### Kiểm chứng UX/UI và luồng demo — 21/10/2026

Phạm vi lượt này là cỡ chữ, danh mục năng lực, điều chỉnh báo cáo và kiểm chứng hạ tầng đang chạy. Kết quả này **không thay thế nghiệm thu business coverage G1–G8** ở trên.

- Cỡ chữ: KPI bản đồ 17–21px (đo production desktop 20,16px), nút bản đồ 12px, tiêu đề workspace khoảng 18–20px. Giảm KPI Tổng quan từ 24px xuống 20px.
- “Hỏi được gì?” chuyển từ accordion trong cột tiêu đề sang dialog 1080×720 tối đa: nhóm dữ liệu và chi tiết có vùng cuộn riêng, tìm kiếm, số lượng kết quả, đóng bằng Escape, giữ focus. Mobile có vùng chọn nhóm riêng, không tràn ngang. Câu mẫu chỉ điền nội dung, không tự gọi AI.
- Ô điều chỉnh giữ state nhập cục bộ, không sticky/fixed; có hướng dẫn, kiểm tra yêu cầu rỗng/một từ không rõ/không có chữ/vượt 1.000 ký tự và hỗ trợ composition khi gõ tiếng Việt. Nhập chuỗi thử trên production đo 197ms; đây là một phép đo, không phải cam kết p95.
- Đã tái hiện lỗi thực: `guided_intent` cũ bị phát lại khi cần semantic delta; thiếu phạm vi mới không tạo đúng target phục hồi; góc nhìn sinh tự động bị đòi giữ lại sau khi parent thay đổi. Đã sửa theo hướng giữ ràng buộc phạm vi người dùng và tái tạo góc nhìn phụ, không nới quyền/chỉ số/thời gian. Bước diễn giải được cung cấp delta địa lý từ catalog, vẫn qua resolver/verifier và giới hạn context.
- Phép thử Gemini đã được người dùng cho phép: “Chỉ lọc Hà Nội, giữ nguyên chỉ số và thời gian”. Tháng 9/2026: 440.072.000đ toàn chuỗi → 96.171.000đ Hà Nội; revision 2 → 3. Truy vấn độc lập trên `orders.don_hang` + `identity.chi_nhanh` khớp 96.171.000đ / 849 đơn. Mọi query giữ Hà Nội và kỳ tháng 9.
- Điều chỉnh cấu hình không gọi AI: area → line giữ nguyên các hàng số liệu; lọc tiếp `MANG_DI` giữ Hà Nội, ra 29.325.000đ / 274 đơn, khớp truy vấn độc lập; provider calls = 0.
- Báo cáo thực vẫn là `partially_verified`: số liệu yêu cầu đã kiểm chứng nhưng chỉ có 3/4 góc nhìn hỗ trợ phù hợp. Không suy rộng một phép thử thành độ chính xác hoặc độ tin cậy toàn bộ AI.

**Hạ tầng đo trực tiếp**

- Airflow và Kafka UI thuộc profile `tools`, trước lượt kiểm tra chưa được bật. Đã bật và kiểm tra đăng nhập Airflow; DAG không có lỗi import.
- Run `demo_verify_20261021_0945`: cả `ingest_bronze`, `transform_silver`, `aggregate_gold`, `verify_pipeline` đều success. MinIO có cùng run `run_99660297140e7b41c063fbec4b23de77` ở Bronze/Silver/Gold: lần lượt 5/6/15 đầu ra. Bước verify đọc lại checksum các đầu ra Gold và khớp publication PostgreSQL; `optional_missing=[]`.
- Mở MinIO → bucket `avengers-bronze`, `avengers-silver`, `avengers-gold` → `runs/run_99660297140e7b41c063fbec4b23de77/manifest.json` để xem lineage và checksum. Bronze đo được 40.460 đơn và 72.063 dòng món; đây là snapshot quan sát, không phải time travel tại `requested_as_of`.
- Lịch Airflow hiện `0 2 * * *` theo UTC, tương ứng 09:00 Việt Nam. Lịch cũ hơn publication mới bị skip; đã thử lại đúng interval cũ và thấy Gold/verify skipped, publication mới giữ nguyên. Run demo manual trên vẫn thực thi đủ bốn bước, không dùng trạng thái skip làm bằng chứng cho batch chạy đủ.
- Kafka: đối chiếu byte hash broker ↔ Bronze và event_id ↔ projection PostgreSQL thành công. Có ba topic, chín partition. Lag thay đổi theo tải: từng về 0, lần chốt 10:21:45 Việt Nam còn 23.498 sự kiện. Đây không phải bằng chứng luồng tức thời/không có độ trễ. Consumer/producer đang xử lý thật, không reset offset để làm đẹp số đo.
- Sync mới nhất ở receipt: 49 bảng, 125.327 hàng, success (10:19:15 Việt Nam). Không coi số đếm này là chứng minh parity nội dung toàn bộ hệ thống nguồn. Batch manifest vẫn ghi `source_completeness=unknown`.
- **Chưa có Apache Spark thật:** service mang tên `spark-jobs` chạy Python/Pandas, không có PySpark/Java/SparkSession/cluster/UI. Không dùng receipt batch Pandas để báo cáo đã chạy Spark.
- Kafka là nhánh quan sát sự kiện → Bronze/projection; dashboard chính còn dùng nhánh đồng bộ warehouse. Không mô tả toàn hệ thống là Kafka → Spark → tất cả biểu đồ.

**Điểm truy cập đã kiểm tra**

| Thành phần | Điểm truy cập | Ghi chú |
|---|---|---|
| Data Platform | http://localhost:8501 | Đăng nhập `thaian_DataAnalyst` đã xác minh |
| API Docs | http://localhost:8502/docs | HTTP 200; API nghiệp vụ theo session/quyền Data Platform |
| Airflow | http://localhost:8083 | Đăng nhập `admin`; mở DAG `avengers_daily_pipeline` |
| Kafka UI | http://localhost:8082 | Không cấu hình đăng nhập local |
| MinIO Console | http://localhost:9001 | Tài khoản local `minioadmin` đã xác minh |
| MinIO S3 API | http://localhost:9000 | API đối tượng, không phải console |
| PostgreSQL Analytics | localhost:5434 | Database `analytics`, user `analytics`, xác minh qua TCP |
| Redis Analytics | localhost:6380 | `PING` → `PONG`, không cấu hình mật khẩu local |
| Kafka broker | localhost:9094 | Kafka protocol, không phải HTTP; ZooKeeper chỉ ở Docker network |

Mật khẩu demo đã gửi riêng trong hội thoại, không ghi thêm vào receipt.

**Minh chứng và tái kiểm tra**

- Receipt tổng hợp: [evaluation/demo-stack-20261021.json](evaluation/demo-stack-20261021.json). Chỉ giữ số liệu tổng hợp, dấu thời gian, checksum/lineage và kết quả kiểm thử; không lưu mật khẩu hay hàng dữ liệu định danh.
- Ảnh desktop/mobile danh mục, ô điều chỉnh và Airflow: thư mục [evaluation/demo-stack-20261021](evaluation/demo-stack-20261021).
- Kiểm thử: TypeScript pass; 22 node unit tests; 2 browser regression tests; 34 backend regression tests (`AI_OFFLINE=1`, gồm 3 ca giữ nguyên trường đã chấp nhận). Phép duyệt tổ hợp toàn catalog đã dừng, không được ghi là pass.
- Tái kiểm tra hạ tầng chỉ đọc, không gọi AI, không chèn dữ liệu giả:

```sh
python3 data-platform/tools/verify_demo_stack.py --output /tmp/dp-demo-stack-latest.json
```

Trước buổi demo nên chạy lại lệnh này vì tình trạng nguồn, backlog Kafka và thời điểm đồng bộ sẽ thay đổi. Công cụ không tự chạy một DAG mới hay reset offset.

<a id="input-integrity-plan"></a>
## C. PLAN khóa ý nghĩa đầu vào trên toàn bộ AI Analyst — 21/10/2026

**Trạng thái: IMPLEMENTING / INPUT_GATE_IMPLEMENTED / ACCEPTANCE_IN_PROGRESS.** Người dùng đã cho phép thực thi PLAN và kiểm thử. Baseline ở C.0 giữ nguyên từ lượt lập PLAN; tiến độ triển khai và giới hạn nghiệm thu nằm ở C.10. Không dùng điểm kiểm thử đầu vào để thay cho độ đúng số liệu, độ đầy đủ nguồn hoặc điểm diễn giải AI.

### C.0. Vấn đề đã xác minh và mục tiêu

Câu trong ảnh: `phân tích doanh thu tỉnh abcjdsakjd`. Nhận ra chỉ số doanh thu không đủ để chấp nhận toàn câu: người dùng đã nêu một tỉnh cần lọc nhưng chưa xác minh được tên. UI phải giữ cụm đó và yêu cầu xác nhận, không hiển thị “Toàn hệ thống (chưa nêu phạm vi)” rồi phân tích tập rộng hơn.

Baseline authenticated tại `/api/ai/preflight`, tài khoản DATA_ANALYST, branch `branch_thaian`, HEAD `790eae42`: [22 ca kiểm tra](evaluation/input-integrity-20261021/baseline-preflight.json). Có 19 `READY_FOR_AI`, 2 `BLOCKED`, 1 `NEEDS_INPUT`; cả 22 ca đều `provider_calls=0`, `warehouse_queries=0`. Trong 19 ca ready có **14 ca chứa ràng buộc chưa xác minh/tham số bất thường cần xử lý trước khi cho diễn giải**, 5 ca đối chứng hợp lệ. Đây là baseline preflight, **không chứng minh 14 câu đã chạy SQL hoặc model thực sự hiểu chúng**.

| Ca baseline | Hiện trạng quan sát | Hành vi cần có |
|---|---|---|
| S01: `doanh thu tỉnh abcjdsakjd` | READY_FOR_AI; không ràng buộc được tỉnh | Nêu đúng cụm chưa xác minh, yêu cầu chọn/kiểm tra tỉnh; chưa gọi model, không đổi thành toàn phạm vi |
| S02: Hà Nội + tỉnh không rõ; S03: miền Nam trừ tỉnh không rõ | Vẫn ready | Giữ cả vế hợp lệ và vế chưa rõ; không bỏ vế thêm/loại trừ rồi chạy một phần |
| S06/S07: tên chi nhánh/sản phẩm không rõ; S12/S13/S20/S22: phương thức/loại kiosk/trạng thái/hình thức giao không rõ | Vẫn ready | Kiểm tra đúng kiểu thực thể/enum; cache thiếu phải resolve có giới hạn, không tự kết luận tên không tồn tại |
| S09: `top -5`; S10: `tháng 13`; S17: `tại tỉnh` không có tên | Vẫn ready | Bắt dấu âm/ngày sai/slot thiếu; không bỏ token sai để dùng mặc định |
| S08: `doanh thu abcxyz`; S11: hai thời gian có dấu hiệu mâu thuẫn | Vẫn ready | Phân loại phần chưa hiểu và quan hệ giữa các vế; yêu cầu làm rõ nếu có thể đổi nghĩa, không dùng tỷ lệ nhận ra từ khóa để cho qua |
| S04/S05/S15/S16/S21: theo tỉnh, TP.HCM, câu khẩu ngữ, không nêu scope, union hai thành phố hợp lệ | Ready | Giữ khả năng hỏi tự nhiên; không chặn quá mức để làm xanh bộ negative |
| S14: lợi nhuận ròng; S18/S19: chỉ số/rác không có nghiệp vụ | Đã dừng | Giữ hồi quy; không tự đổi lợi nhuận thành doanh thu |

**Nguyên nhân đọc được trong code, không phải suy đoán model:**

- `services/preflight_service.py::run` nhận diện các anchor đã biết và tín hiệu nghiệp vụ; chưa có danh sách slot/cụm quan trọng còn chưa được giải quyết để quyết định toàn câu.
- `services/scope_resolution_service.py::resolve_scope` dùng vocab giá trị đã biết. `scope_expression_policy.geography_prefixes` hiện chỉ có `miền`; cụm `tỉnh abc…` không tạo binding và có thể rơi vào `unspecified`. Thêm riêng chữ `tỉnh` không khép được tên cửa hàng, sản phẩm, enum, ngày và các vế đa mục tiêu.
- `mapped_text` chuẩn hóa dấu câu; cần audit mọi nơi sử dụng chuỗi này vì dấu âm, dấu so sánh, ngoặc và dấu phân cách số không được mất ý nghĩa. Chưa kết luận đây là nguyên nhân duy nhất của S09/S10.
- `AnalystWorkspace.tsx` tính `blocked` khi `can_submit=false && !pending`; pending/error hiện có đường cho bấm. `preflightPresentation.mjs` chủ động ghi đây là kiểm tra advisory. Cần ràng buộc payload hiện tại ở submit, không dựa vào một nhãn UI đã kiểm tra trước đó.
- Backend đã có `canonical_filter`, metric locks, scope checks, read-only SQL và verification; giữ nguyên chúng. Guard preflight trong pipeline còn phụ thuộc nhánh/planning mode: phải audit, test parity mọi entrypoint, không khẳng định có thể bypass chỉ từ việc đọc một điều kiện.
- `refinementInput.mjs` mới kiểm hình thức/độ dài ở ô điều chỉnh. Một câu nhiều từ có tên tỉnh sai vẫn qua kiểm tra hình thức; đây không phải cổng ngữ nghĩa dùng chung cho đầu vào ban đầu và follow-up.

**Mục tiêu:** chỉ cho model xử lý phần diễn đạt thật sự còn mở; mọi ràng buộc người dùng đã nêu về thực thể, phạm vi, thời gian, phép tính, điều kiện, xếp hạng và dữ liệu phải được giữ, được xác minh hoặc được hỏi lại. Không bỏ ràng buộc để tạo một báo cáo có vẻ hợp lý. Không hứa bao phủ vô hạn câu tự nhiên: nghiệm thu bằng ma trận hữu hạn có mẫu số rõ, holdout và bằng chứng từng đường chạy.

### C.1. Ranh giới và bất biến

1. Dùng chung contract/validator trong engine hiện tại. Không tạo planner thứ hai, bộ luật riêng cho từng tab hay regex nhận đúng câu demo. Metadata khai báo vocab/kiểu dữ liệu/operator; code xử lý quy tắc tổng quát theo kiểu slot.
2. Tách `ABSENT` (người dùng không nêu, có thể dùng mặc định được công bố) khỏi `PRESENT_UNRESOLVED`, `INVALID`, `AMBIGUOUS`, `CONFLICT`, `FORBIDDEN`, `UNAVAILABLE`. Chỉ ABSENT mới có thể mặc định; cache thiếu không đồng nghĩa INVALID.
3. Phạm vi mặc định là **toàn bộ phạm vi được cấp quyền**, không phải toàn doanh nghiệp. User có đề cập phạm vi chưa rõ thì không hiển thị/chạy mặc định này.
4. Một vế unresolved quan trọng chặn việc gửi model/thực thi cả yêu cầu đó. Chỉ phân tích phần hợp lệ sau khi user chủ động chọn bỏ vế, xem lại phạm vi mới và gửi lại; không tự partial-success.
5. Preflight khi gõ: 0 model, 0 warehouse queries, không tác dụng phụ. Resolve thực thể ngoài cache chỉ ở thao tác rõ ràng hoặc submit, dùng reader được cấp quyền, parameterized, bounded, timeout/cancellation và không chạy analytical SQL.
6. Thiếu cache/index, timeout, 429/503, lỗi catalog hoặc revoked scope phải được báo đúng. Không đổi chúng thành “tên không tồn tại” hoặc cho qua để AI đoán.
7. Giữ nguyên metric/time/population locks, principal/owner, columns allowlist, read-only AST/transaction, cost limits, snapshot, revision/CAS và ledger provider. Input hợp lệ không tự động chứng minh nguồn đầy đủ hay kết quả chính xác.
8. Khóa ở thao tác gửi và API; **không khóa bàn phím** để user không sửa được. Không auto-submit khi chọn gợi ý, không gọi model lúc gõ, không đưa PII vào logs/corpus/provider.

### C.2. Hợp đồng hiểu đầu vào dùng chung

Mở rộng `semantic_preflight_contract.py`, `request_anchors.py` và các resolver hiện hữu bằng một báo cáo validation versioned; tên trường dưới đây là **đề xuất**, chưa phải API đã triển khai.

| Thành phần | Nội dung bắt buộc |
|---|---|
| Identity | fingerprint của câu hỏi gốc + guided slots + time/scope/depth/mission + context/report revision + catalog/policy/access versions; server quyết định owner, không tin owner do client gửi |
| Clauses | Mỗi mục tiêu/vế có ID và span trong chuỗi gốc, quan hệ AND/OR/compare/exclude/override, liên kết metric–entity–time–operator; không chỉ một túi từ khóa toàn câu |
| Slots | `kind`, raw span/text, canonical candidate IDs, kiểu giá trị, `ABSENT/BOUND/PRESENT_UNRESOLVED/…`, requiredness và lý do, vế áp dụng, bằng chứng lookup/alias/enum và phiên bản |
| Residuals | Phần chưa được ràng buộc, phân loại filler/formatting/unknown-entity/unknown-condition/unknown-goal. Filler được bỏ qua phải có quy tắc và không chứa dấu hiệu điều kiện quan trọng |
| Scope ledger | Scope văn bản, scope UI, scope quyền, scope kế thừa; quan hệ thu hẹp/mâu thuẫn; include/exclude/union/cohort, taxonomy địa giới và store type canonical |
| Decision | Giữ tương thích `READY_GUIDED/READY_FOR_AI/NEEDS_INPUT/BLOCKED`; bổ sung typed reason/slot/action, đánh dấu cần resolve trước phân tích. Không dùng READY_FOR_AI khi còn slot quan trọng unresolved |
| Fixes | Gợi ý có ID từ catalog được phép, chọn lại trường, sửa khoảng thời gian, tách câu hỏi hoặc chủ động bỏ vế. Mỗi action cho thấy thay đổi ý nghĩa; không tự sửa ngầm |
| Evidence | Bound/unbound clause IDs, validation origin, lookup status/cache age, provider/analytic/lookup counters, timings và fingerprints; log raw text phải redacted/bounded |

Luồng chuẩn:

```text
raw input + structured UI + authorized report context
  → chuẩn hóa có bản đồ span, giữ toán tử/số/ngày
  → tách các vế và khai báo slot theo metadata/ngữ cảnh
  → bind alias/enum/entity/time/operator trong phạm vi quyền
  → phát hiện slot quan trọng unresolved, phần dư đổi nghĩa, mâu thuẫn
  → NEEDS_INPUT/BLOCKED hoặc resolve có giới hạn khi cần
  → server kiểm tra lại payload hiện tại, kể cả cache hit/submit trực tiếp
  → READY_GUIDED (0 AI) hoặc READY_FOR_AI (chỉ ý định ngôn ngữ còn mở)
  → intent/delta của model phải khớp contract, không bỏ slot/vế
  → resolver + policy + SQL guard + execution + verification hiện hữu
```

Không biến contract thành SQL do client/model tùy ý đưa vào. Nếu dùng validation token để giảm tính lại, token phải do server phát, có hạn, gắn owner/access/catalog/context/payload; token là tối ưu, không thay revalidation khi quyền/catalog/phiên bản thay đổi. Không persist thêm schema chỉ để làm bước này khi chưa cần và chưa duyệt migration.

### C.3. Ma trận ngữ cảnh và trường hợp bắt buộc

Mỗi dòng cần cả ca hợp lệ và ca không hợp lệ, có/không dấu, ít nhất một biến thể đa vế và kiểm tra kết quả sau model nếu có. Ví dụ là hạt giống, **không phải chuỗi cần hardcode**.

| Family | Phạm vi tình huống | Kết quả cần bảo vệ |
|---|---|---|
| F01 Hình thức câu | Rỗng, whitespace, chỉ số/emoji, rác, lời chào; câu hợp lệ có `b ơi…:v` | Rác dừng; lời đệm không làm chặn câu có nghiệp vụ rõ |
| F02 Nhận ra một phần | Chỉ số đúng + đuôi lạ; vế đầu đúng/vế sau sai; từ chưa biết là tên hay điều kiện | Hiện phần còn chưa hiểu; không coi một metric match là toàn câu hợp lệ |
| F03 Địa lý có dấu hiệu rõ | `tỉnh/thành/TP./tại/ở/khu vực/miền` + tên đúng, sai, thiếu; địa danh mới/cũ | Unknown khác không nêu; phân loại theo taxonomy của dữ liệu, không tự suy mọi địa giới mới |
| F04 Thực thể nghiệp vụ | Tên/mã chi nhánh, món, topping, voucher, ca, tài xế, kiosk; trùng tên, tên có số/ký tự đặc biệt | Resolve canonical ID + parent; không dùng tên gần giống hoặc dữ liệu ngoài quyền thay thế |
| F05 Enum và nhóm giá trị | Trạng thái đơn/thanh toán/giao, kênh, store type, role, tier, sao đánh giá | Chỉ alias/mapping có quản trị; `SUCCESS`, `đã thanh toán`, `hoàn thành đơn` không tự đồng nhất |
| F06 Danh sách hỗn hợp | N giá trị, có một giá trị sai; danh sách phân trang/copy-paste, trùng alias cùng ID | Giữ toàn bộ ý định; dedup identity hợp lệ, không bỏ unknown để chạy phần còn lại |
| F07 Quan hệ tập hợp | A và B, A hoặc B, miền trừ tỉnh, ngoài nhóm, ngoặc, phủ định kép, tập rỗng | Typed union/intersection/exclusion; khác nhóm so sánh; không mất phủ định hoặc mở rộng scope |
| F08 Chiều nhóm và giá trị lọc | `theo tỉnh`, `từng chi nhánh` vs `tỉnh X`, `chi nhánh X`; `nhóm món` vs tên nhóm | Group-by không cần tên riêng; filter phải có giá trị; không chặn mọi chữ “tỉnh” |
| F09 Chỉ số gần nghĩa | Doanh thu chuẩn/món/chi nhánh/thanh toán; tổng đơn/đơn hợp lệ/khách; giá trị món/AOV | Giữ metric canonical đã khóa; không chữa dimension không tương thích bằng đổi chỉ số |
| F10 Chỉ số thiếu/chưa hỗ trợ | Câu không có đối tượng, chỉ tiêu chưa định nghĩa, revenue + profit/ROI, KPI tài chính thiếu cost | Hỏi rõ/đưa limitation đúng; không bỏ phần thiếu để báo “đã phân tích” |
| F11 Đa nghĩa theo ngữ cảnh | `đánh giá sản phẩm` vs `đánh giá doanh thu`, `tốt nhất`, `hiệu quả`, `ví`, `bán`/`bạn` | Dùng domain/capability + câu hỏi làm rõ; không ép mọi từ khóa vào một miền |
| F12 Thời gian không hợp lệ | Tháng 0/13, ngày 31/02, năm nhuận, start>end, thiếu năm cần thiết, date format mơ hồ | Giữ literal thời gian và báo lỗi; không mất vế sai rồi dùng all-time |
| F13 Nhiều khoảng thời gian | Hai kỳ so sánh, nhiều metric khác kỳ, “nhưng chỉ…” mâu thuẫn, “đổi lại…” rõ ràng | Bind thời gian theo vế; sửa đính chính chỉ khi rõ, không dùng last-write-wins cho mọi câu |
| F14 Thời gian tương đối/nguồn trễ | Hôm nay/tháng này/tháng trước theo Asia/Ho_Chi_Minh; kỳ chưa đủ; ngoài dữ liệu; tương lai | Reference date được đóng dấu; actual tương lai khác forecast; phân biệt cảnh báo coverage và ngày sai |
| F15 Số, dấu, đơn vị | Top -5/0/1,5/rất lớn; `1,5 triệu`, `%`, tiền âm, đơn vị ngày/phút; NaN/Inf | Parse trước khi bỏ dấu câu; N nguyên dương theo policy, số âm/tỷ lệ theo loại metric (growth có thể >100%); không clamp ngầm |
| F16 Xếp hạng/so sánh | Thiếu metric xếp hạng, Top N mỗi tỉnh vs toàn chuỗi, bottom, ties, baseline rỗng | Đúng cohort/partition/tie/denominator; yêu cầu bổ sung tiêu chí nếu còn mơ hồ |
| F17 Điều kiện và toán tử | `lớn hơn/ít nhất/không có/chưa từng/tất cả/chỉ`, thiếu vế, comparator/unit không tương thích | Giữ toán tử và đối tượng áp dụng; không hạ điều kiện “chưa từng mua” thành không có đơn trong kỳ |
| F18 Rate/average/đóng góp | Tỷ lệ hủy, AOV, growth, share, weighted rating, mẫu số 0/null | Xác minh population và base; không cộng/avg các ratio hay tự chuyển giữa điểm % và % |
| F19 Liên miền | Đơn + review + payment + workforce + franchise, entity chung/mâu thuẫn grain | Validate từng vế/join/mốc thời gian; không fanout, không ép cùng filter không tương thích |
| F20 Kiosk/nhượng quyền | Kiosk chính/vệ tinh/nhượng quyền, owner, parent branch, mã kiosk và mã cơ sở | Lookup và scope theo canonical type/key; không đoán từ chữ trong tên hoặc gộp hai quy trình combo |
| F21 Bài toán map | Theo tỉnh, zoom cửa hàng, điểm có/không GPS, filter viewport/radius, yêu cầu gần tôi | Viewport không tự đổi số liệu; spatial filter chỉ khi capability có; thiếu tọa độ không mất doanh thu; không bịa vị trí |
| F22 Forecast | Metric/cadence/horizon/time-history, scope/group hỗ trợ hoặc chưa hỗ trợ, history thiếu | Theo capabilities hiện hành, đủ kỳ và budget; không coi số tương lai là dữ liệu quan sát |
| F23 Rủi ro/cảnh báo | Threshold có/không đơn vị, scan với nhóm điều kiện, “đang lỗ”, cáo buộc gian lận | Predicate cần nguồn/định nghĩa; không biến unsupported thành cảnh báo có số liệu |
| F24 Snapshot vs lịch sử | Availability, tồn retail, số dư ví, tier, rating profile; so với sự kiện lịch sử | Không dựng quá khứ từ trạng thái hiện tại; áp dụng semantics ở mục 3 của PLAN |
| F25 Quyền và actor | ADMIN/DATA_ANALYST; role chưa được cấp; chi nhánh/owner khác; dữ liệu định danh | Server enforce phạm vi cấp quyền và không lộ sự tồn tại của entity ngoài quyền; không mở quyền role mới trong phase này |
| F26 Tồn tại vs dữ liệu rỗng | Entity hợp lệ nhưng 0 đơn; unknown name; cache chưa có; nguồn vắng/chặn/trễ | Bốn trạng thái khác nhau; không sửa tên hợp lệ chỉ vì revenue=0, không gọi missing source là 0 |
| F27 Structured input vs câu chữ | Guided slots khác text, dropdown tỉnh A/text B, time UI vs lời hỏi, default/explicit | Báo xung đột quan trọng và cho chọn nguồn ý nghĩa; UI rõ ràng có thể thu hẹp theo policy nhưng không tự mở scope |
| F28 Follow-up | `ở đó`, `giữ kỳ cũ`, đổi tỉnh/time/chart, bỏ filter, yêu cầu rác; đổi tab/session/revision | Delta theo report được cấp quyền; context thiếu phải hỏi; sửa sai giữ draft và báo cáo cũ, không publish revision |
| F29 Preset/saved/reopen/export | Preset có filter cố định, saved cũ, câu sửa, refresh sau đổi schema/quyền, URL/deep link | Trusted preset và artifact display có đường rõ; rerun/refresh phải validate lại; export chỉ đúng server-owned revision |
| F30 Race/cache/idempotency | Gõ A→B, response A đến trễ, đổi dropdown lúc submit, double click, stale token, multi-tab | Payload và kết quả cùng fingerprint; một request không dùng scope/approval của request khác |
| F31 Bypass/payload giả | POST thẳng, đổi enum/ID/operator/type, thêm SQL/code/prompt injection; chỉ dẫn trong dữ liệu review | Không tin client/model/data là policy; contract + AST/allowlist giữ nguyên; không phát hiện bằng blacklist từ đơn lẻ |
| F32 Chuỗi quốc tế/IME | Có/không dấu, NFC/NFD, casing, tiếng Anh theo alias, emoji, homograph, dấu âm Unicode | Chuẩn hóa có trace và không đổi nghĩa; gõ tiếng Việt không bị cắt/lag; không tự hợp nhất hai ID khác nhau |
| F33 Nhiều mục tiêu/năng lực | N yêu cầu, một mục thiếu nguồn, yêu cầu tương quan/nhân quả, yêu cầu vượt số goal/charts | Mỗi mục có trạng thái; vượt budget thì đề nghị tách/thu hẹp có xác nhận, không âm thầm rút số mục |
| F34 Lỗi kiểm tra | Debounce pending, timeout/abort, mạng mất, 429/503, catalog/value index cũ, permission revoked | Không hiện ready giả; retry rõ; có thể gọi server kiểm tra lại nhưng chưa gọi model trước khi vượt gate |
| F35 Quy mô dữ liệu lớn | Tên entity hàng nghìn/hàng triệu, tìm kiếm có phân trang, Top N/cross-product quá lớn | Không nạp toàn bộ fact/entity vào prompt hoặc browser; cost estimate + lookup bounded; không dùng first page làm toàn universe |
| F36 Ý định và chất lượng kết quả | Nhận ra metric vs bind toàn scope vs query chạy vs số khớp oracle | Các mức kiểm chứng riêng; nhãn “đã hiểu”/điểm chất lượng không được biến thành xác suất đúng |

### C.4. Áp dụng ma trận cho toàn bộ nghiệp vụ hiện có

Không dừng ở geography. Tạo manifest coverage sinh từ feature registry/capabilities theo role để liên kết **mọi B01–B34**, active domain/metric/dimension và input families. Mỗi mục có applicable / unsupported / policy-restricted / not-captured cùng evidence; không ép nguồn chưa có thành feature đã chạy. Các số metric/domain phải đọc từ revision catalog hiện tại, không đóng đinh số audit cũ.

| Nhóm nghiệp vụ gốc | Slot/điều kiện bắt buộc kiểm |
|---|---|
| B01, B02, B03, B12, B15, B31 | Đơn/kênh/món/biến thể/topping/khả dụng/giỏ/bàn/guest: entity + grain + state; cart khác order, availability khác tồn kho; missing guest context khác customer ID |
| B04, B05, B06 | Review sản phẩm/chi nhánh/survey: đối tượng, criteria/question/version, sao và population hiển thị; không dùng “đánh giá” làm metric doanh thu |
| B07, B08 | Customer/loyalty/wheel: cohort, points/tier hiện tại, event history có/không; không đoán spins từ voucher |
| B09, B10, B11, B14 | Wallet khách/gift/voucher/payment/refund: phân biệt owner ledger, namespace mã, attempts/settled/refund, topup≠revenue; không expose code/contact |
| B13, B22 | Địa chỉ/mạng lưới: city/store/location type và quyền truy cập; tọa độ chi nhánh được phép khác địa chỉ/GPS cá nhân |
| B16, B17 | Workforce/chốt ca: employee/shift/approval/status, expected vs declared cash; yêu cầu payroll/nguyên nhân lệch cần đúng nguồn |
| B18, B19, B32 | Delivery/shipper/COD/rating: identity assignment, trạng thái/time/duration, wallet context; score snapshot khác rating event; xử lý khóa không đối soát được |
| B20, B21 | Chat/CSKH/news/support: conversation/message/article khác session/order; response/engagement cần timestamp/event thật; văn bản nhúng không là instruction |
| B23, B24, B25, B26, B27, B28 | Franchise onboarding/combo/debt/royalty/reconcile/POS/shift/wallet owner: kiosk type/key, contract/stage, kỳ tháng, rate/base, amount/status và context ví; financial terms thiếu định nghĩa phải hỏi |
| B29 | Account/config/notification: quyền admin và capability analytics; không biến yêu cầu secret/config mutation thành phân tích |
| B30 | Nguồn auxiliary: provenance phải xác minh; giá trị có trong bảng không tự chứng minh đây là KPI hợp lệ |
| B33 | AI commerce/model/forecast: actual/prediction/evaluation/causal uplift, model/source version; không dùng “có AI” để bỏ input gate |
| B34 | Callback/outbox/Kafka/sync: attempt/queued/completed/canonical event; technical metrics riêng; idempotency và failed source không bị bỏ khỏi câu |

### C.5. Gắn gate vào mọi luồng, không chỉ textarea đầu tiên

| Surface | Kiểm tra cần triển khai/giữ |
|---|---|
| Gõ câu mới, dán câu, câu mẫu, chọn trong danh mục | Cùng contract; gợi ý chỉ điền; đổi chữ/slot làm validation cũ hết hiệu lực; không báo “toàn phạm vi” khi có slot scope unresolved |
| Guided builder và manual scope/time/depth | Validate ID/type/operator/compatibility, đối chiếu text hiện tại; depth chỉ thay mức hỗ trợ, không tự đổi metric/scope |
| Phân tích, Xem kế hoạch, Enter, Risk watch | Một submit gate; Enter không đi tắt, pending/error không dùng decision cũ; risk vẫn 0 provider |
| `/preflight`, `/propose-plan`, `/analysis-jobs`, generate/approval | Server kiểm payload trước enqueue/cache hit/provider reservation, và recheck trước execute; client chỉnh `can_submit` không có tác dụng |
| Natural refinement và visual changes | Delta nối đúng session/revision; unbound entity/date/operator chặn; visual-only chỉ dùng enum và chart compatible, giữ query meaning, 0 AI |
| Filter/drill/refresh + map click/search | Typed server selections, không giả ID/cross-owner; scope được kiểm trên toàn query set; map tương tác camera không tự thay semantic scope |
| Stored module/preset/saved rerun | Policy/access/catalog changes invalidation; không replay `guided_intent` cũ để phủ feedback mới; preset immutable không bị UI sửa bỏ filter bắt buộc |
| Save/reopen/export/preview | Artifact cũ hiển thị với provenance rõ; export theo revision server hợp lệ; refresh phải qua gate mới; không xuất draft hoặc kết quả stale như kết quả đã cập nhật |

### C.6. UX cụ thể cho câu trong ảnh và sửa lỗi

- Dưới textarea hiển thị các chip: **Chỉ số: Doanh thu ✓**; **Tỉnh/thành: “abcjdsakjd” — chưa xác minh**; kỳ thời gian/mức phân tích theo đúng lựa chọn. Chip không chỉ có màu, phải có chữ trạng thái.
- Dòng giải thích: “Chưa xác minh được tỉnh/thành ‘abcjdsakjd’. Chọn lại địa bàn hoặc sửa tên trước khi phân tích.” Gắn lỗi vào span hoặc trường tương ứng, giữ nguyên câu đang nhập.
- Có tìm địa bàn/cửa hàng được phép, hiển thị tên + loại + địa bàn/mã phân biệt; không lấy tỉnh gần giống làm bộ lọc nếu user chưa chọn. Nút “Phân tích toàn phạm vi được phép” chỉ là action chủ động: phải bỏ rõ vế tỉnh khỏi draft và hiển thị phạm vi thay thế rồi mới gửi.
- Với danh sách có một tên sai: giữ chip đã xác minh và chip lỗi; cho sửa từng chip. Không âm thầm bỏ tên sai hay áp bộ lọc riêng phần đúng.
- Khi pending, nhãn “Đang kiểm tra câu hỏi hiện tại”; chỉ chặn hành động phân tích cần quyết định, vẫn nhập/xóa/IME được. Không hiển thị validation của câu A trên câu B. Khi preflight mất kết nối, nút kiểm tra lại/server-validation có thông báo rõ, không tự trở thành lệnh gọi AI.
- Với tên không có trong cache: “Cần kiểm tra tên trong phạm vi dữ liệu được phép”, action resolve nội bộ có giới hạn. Kết quả không tìm được chỉ nói trong scope được cấp quyền, không tiết lộ dữ liệu ngoài quyền.
- Follow-up đang có báo cáo: hiển thị scope/kỳ trước→sau dự kiến. Lỗi validation không xóa draft, không publish version mới, báo cáo cũ ghi rõ vẫn đang hiển thị. Không cho lỗi input biến thành thông báo chung “hệ thống không diễn giải được”.
- Trợ giúp và ví dụ phụ thuộc capability/miền/slot đang thiếu; tối đa một nhóm câu hỏi làm rõ có cấu trúc mỗi lượt, không bắt user điền mọi trường không liên quan.

### C.7. Triển khai tuần tự và đầu ra từng phase

| Phase | Công việc cụ thể / owner hiện hữu | Bằng chứng bắt buộc để qua phase |
|---|---|---|
| IP0 — audit/baseline | Freeze input surfaces, call graph, runtime planning modes, role/capability snapshot, dirty-tree diff; thêm corpus baseline và inventory slot/metadata | Baseline 22 ca đã có; còn phải audit parity backend và inventory. Không ghi IP0 hoàn tất mọi hạng mục từ receipt preflight |
| IP1 — contract/ledger | `semantic_preflight_contract.py`, `request_anchors.py`, metadata value/entity/slot policy: clause/span/slot states, reason codes, compatibility/version/fingerprint | Contract/schema tests; unknown khác ABSENT; giữ dấu âm/phủ định/date literal; không cần DB migration |
| IP2 — resolution theo kiểu | Mở rộng `scope_resolution_service.py`, `value_grounding_service.py`, time/mission/number validation hiện hữu; cache-aware bounded authorized lookup; phần dư và multi-clause | Negative/positive cho F01–F24/F32/F35; invalid month/Top N/unknown entity không rơi về mặc định; lookup fail đúng trạng thái |
| IP3 — server authority | `agent_pipeline.py`, `analysis_job_service.py`, `routers/ai.py`, workspace/module/report entrypoints, request identity/approval/cache | ASGI/direct POST parity mọi mode; blocked input có 0 physical provider sends và 0 analytical queries; giữ privacy/SQL/cost/CAS/owner guards |
| IP4 — UI thống nhất | `AnalystWorkspace.tsx`, `AnalysisInputForm.tsx`, `QuestionPreflight.tsx`, `AnalysisScopePanel.tsx`, `preflightPresentation.mjs`, composer/map/guided controls | Gõ/paste/Enter/click/mobile/IME, stale response/pending/error; sửa từng slot, không auto-submit và không lag nhập |
| IP5 — coverage nghiệp vụ | Manifest nối toàn B01–B34 với active catalog/role, dữ liệu có/không, preset/follow-up; parser không chứa câu demo | Không orphan feature/slot/surface; ghi rõ source/policy limitation; positive controls không bị chặn do chỉ siết negative |
| IP6 — nghiệm thu nhiều lớp | Unit + fixture oracle + ASGI + browser production + metamorphic + holdout độc lập, đúng các gate dưới đây | Receipt riêng baseline/final; blocker/false-positive/provider/sql counters theo request; không lấy model scripted làm live score |
| IP7 — rollout/tài liệu | Version gate tương thích, cache invalidation, logs/counters, deployed bundle, rollback code có review và demo checklist | Chạy UI thật port 8501 với payload backend khớp; compile/build/tests; triển khai bật enforcement chỉ khi các server đã dùng cùng policy; giữ trace lỗi còn lại |

Giữa phase chạy targeted tests; không lặp phép duyệt toàn bộ tổ hợp catalog sau mỗi edit. Full suite runner chuẩn một lần cuối, báo baseline failures riêng. Không reset/restore/clean/stash/commit/push; giữ changes Claude/người dùng. Migration/grant nếu phát sinh: chuẩn bị diff/impact/rollback riêng theo repo rules trước khi xin duyệt, tiếp tục phần không phụ thuộc. Kế hoạch này không tự cho phép thay schema hay mở quyền.

### C.8. Corpus, oracle và gate nghiệm thu

**Corpus trước khi sửa product:** mục tiêu tối thiểu 240 ca thủ công có ID/expected decision/reason/slot/context/surface, phủ mọi F01–F36 và toàn nhóm Bxx applicable. Holdout ít nhất 60 ca độc lập về ngữ cảnh/cấu trúc, không chỉ đổi tên tỉnh trong cùng template; người triển khai không dùng holdout để thêm regex theo câu. 22 ca baseline giữ nguyên ID, thêm các paraphrase/typo/unknown enum/date/sign/boolean và positive counterexamples.

Sinh thêm ca từ metadata trên **từng dimension/value type, enum, metric capability và scope expression**: alias đúng, unknown cùng kiểu, thiếu giá trị, hỗn hợp known+unknown, scope ngoài quyền, cache stale/partial, kiểu/operator sai, nguồn thiếu và tên hợp lệ nhưng 0 dữ liệu. Dùng fixture với entity/tên sinh ngẫu nhiên có seed, không hardcode tập dữ liệu production. Pairwise contexts UI×entrypoint×role×cache×time×mission, kèm các tổ hợp nguy hiểm 3 chiều đã chỉ rõ; không gọi pairwise là đã duyệt mọi tổ hợp vô hạn.

Metamorphic tối thiểu: thêm một entity lạ vào union phải làm mất trạng thái ready; thêm vế loại trừ lạ không được giữ nguyên kết quả; đổi tên hợp lệ sang tên lạ không ra cùng fingerprint; đổi metric canonical không làm mất dấu phủ định; `theo tỉnh` khác `tại tỉnh`; thêm filler không đổi bound intent; accent/Unicode tương đương không đổi canonical ID; thay revision/access/catalog phải làm approval cũ hết hiệu lực. Câu hợp lệ có số âm/growth>100% được giữ theo kiểu metric.

| Gate | Điều kiện đạt |
|---|---|
| IG1 Không bỏ ý nghĩa | 100% case critical trong corpus có đầy đủ clause/slot ledger, không `PRESENT_UNRESOLVED/INVALID/CONFLICT/FORBIDDEN` bị coi ABSENT/ready |
| IG2 Chặn trước chi phí | 100% invalid/known-unknown hard cases có 0 physical provider sends, 0 analytical SQL; preflight mọi ca 0 model/0 warehouse lookup. Entity resolution lúc submit được đếm riêng và bounded |
| IG3 Không bóp câu hợp lệ | Toàn positive control cứng pass; false block trên tập valid đã phân loại ≤2%; câu thật sự thiếu nghĩa hỏi đúng slot, không tính nó là model success |
| IG4 Không đi tắt | UI, Enter, guided, trực tiếp API, các production mode, job cache hit, follow-up, module rerun và refresh cho cùng decision/ràng buộc. Scope/quyền/token stale/giả bị từ chối trước thực thi |
| IG5 Kết quả không bị đổi phạm vi | Với input hợp lệ, mọi query/KPI/map/denominator/supporting view đúng bound scope/time; oracle fixture độc lập khớp. Invalid refinement giữ nguyên report/revision, không có report “toàn hệ thống” thay cho tên tỉnh lỗi |
| IG6 UX và tải | Không tràn desktop/mobile, IME và paste ổn; p95 typing interaction mục tiêu ≤200ms theo kịch bản/hardware cố định; warm preflight giữ SLO hiện hữu (không nới threshold để pass), đo cold/warm/cache/load riêng; không truy vấn DB hoặc rerender toàn dashboard mỗi phím |
| IG7 Holdout và bằng chứng | Các invariant critical không có lọt ở holdout; đúng decision + đúng slot/reason ≥95% holdout. Chưa đạt thì chưa READY. Tách input-gate score khỏi AI interpretation/numeric accuracy và business G8 |
| IG8 Triển khai | Tests phù hợp pass, receipts có code/catalog/policy/access fingerprints và phiên bản corpus, production bundle được kiểm, scenario demo mới qua được cả UI và API. Không đánh dấu DONE bằng unit test của riêng câu trong ảnh |

Gate đo theo case ID, không tăng điểm nhờ lặp paraphrase hoặc loại ca trượt khỏi denominator. Các case cần privacy masking vẫn phải giữ expected classification; không lưu PII, raw source credentials hay provider secret trong receipt. Nếu đổi rule sau đo live, receipt cũ không đại diện code mới.

**Live AI:** lượt lập PLAN này không dùng AI. Khi triển khai, input sai/unknown rõ không cần paid call để chứng minh chặn; dùng spy/ledger boundary. Chỉ test live tập câu hợp lệ cần diễn giải sau offline gates, trong campaign/budget/approval còn hiệu lực của PLAN, không reset ledger hay tự cộng lượt mới. Bất kỳ budget đề xuất nào phải nằm trong trần đã duyệt; không chạy lại cả corpus live chỉ vì UI đổi chữ.

### C.9. Handoff và checklist demo sau khi triển khai

Ưu tiên IP1→IP3 để khép lỗ hổng theo slot và server authority, rồi IP4→IP7; không dừng sau một regex geography. Bắt đầu từ baseline trong C.0; lưu checkpoint nhỏ gồm phase, exact file/symbol, rule/contract diff, tests/case IDs, provider/SQL/lookup counters, blocker và bước kế tiếp trong cùng file này.

Kịch bản demo tối thiểu:

1. Nhập câu gốc với tỉnh lạ: chỉ số có thể nhận ra nhưng tỉnh hiện chưa xác minh; Phân tích/Xem kế hoạch/Enter không gọi model hay tạo báo cáo. Gọi thẳng API cùng payload cũng dừng.
2. Sửa sang tên tỉnh hợp lệ bằng lựa chọn rõ ràng: hiển thị đúng scope; gửi và đối chiếu số liệu theo đúng tỉnh, không phải toàn chuỗi.
3. Thử union một tỉnh đúng + một tỉnh sai, trừ tỉnh sai, tên cửa hàng trùng, enum sai, tháng 13, Top -5; đối chiếu reason/slot và counters.
4. Thử `doanh thu theo tỉnh`, câu khẩu ngữ có dấu/không dấu, tỉnh hợp lệ nhưng không có đơn: không chặn nhầm hay bịa lỗi entity.
5. Giả lập preflight timeout/response đảo thứ tự, đổi scope lúc đang chờ, chỉnh guided text, stale revision/quyền: không dùng validation hoặc report cũ cho payload mới.
6. Điều chỉnh một report hợp lệ bằng địa danh lạ: draft được giữ, report/revision cũ còn nguyên; sửa đúng rồi mới có bản mới. Save/export không xuất scope chưa được áp dụng.
7. Nhắc lại một nhóm review, payment/refund, kiosk/franchise và forecast để chứng minh validator theo schema/context chứ không vá mỗi câu revenue/province.

**Checkpoint của lượt chỉ lập PLAN (trước ủy quyền thực thi):** PLAN và baseline đã sẵn sàng; IP1–IP7 chưa triển khai ở thời điểm đó. Tiến độ mới xem C.10; chỉ đánh dấu gate đạt khi có receipt tương ứng.


### C.10. Checkpoint triển khai — 21/10/2026

**Đang nghiệm thu; chưa gắn nhãn toàn bộ IG1–IG8 PASS.** Thay đổi được triển khai trong các module hiện hữu, policy từ vựng/kiểu ở `analytics-api/metadata/input_integrity_policy.json`; không đổi schema/grant và không tạo planner thứ hai.

- `services/input_integrity_service.py`: slot có span gốc, trạng thái riêng unknown/invalid/ambiguous/unavailable/forbidden, clause IDs, fingerprint theo text/context/catalog/access/policy. Head và enum lấy từ catalog; phân biệt grouping với tên cần lọc, union có tên sai, thời gian/Top N/dấu âm và điều kiện số. Giữ cách viết có dấu để không nhầm “tình” thành “tỉnh”, “tài xế/tài khoản” thành “tại …”.
- Tra cứu tên ngoài index chỉ qua thao tác rõ ràng hoặc submit; cache tối đa 1.024 mục, TTL 120 giây, gắn owner/access/scope/catalog/policy, tối đa 4 slot tra cứu/lượt và 8 kết quả/lần, SQL reader tham số hóa, read-only và timeout hiện hữu. Không suy tên gần giống thành binding. Loại trừ high-cardinality chưa có toàn universe phải hỏi lại, không tự tạo `NOT IN` trái contract hoặc dùng trang đầu làm universe.
- `preflight_service.py`, `agent_pipeline.py`, `analysis_job_service.py`: shared gate trước provider/enqueue/cache/execution, mọi mode production; follow-up kiểm riêng delta cùng revision, lỗi giữ bản cũ. Signature approval/cache có policy input. Typed workspace revision giữ các kiểm owner/CAS/scope/cost/SQL hiện hữu và kiểm lại câu cũ khi input policy thay đổi.
- HTTP: `/api/ai/resolve-input` (thao tác chủ động), `/api/ai/refinement-preflight` (không chạy AI), route permissions khai báo tường minh. Không tin `can_submit` hoặc kết quả resolve do client tự gửi.
- UI: decision phải khớp đúng payload hiện tại (câu, guided, thời gian, scope, depth, mission). Pending/error/missing/stale không cho Phân tích/Xem kế hoạch/Enter; vẫn gõ và sửa bình thường. Cancel làm response cũ hết hiệu lực. Composer giữ draft tại component, debounce kiểm tra riêng, không rerender toàn dashboard từng phím; có retry/resolve nội bộ. IME Enter không gửi. Sửa span kiểm lại old-text và xử lý đúng Unicode code point/UTF-16 khi có emoji.

**Bằng chứng đang thu thập tại** `evaluation/input-integrity-20261021/`:

| Lớp | Kết quả checkpoint / phạm vi chứng minh |
|---|---|
| Baseline 22 ca | File baseline không sửa; kiểm thử mới giữ nguyên ID/kỳ vọng 5 positive + 17 cần dừng. Không dùng câu lỗi đơn lẻ làm toàn bộ corpus. |
| Corpus mới | `tests/fixtures/input_integrity/corpus.json`: 240 tình huống tường minh, 12 nhóm; kiểm input gate, không tự chứng minh capability/SQL/số liệu. |
| Bộ tách riêng | `holdout.json`: 60 ca sau freeze nguồn; lần đầu 59/60 (1 false block trạng thái đơn); giữ nguyên receipt `holdout-first-pass.json`, không xóa ca lỗi. Sau sửa ưu tiên tên trường gốc, các lượt chạy lại là regression, không gọi là holdout chưa từng thấy nữa. |
| Dimension inventory | Kiểm từng dimension categorical đang active: grouping hợp lệ, unknown cùng kiểu phải dừng; thiếu cache tách khỏi không tồn tại. |
| B01–B34 | Duyệt thêm 282 câu của corpus nghiệp vụ đã có. Câu `Voucher vòng quay đã dùng…` vẫn cần xác minh qualifier/source; không coi voucher redemption tự chứng minh lịch sử lượt quay hoặc ngầm bỏ “vòng quay”. Các ca chưa định nghĩa/thiếu nguồn tiếp tục theo capability/data-health gate. |
| Backend/HTTP | Các test mới cấm HTTP/provider, PostgreSQL và analytical executor; thử POST trực tiếp, trước enqueue/cache, stale revision, owner khác, lookup bounded và cách ly quyền. Bộ targeted + hồi quy đã có chạy 67 tests pass ở checkpoint trước; cần receipt cuối khớp SHA. |
| Browser | 15/15 luồng workspace/composer/pending/stale/network/IME đã pass với API fixture trên Chrome. Đây là browser regression, chưa thay cho walkthrough production port 8501. |
| Web unit | 222/222 logic tests pass, gồm Unicode-span bổ sung; typecheck/build pass. Container đã triển khai; bundle trên 8501 được đối chiếu SHA và các chuỗi chức năng mới. |
| Full backend | Đã chạy runner chuẩn, đang phân loại lỗi. Fixture Graph V2.2–V2.7 dùng opaque wording để thử transport/algebra cần adapter riêng trong `tests/archive_planner.py`; không thêm cờ/request field tắt guard production. Test production kiểm cả legacy/one-shot vẫn từ chối input sai. |
| Hiệu năng | Cổng wall p95 50ms hiện có từng trượt trên Docker (CPU thấp hơn nhiều); phép so sánh tắt riêng guard cũng trượt. Chưa kết luận IG6 PASS và không nới ngưỡng. Cần lưu phép đo cuối/đối chứng riêng, không đổi lỗi môi trường thành thành tích. |

**Giới hạn phải giữ khi demo:** đây là validation hữu hạn có corpus/receipt, không phải lời hứa hiểu mọi câu tự nhiên. Guard cho đi tiếp không tự chứng minh intent model không đổi nghĩa, số liệu khớp oracle hay nguồn đầy đủ; các lớp lock/resolver/SQL/data-health/verification hiện hữu vẫn là bắt buộc. Chưa chạy thêm model thật trong lượt triển khai này. Chỉ đánh dấu rollout hoàn tất sau khi build `web-ui --no-deps`, reload API khi không còn test container, xác minh bundle và thử input thật trên 8501.

#### C.10.1. Nghiệm thu policy 1.2.0 — tiếp tục hoàn tất

- Tách tên/điều kiện khỏi ranh giới câu, ngoặc và chỉ dẫn phân tích: không coi “Nêu rõ trạng thái đơn dùng để tính…” là tên trạng thái; không cắt “kiosk vệ tinh” thành “kiosk vệ”; giữ các câu nhiều mệnh đề về sản phẩm, thanh toán, voucher, ca làm. Bổ sung positive và negative hồi quy cho nhóm này, không đổi câu/ID baseline.
- Điều kiện số phân biệt lọc giá trị từng dòng với ngưỡng trên tổng theo nhóm: contract hiện chưa có HAVING nên hỏi rõ trước khi chạy, không đổi `doanh thu > X` thành `giá trị đơn > X`. Giữ nguyên các file oracle v1 và receipt đầu tiên; 7 ca corpus + HV15 được phân loại lại theo khả năng contract, không xóa hay thay câu để tăng điểm. 60 ca sau lần đầu đã trở thành regression set, không còn được gọi là holdout chưa từng thấy.
- Lookup ưu tiên exact trong trang tối đa 8 kết quả; SQL tham số hóa, READ ONLY, timeout hiện hữu. Ngân sách 24 physical lookup/phút/owner dùng chung cả direct submit và resolve, ngoài giới hạn tối đa 4 slot/lượt và 6 thao tác resolve/phút. Tài khoản không có quyền national phải dùng mã cửa hàng được cấp; chưa cho tra cứu tên toàn kho.
- `offline-final-v12.json`: baseline **22/22**, corpus **240/240** (113 positive, 127 cần dừng), regression set **60/60** (29 positive, 31 cần dừng). Spy trên HTTP/PostgreSQL: **0 physical provider sends, 0 warehouse connections**. Đây là điểm input gate, không phải điểm chính xác AI/số liệu. Duyệt 282 câu B01–B34/X còn 2 câu cần làm rõ: `BC-B08-004` qualifier voucher vòng quay chưa có binding đủ bằng chứng, `BC-B33-003` horizon “tháng sau” chưa có alias contract. Không coi hai ca này là hiểu thành công.
- `runtime-final-v12.json`: đăng nhập DATA_ANALYST trên **http://127.0.0.1:8501**, đủ **22/22** quyết định giống oracle. Câu tỉnh sai gửi trực tiếp `/propose-plan` trả `needs_clarification`, provider count 0; `/analysis-jobs` trả HTTP 400 trước tạo job. Tên cửa hàng thật xác minh bằng **1 metadata lookup**; preflight lặp cùng tên dùng cache, **0 lookup / 0 AI / 0 analytical SQL**. Không gửi câu hợp lệ sang model hoặc tạo analytical job trong lượt này.
- Bundle phục vụ thật: `/assets/index-DuBdhXOv.js`, SHA256 `802a95e2c57d6ae8cc59faabed9a7379adca7b4069633f51d33f5ff6cf62ed63`; có các chuỗi pending, nhận diện, resolve và refinement-preflight. API reload sau kiểm tra read-only **0 active live jobs**; full tests tách container offline, không reset dữ liệu/Redis/volume.
- Native Chrome đã quan sát câu gốc: hiện chip tỉnh `PRESENT_UNRESOLVED`, phạm vi chưa xác minh và cả hai nút Phân tích/Xem kế hoạch disabled. Các luồng sửa câu, response đảo thứ tự, IME, lỗi mạng và refinement được kiểm thêm trong **15/15 browser fixture tests**; không gọi fixture là production/model qualification.

**Full runner:** receipt từ snapshot policy 1.1.0 giữ nguyên (`full-backend-frozen-v11.log`, 1.611 tests, 32 failures/87 errors) là lượt tìm lỗi, không phải PASS. Nhiều lỗi mới là false block ranh giới câu đã sửa ở policy 1.2.0. Lượt final snapshot bất biến v1.2.0 dùng runner chuẩn, network none, memory stores, 2 CPU/2 GiB; có thêm mount read-only pipeline-common và evaluation tạm writable để tránh lỗi setup lượt trước. Kết quả cuối cùng ghi tại mục tiếp theo khi process kết thúc. Một sửa ưu tiên trạng thái `BLOCKED` có sẵn được kiểm targeted sau snapshot; không giả receipt snapshot khớp mọi source cuối.

**Không thay đổi trong lượt này:** schema/grant/dữ liệu nguồn, cấu hình Spark/Kafka/Airflow/MinIO, allocation dịch vụ và hạ tầng K8S. Không commit/push. Báo cáo đầy đủ cùng lệnh tái hiện ở `evaluation/input-integrity-20261021/README.md`.

#### C.10.2. Bàn giao enforcement 1.2.1

**Đã áp dụng trên API và UI thật 8501; không đồng nghĩa toàn bộ IG1–IG8 đã được qualified.** Bổ sung kiểm tra chung cho `analysis_context`, `analysis_expectation` và legacy `context` cùng câu hỏi chính ở preflight/resolve/propose/job/refresh. Legacy context có giới hạn 1.500 ký tự theo mức ngữ cảnh từng được gửi; không âm thầm cắt phần điều kiện phía sau. Phạm vi địa bàn ở trường phụ được giữ thành bộ lọc bắt buộc, không chỉ gửi như lời gợi ý cho model.

Kiểm tra membership thống nhất giữa resolver, logical query và final UI enforcement: IN đổi thứ tự thành viên vẫn là cùng tập; đổi thành viên/toán tử/kiểu giá trị vẫn bị từ chối. Có ca dương/âm đi qua pipeline và fixture đa miền. Fingerprint input policy chỉ lưu ở server/approval; không gửi vào prompt model gây tăng context vô ích. Guided contract sai được trả lỗi đúng trước provider; từ vô nghĩa giữ trạng thái BLOCKED.

**Kết quả cuối:** backend hồi quy **158/158**, web logic **222/222**, browser fixture **15/15**, offline oracle **22/22 + 240/240 + 60/60**, API thật **22/22** và ba trường phụ đều chặn tỉnh sai. Câu lỗi gốc bị chặn ở direct propose (provider 0) và job (HTTP 400); tên cửa hàng thật resolve bằng 1 metadata query, preflight lặp dùng cache 0 query. Chưa gọi thêm model thật. Receipt cuối/SHA/lệnh/demo/giới hạn ở [evidence README](evaluation/input-integrity-20261021/README.md), [summary](evaluation/input-integrity-20261021/acceptance-summary.json), [runtime](evaluation/input-integrity-20261021/runtime-acceptance-v121.json).

Full scan policy 1.2.0 chạy hết 1.619 tests, 11 failures/15 errors; giữ nguyên log tìm lỗi. Bộ 158 source cuối đã kiểm lại các lỗi intake, context, enum, ranh giới câu, refinement, membership và provider-outcome fixture sau sửa. Không ghi full scan đó thành PASS source cuối. Các fixture transport/algebra/pinned-cohort bắt đầu sau intake có adapter test tường minh; không có đường tắt production. Fixture full scan thiếu bốn capture JSON đã được bổ sung trong snapshot hồi quy sau, không xóa câu/assertion.

**Còn giới hạn nghiệm thu hệ thống:** fixture danh mục 35/53 dashboard, capability fingerprint cũ và D50/D53 thiếu dòng fixture được lưu đối chứng riêng; không sửa product để giả dữ liệu. SLO wall p95 50ms của API 0,5 CPU chưa được qualified; không nâng allocation hoặc nới ngưỡng. Hai business input BC-B08-004/BC-B33-003 tiếp tục cần làm rõ đúng giới hạn đã ghi. Không tuyên bố mọi ngôn ngữ/ngữ cảnh vô hạn hay toàn repository đã xanh.

Giữ toàn bộ thay đổi khác của người dùng/Claude; không đổi schema/grant/dữ liệu nguồn hay hạ tầng, không commit/push. File K8S_3K_CAPACITY_REPORT.md chỉ là ngữ cảnh IDE trong lượt tiếp tục, không bị chỉnh sửa bởi phần việc này.
