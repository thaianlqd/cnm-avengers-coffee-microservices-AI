# V3.3 — PLAN sửa tiếp sau independent review ngày 17/10/2026

**FILE PLAN CHÍNH ĐỂ GIAO CLAUDE Ở VÒNG TIẾP THEO.**

Trạng thái: **đã triển khai và đạt release gates ngày18/10/2026**; [progress và ca live còn thất bại](AI_V33_REVIEW_FOLLOWUP_PLAN.progress.md), [bằng chứng cuối](evaluation/v33/followup-20261018/README.md). Nội dung baseline/review bên dưới được giữ để đối chiếu. Lượt live cuối24/25 useful=96% theo ngưỡng≥95%, không có nghĩa mọi câu đều pass. Trong phiên review ban đầu đây là đặc tả, chưa sửa code sản phẩm. Đọc [báo cáo review và ca tái hiện](AI_V33_POST_IMPLEMENTATION_REVIEW.md) trước. [Completion PLAN trước](AI_V33_COMPLETION_PLAN.md) vẫn là đặc tả nền; file này bổ sung các lỗi đã kiểm chứng, thay các kết luận DONE không còn đúng và chốt thứ tự sửa.

**Cập nhật sau case “doanh thu miền Nam” ngày 17/10:** bổ sung R11–R13, contract ScopeResolution/AnswerRequirements, **WP1A** (scope sets/grounding/cohorts) và **WP5A** (trả lời tổng hợp đúng nghĩa), tests **G01–G20/Q01–Q08**. Claude phải triển khai cả phần bổ sung, không chỉ sửa riêng alias “miền Nam”. PLAN vẫn dùng chính file này để tránh giao nhầm phiên bản.

## 1. Goal, điều kiện làm việc và baseline

### 1.1. Goal giao Claude

> Hoàn tất WP0–WP9, gồm WP1A và WP5A bổ sung, từ working tree hiện tại. Sửa tận production paths, thêm regression kiểm đúng hành vi, kiểm API/build/browser và live acceptance có giới hạn sau khi scorer đã đúng. Tự xử lý các lỗi liên quan trong phạm vi, cập nhật progress và tiếp tục A–Z; không kết thúc ở skeleton/helper/test riêng lẻ xanh. Chỉ đánh dấu COMPLETE khi Definition of Done cuối file đạt. Không commit/push.

Nếu có công cụ goal thì tạo goal này; nếu không có thì quản lý bằng progress/checklist, không để thiếu công cụ chặn triển khai. Khi context đầy, lưu checkpoint rồi tiếp tục, không khởi động lại từ đầu. Không xin lại xác nhận cho từng phase trong phạm vi đã giao.

### 1.2. Phạm vi và defaults

- Branch `branch_thaian`, HEAD nền `ee8a00b1c584dbacb25f54755c98205efe1f5e8a`; phần triển khai nằm trong working tree chưa commit. Kiểm lại trước khi làm, giữ thay đổi người dùng.
- Chỉ Data Platform và harness liên quan. Không sửa chatbot/Kubernetes/schema/migrations/ingestion/Spark/Gold; không chuyển sang worktree K8s.
- Giữ compiler, SQL AST/security, READ ONLY executor, query snapshot, result/capacity validators và thuật toán forecast hiện có.
- Không `.env`/secret, không reset/rebase/clean/stash/restore, không xóa dữ liệu/volume. Chỉ tên biến cấu hình và sanitized health được xuất.
- Giữ bảy mode và one-click + optional preview đã có. Không redesign toàn dashboard, đổi thresholds hoặc thêm causal/statistical inference mới.
- Không tạo evaluator/planner/service semantic song song. Mở rộng canonical contract/resolver và các adapters có sẵn.
- Có thể rebuild các dịch vụ phát triển cần thiết; không tự deploy production hoặc commit.
- Source facts và kết quả test là nguồn sự thật; progress là nhật ký. Không gọi live/manual NOT_RUN là pass.

### 1.3. Baseline đã kiểm độc lập

| Hạng mục | Baseline của vòng review |
|---|---|
| Diff | 66 tracked files, +3016/−381; digest snapshot 94 modified/untracked files |
| Backend offline | 1017/1017 OK |
| Frontend | 161/161 node tests, typecheck/build pass |
| Offline eval | 146 ca cũ + 33 V3.3 đều pass theo harness hiện tại |
| Browser mocked | Playwright 12/12 pass; chưa phải live-backend acceptance |
| Preflight | Warm p95 15.89 ms, cold catalog 163.2 ms, first request 84.2 ms |
| Served build | JS index-BtVVwX6D.js, SHA d0606955ede3b734edfa58934ccf116cbdfbf4af92108d130756951c35b67f9b; khớp dist khi review |
| Known bugs | R01–R13 trong báo cáo review, chưa được suite hiện tại bảo vệ đủ |
| Live provider | NOT_RUN trong review, 0 physical provider HTTP |

Không cần làm lại các phần đã hoạt động: physical job reservation, governed pair execution, independent driver totals, persistence fields, async tickets và mocked race tests. Sửa chúng khi có dependency cụ thể, giữ regression đã tốt.

**Bằng chứng scope mới:** preflight thật trả READY/filters=[] cho miền Nam/Bắc và địa danh/qualifier chưa hiểu. Full scripted propose nhận cả không filter, sáu tỉnh/thành miền Nam, Hà Nội, hoặc HCM+Đà Nẵng cho cùng câu hỏi miền Nam. Đây là lỗi server chưa kiểm được meaning, không phải kết luận model live luôn sai. Trong ảnh model đã chọn tập có vẻ phù hợp; cần làm cho việc đó có quản trị và kiểm chứng được.

## 2. Public contract và invariants cần hoàn thiện

### 2.1. CapabilityDecision là thẩm quyền, error codes chỉ để trình bày

Mở rộng `semantic_preflight_contract` hiện có, resolver/CompatibilityIndex sở hữu đánh giá. Preflight dựng facts/recognized clauses; không tự giữ một policy capability khác.

| Contract | Trường/ý nghĩa bắt buộc |
|---|---|
| Decision | READY/CLARIFY/REDIRECT/UNSUPPORTED, stage input/compiled, policy/catalog fingerprints, interpretation_required, reason/message |
| Constraint | Stable code, subject/requirement binding, stage static/semantic/runtime, passed/failed/pending, blocking, owner/check source |
| Action | Stable action kind, typed patch, preserves/changes, target mission/method hoặc missing fields; không chỉ một câu label |
| Requirement | Metric/dimension/method/grain/time/scope/population, role requested/supporting và binding về nguồn input |
| View requirement | Stable ID, requirement ID, required, kind, metric/dimension, transform/statistic, full source op IDs, time/scope binding |
| Fulfilment | satisfied/missing/not_applicable, reason, matched chart/KPI/table/evidence refs; runtime predicates được kiểm |

READY ở input chỉ cho phép interpretation khi còn cần hiểu nghĩa; compiled READY phải đủ static constraints. Không gửi bí mật hoặc raw provider output trong contract.

Precedence: structural/privacy/security và required unsupported trước; thiếu thông tin trước đổi mission/method; READY cuối. Return tất cả blockers và actions khả thi, không chỉ blocker đầu.

Legacy `state/can_submit/findings/clarification` là adapters từ decision. Gate dựa trên decision + blocking constraints, **không dựa membership trong REDIRECT_CODES**. Không đổi code của constraint thành một loại lỗi forecast chung để lách adapter.

### 2.2. Execution và report identity

- Bind normalized meaning/mission/time/scope/reference date/input mode/catalog/policy ở proposal, approval, job/cache và generate.
- User approval `accept_partial_scope` không làm meaning signature thay đổi; approval phải gắn đúng proposal revision/plan.
- Khi policy/view/evidence semantics đổi trong vòng này, bump policy/cache/job version nhất quán; old proposals phải replan, old reports vẫn đọc như legacy. Không tự nâng báo cáo cũ thành verified mới.
- Guided intent không có quyền bỏ qua prompt constraints. Unedited guided hợp lệ vẫn deterministic 0 provider.
- Report result giữ `completion_status`; success/complete chỉ khi requested requirements đủ. Partial phải có requirement-level reasons, không dùng overall success để che thiếu nghĩa.

### 2.3. ScopeResolution: không biết phạm vi không đồng nghĩa toàn hệ thống

Mở rộng protected facts/intent bindings hiện có, không tạo parser hoặc service riêng cạnh tranh. Cùng kết quả được preflight, planner, Risk, module/refine, report và UI tiêu thụ.

| Trường/ngữ nghĩa | Quy định |
|---|---|
| Requested scope | Original phrase/source span và requirement/cohort binding; giữ raw intent người dùng |
| Resolution state | unspecified / explicit_all / resolved / needs_interpretation / needs_clarification / unsupported; không gộp unresolved thành none |
| Resolution authority | Explicit UI, exact governed alias/set, bounded entity lookup hoặc semantic proposal chưa đủ xác nhận |
| Scope expression | Typed set reference, literal values, union/intersection/difference và cohort riêng; không model SQL/expression tự do |
| Applied scope | Canonical dimension IDs/value sets/filters, mapping ID/version/hash; resolved độc lập cho từng requirement |
| Residual obligations | Phrase chưa bind/thiếu mapping/ngoài enum; blocking hoặc pending rõ; không bỏ vì metric đã nhận ra |
| Coverage | Thành viên mapping, thành viên có dữ liệu, unknown/unmapped/no-data và mức phân loại; không tự gọi data-bearing groups là toàn population |

Input READY_FOR_AI có pending scope được phép dùng interpretation như đã chốt; UI phải ghi “Phạm vi đang cần xác minh: miền Nam”, không ghi “chưa nêu phạm vi/toàn hệ thống”. Compiled READY không còn unresolved scope bắt buộc. Enum membership của từng value là điều kiện cần, không đủ để xác nhận cả scope đúng nghĩa.

Mọi filter thêm vào phải có nguồn: requested clause/UI, governed metric definition, authorized inherited scope hoặc approved support context. Valid enum không phải quyền tự thêm Hà Nội vào câu chỉ hỏi HCM. So sánh bộ giá trị theo set semantics, không phụ thuộc thứ tự list hoặc alias surface form.

### 2.4. AnswerRequirements: câu hỏi nào phải được trả lời bằng chứng đó

Requirement giữ `answer_role` như scoped_total, requested_breakdown, ranking, comparison_gap, temporal_change, forecast_horizon hoặc association/driver đã có; kèm required evidence/coverage. Server-owned defaults chỉ bổ sung role tối thiểu phù hợp với nhiệm vụ, không tăng chart floor.

- “Doanh thu miền Nam” → scoped_total trong miền và kỳ đã chọn; extrema là supporting finding.
- “Doanh thu các chi nhánh miền Nam” → scoped_total + breakdown branch; không biến thành Top N hạn chế dữ liệu nếu người dùng không yêu cầu.
- “Top 5 chi nhánh miền Nam” → đúng Top5 theo tiêu chí, tổng Top5 ghi rõ selected cohort nếu có; không bắt total toàn miền vô cớ để tăng SQL.
- Compare hai miền → total mỗi cohort cùng định nghĩa/kỳ, gap/percent nếu hợp lệ; các cohort không gộp thành một tổng chung để gọi là so sánh.
- Rate/AOV/distinct → recompute canonical numerator/denominator/distinct ở đúng scope khi cần; không sum/AVG các group rates để tạo total.

Short answer và conclusion lấy từ fulfilled answer requirements, không chọn chart đầu hoặc câu có chữ “cao hơn” làm đáp án cho mọi câu hỏi. Phiên bản artifact/quality replay phải kiểm cả answer role lẫn số.

## 3. Work packages A–Z

### WP0 — Khóa baseline và thêm regression tái hiện trước khi sửa

**Input:** code/PLAN/progress hiện tại, R01–R13 và baseline trên. Thứ tự dependency: WP0 → WP1 → WP1A → WP2 → WP3/WP4 → WP5 → WP5A → WP6/WP7 → WP8 → WP9; phần độc lập có thể xử lý trước nhưng không release bypass prerequisite.

1. Ghi HEAD, branch, diff digest và untracked source/test digests. Không đổi tên/xóa progress hoặc artifacts lịch sử.
2. Tạo regression T01–T30, G01–G20 và Q01–Q08 ở mục 4 trong nhóm tests phù hợp. Lưu kết quả fail trước-sửa. Tests không gọi provider thật.
3. Chạy module-level để tái hiện đúng từng bug; không rerun full suite liên tục.
4. Mở lại các checkbox DONE liên quan Phase 1/2/4/5/6/7/9 trong progress, link findings/tests. Giữ Phase 3/8 phần đã kiểm chứng, ghi integration gaps riêng.

**DONE:** có danh sách reproduction → expected behavior → test path cho từng finding, và không có sửa product logic chưa biết nó giải quyết assert nào.

### WP1 — Gate canonical xuyên mọi input, gồm privacy/unsupported/guided

**Khắc phục R01/R02. Điểm nối:** preflight, semantic_preflight_contract, AnalyticalResolver, pipeline prepare/propose/generate/refine, jobs/modules và frontend action adapters.

1. Dựng cùng normalized request facts cho free text, aliases, guided và stored module intent. Biểu diễn unsupported required clause riêng với unsupported concept chỉ được nhắc để phủ định/loại khỏi yêu cầu.
2. Chạy privacy/security/static input checks trước interpretation ở mọi production path. Một business metric hợp lệ không triệt tiêu blocker ở clause khác.
3. Guided kiểm toàn bộ binding: metric, grouping, filter/cohort, period/cadence, method và unsupported requirements. Nếu known conflict, trả typed decision trước provider/analytical SQL; nếu text thực sự đã đổi nghĩa thì bỏ stale guided intent và yêu cầu sửa/diễn giải theo path hợp lệ.
4. Compiled requirement thực thi toàn bộ evaluator verdict, không chỉ constraint `non_additive_total`. Không lấy provider availability declaration làm nguồn thẩm quyền capability.
5. Hợp nhất additivity/forecast/Risk/method rules trong canonical evaluator. AOV composition phải REDIRECT Compare ở cả preflight và compiled path; metric vẫn available.
6. Chặn required profit/email/financial predicate; mixed revenue+profit không được lập report chỉ revenue trừ khi người dùng phê duyệt partial scope rõ ràng theo contract. Privacy/security constraints không được approval override.
7. Modules/template/rerun chuẩn hóa stored meaning cùng time/scope mới, đánh giá theo policy hiện tại; không skip vì có module ID. Semantic refinement gate trên previous meaning + feedback. Visual-only giữ cached artifacts, không AI/SQL mới.
8. Server failure/job result trả decision, constraint codes/messages/actions cùng normalized context. Frontend apply typed patch rồi preflight lại; bỏ workaround nối chuỗi hoặc chỉ chuyển tab mà giữ yêu cầu cấm.
9. Sau mỗi fix, kiểm action thực sự giảm blockers: ví dụ horizon sửa nhưng grouped/scoped forecast còn sai phải vẫn bị chặn với đúng blocker còn lại.

**Test boundary:** FastAPI router/API và full pipeline/job, inject ScriptedProvider/executor spies; nếu external transport ngoài fixture được gọi thì test fail. Known terminal assert provider=0 và analytical SQL=0; không assert counter hằng số của preflight như bằng chứng duy nhất.

**DONE:** T01–T08 pass qua question/prompt/guided/propose→generate/job/module/refine tương ứng; không còn preflight UNSUPPORTED nhưng proposal_ready; contract và types có consumers thật.

### WP1A — Phạm vi địa lý/cohort có quản trị; bảo vệ đúng toàn bộ meaning

**Khắc phục R11/R12, mở rộng WP1. Điểm nối:** metadata dimensions/value_groups, catalog validation/manifest, request_anchors/value grounding, candidate packet, resolver/operation bindings, preflight/UI scope presentation, module/refine/cache identity. Không cần migration/ETL hoặc thêm LLM judge.

#### A. Chốt taxonomy dùng trong kho, không để model tự định nghĩa miền

1. Mở rộng cơ chế value_groups hiện có thành scope sets có ID, label, aliases, base dimension, member values, mapping version và classification source/description. Dùng chung validator/index cho city groups và store_type groups; không thêm Python `if miền Nam` hoặc danh sách cities ở frontend/prompt.
2. **Mặc định sản phẩm được chọn cho vòng này:** `warehouse_reporting_geography_v1`, phân vùng báo cáo trên đúng 16 nhãn tỉnh/thành legacy của kho. Đây là taxonomy phân tích nội bộ cho dataset, không công bố là bản đồ hành chính hiện hành hoặc phân vùng kinh doanh lấy từ raw khu_vuc_id.
3. Seed mapping đầy đủ như bảng dưới; ánh xạ membership chỉ thuộc các giá trị có trong catalog. Những địa danh khác trên thế giới không mặc nhiên thuộc dataset và không được substitute bằng vùng rộng hơn.

| Scope set ID | Aliases khởi đầu | Member values trong city của kho |
|---|---|---|
| `north` | miền Bắc, phía Bắc, Bắc Bộ, northern region | Hà Nội; Hải Phòng; Bắc Ninh; Quảng Ninh |
| `central` | miền Trung, miền Trung và Tây Nguyên, central region | Đà Nẵng; Nghệ An; Thanh Hóa; Thừa Thiên - Huế; Khánh Hòa; Lâm Đồng |
| `south` | miền Nam, phía Nam, Nam Bộ, southern region | Hồ Chí Minh; Cần Thơ; Bình Dương; Đồng Nai; Bà Rịa - Vũng Tàu; Kiên Giang |
| `southeast` | Đông Nam Bộ | Hồ Chí Minh; Bình Dương; Đồng Nai; Bà Rịa - Vũng Tàu |
| `southwest` | Tây Nam Bộ, đồng bằng sông Cửu Long | Cần Thơ; Kiên Giang |

4. Các sets là **giao giữa phân vùng đã chọn và địa danh được kho hỗ trợ**, không khẳng định liệt kê toàn bộ tỉnh của một vùng thực tế. Label “miền Trung (gồm Tây Nguyên trong phân vùng báo cáo này)” và disclosure scope source để người dùng biết convention. Cụm mơ hồ khác convention phải CLARIFY, không lén đổi bảng.
5. Validate ba miền cấp trên disjoint và bao phủ enum dự kiến; hai subregions là subsets của south. Unknown member, alias collision, duplicated conflicting membership, missing source/version hoặc malformed group phải fail catalog validation. Không biến missing classification thành south/central theo fallback.
6. Raw `khu_vuc_id` không đủ coverage vẫn unavailable theo policy cũ. Test cũ cần phân biệt **raw organizational region unavailable** với **derived reporting geography được quản trị**, không xóa bằng chứng coverage thiếu.
7. Case `Quảng Nam` không có enum/mapping hiện tại: nêu giới hạn và cho chọn tỉnh/thành được hỗ trợ; không mặc định “Nam” là miền Nam, không tự map Đà Nẵng, không nói có dữ liệu chỉ từ kiến thức địa lý.
8. Alias địa danh cấp nhỏ như Nha Trang→Khánh Hòa, Đà Lạt→Lâm Đồng, Phú Quốc→Kiên Giang phải công bố mức dữ liệu tỉnh/thành khi request thực sự hỏi cấp nhỏ. Nếu alias không chứng minh đồng nghĩa ở grain người dùng yêu cầu, CLARIFY chọn phạm vi tỉnh/thành; không âm thầm mở rộng địa bàn. Tên nhà hàng/chi nhánh chứa “Nam”, “Bắc” không được bắt như miền.

#### B. Bind và compile scope trước khi cho phép thực thi

1. Preflight nhận known group bằng governed aliases, trả ScopeResolution resolved cùng label/member expansion/source/version. Gõ “miền Nam” không cần model nhớ ra sáu giá trị. Region resolution 0 provider/0 SQL ở hot path; toàn bộ câu phức tạp vẫn có thể cần tối đa một interpretation.
2. Preserve provenance của positive/excluded literals và groups theo **requirement/cohort**, không chỉ flatten vào `anchors.values`. Unicode/source spans dùng cùng mapping chuẩn để UI highlights và parser không trỏ sai text có dấu.
3. Các scope expressions phải có phép toán rõ: cùng dimension union (`miền Nam và Hà Nội`); intersection giữa geography/store_type (`kiosk miền Nam`); difference (`miền Nam trừ HCM`); cohort riêng (`so sánh Bắc với Nam`). Với ngôn ngữ có hai cách hiểu thật, CLARIFY trước execution.
4. Dùng tập finite được quản trị để hạ `south − HCM` thành `city in [5 values]` qua Filter/compiler hiện tại; không cần thêm SQL tự do hoặc NOT IN không có contract. Complement “ngoài miền Nam” phải chỉ rõ universe/mapping coverage; unknown/NULL classification không được mất âm thầm.
5. Lưu frozen expected scope set và provenance trong protected facts; provider có thể đề xuất cách phân tích, không được tự sửa membership. Kiểm **set equality** với expected canonical scope, bao gồm include/exclude và base dimension, không chỉ “có HCM trong list”.
6. Với câu không scope, model thêm Hà Nội phải bị từ chối trừ filter thuộc governed metric population/support semantics đã được cho phép. Với scope HCM, output HCM+Hà Nội là widening và phải fail. Với miền Nam, output all/Hà Nội/subset/superset thiếu authorization đều fail trước SQL.
7. Áp đúng scope cho mọi required và supporting operation, denominator/total, forecast applicability, Risk signal, pair hai nguồn và driver bốn queries. Supporting view chỉ được mở scope nếu contract cho phép comparison context rõ; annotate như comparator, không hòa vào total chính.
8. Structured UI scope và question scope được resolve độc lập: auto → scope trong question; explicit tương thích → canonical refinement; explicit mâu thuẫn → CLARIFY chọn scope, không silent drop một vế. Explicit all-system phải là lựa chọn có chủ đích, không suy từ auto chưa hiểu.
9. Chưa nhận ra địa lý/cohort vẫn giữ `unresolved_scope` gắn phrase/requirement. Có thể interpretation một lần khi nghĩa chưa rõ; output phải bind bằng governed mapping/literal verified/bounded lookup hoặc CLARIFY/UNSUPPORTED. Không tiếp tục all-scope chỉ vì metric đúng.
10. Không biến mọi từ lạ thành blocker. Paraphrase tự nhiên, từ nối/lỗi lặp “chi nhánh các chi nhánh”, mô tả không phải filter và negative instructions cần giữ luồng hợp lệ. Dùng typed obligations và catalog semantics; không regex blacklist tất cả từ người dùng.
11. `chi nhánh mới mở`/`đang hoạt động`/`khách quay lại`/`VIP` cần definition/time threshold và nguồn governed trước khi READY compiled. Nếu metadata không có thuộc tính/lịch sử cần thiết, nêu unsupported constraint; không thay bằng low revenue, recent transaction hoặc customer spend tùy ý. Nội dung này là nghĩa phân tích còn thiếu, không là lỗi provider.

#### C. Grouping/compare và coverage địa lý

1. Hỗ trợ “theo miền” bằng **derived dimension `reporting_region`** trong cùng catalog, base `city` và mapping version ở trên. Đây là field semantic biểu diễn CASE từ metadata, không thêm cột vật lý hoặc lấy raw organizational region.
2. Compiler server tạo biểu thức từ mapping đã validate qua AST/allowlist hiện có; LLM chỉ chọn dimension ID, không được sinh CASE/SQL hoặc danh sách membership tùy ý. Bảo toàn source/population/time/filter và approved joins.
3. `reporting_region` áp dụng cho metrics vốn tương thích với city; dimension không được tự mở cross-source joins. Với dimension không tương thích, gate như capability thông thường.
4. NULL/unknown city thuộc bucket **“Chưa phân loại”**, có count/amount; không rải vào một miền hoặc lược bỏ rồi nói all-system totals. Miền cụ thể có mapping coverage disclosure; no rows không đồng nghĩa địa lý không tồn tại.
5. Compare Bắc/Nam tạo cohort identities riêng cùng kỳ/metric, không cộng thành union rồi so hai chi nhánh đầu. Top N mỗi miền giữ partition/grain; global TopN chỉ đặt một ranking trên union scope. Deduplicate overlapping sets khi union, không double-count south+southeast.
6. Save/proposal/approval/cache/module/refine/export giữ mapping ID/version/membership hash. Đổi mapping → invalidate plan approval/cache; history giữ taxonomy cũ có nhãn, không reclassify report lịch sử âm thầm. Refinement “chuyển sang miền Bắc/loại HCM” là replacement/difference có kiểm soát, không nối thêm stale filters.

#### D. UI, evidence và điểm kết thúc

- Input resolved: **“Miền Nam · 6 tỉnh/thành trong danh mục kho”**, có expand members và classification source. Input unresolved: **“Phạm vi đang cần xác minh: …”**; không “chưa nêu/toàn hệ thống”.
- Giữ wire ID `city` tương thích nhưng label ngữ cảnh là **“Tỉnh/thành trong dữ liệu”** vì enum đang trộn nhãn tỉnh và thành phố. Không sửa physical labels, không tự gộp/đổi nhãn theo địa giới mới khi chưa có dataset policy tương ứng.
- Proposal/report hiển thị requested scope, applied scope và time rõ, cùng provenance. Nếu hai phần khác scope, header không chỉ lấy operation đầu làm scope chung.
- Coverage tách mapped members, matched stores, stores có dữ liệu, data rows, displayed groups và paging. “540 nhóm quan sát” không tự biến thành “540 chi nhánh trong miền” nếu chưa kiểm unique identities/population count.
- **DONE:** G01–G20 pass qua input→propose→generate/job/Risk/module/refine/save; mỗi scope mismatch biết trước bị chặn trước SQL; no model geography invention. Giữ tests gần-scope/natural paraphrase để không overblock hệ thống.

### WP2 — Risk request semantics: resolve time và scope độc lập

**Khắc phục R03 và phần semantics R09. Điểm nối:** risk router, shared input/scope resolution, Risk engine và Workspace payload.

1. Tách resolve period khỏi resolve scope. Chọn time custom/preset không được làm bỏ qua city/store/store_type trong question.
2. Precedence scope: structured selected/all explicit theo DTO có thẩm quyền; auto/không chọn thì dùng recognized scope từ question. Nếu xung đột có ý nghĩa, disclose cách áp dụng; không tự trộn hai scopes thành AND/OR không được yêu cầu.
3. Dùng same grounding/compatible dimensions/value lookup guards như pipeline. Không tạo SQL compiler hoặc parser thứ hai trong router.
4. Engine trả applied scope, resolved time, source applicability và selected signal IDs để UI render từ request thực thi, không từ stale preflight.
5. Giữ selected signals server-side. Unknown/empty invalid selection không âm thầm chạy tất cả; default không lựa chọn vẫn là default policy đã chốt.
6. Scan/Deep dùng cùng signal definitions, thresholds và sample policy. Snapshot metrics trả as-of, không gán historical September.
7. Grounding scope lỗi phải dừng trước analytical query, không đổi thành all-scope result. Execution failure tách khỏi no_data.

**Tests:** table auto/custom/previous_month/30d × Hà Nội/store/kiosk × auto/explicit scope. Dùng executor capture compile SQL + applied filter contract; sau đó smoke hai API requests cùng scope với hai cách chọn time phải có cùng filters và kỳ.

**DONE:** T09/T10 pass; request Hà Nội/custom September không còn `scope=[]`/585 groups toàn hệ thống. Scope chip trên result lấy từ response thật.

### WP3 — Provider budgets đúng cả repair, failover và job deadline

**Khắc phục R04. Điểm nối:** ProviderBudget/NativeAgentProvider, planner, AnalysisJobs, HTTP envelope và sanitized diagnostics.

1. Production giới hạn **interpretation≤1, semantic repair≤1, transport recovery≤1, physical HTTP≤3** cho toàn submission. Giá trị env không được mở rộng production semantic repairs lên 2 hoặc tăng physical ceiling.
2. Nếu archival tests cần policy cũ, chọn legacy adapter rõ ràng ở tests/adapter; không để default production tiếp tục policy cũ. Không sửa assert thành ba semantic calls để giữ xanh.
3. Loại semantic `DATA_ANALYST_RECOVERY_MODEL` escalation khỏi production retry path. Semantic repair giữ model/credential route đang hợp lệ; model/key đổi chỉ vì transport failure theo policy recovery, không vì nội dung sai.
4. Một hàm kiểm/claim recovery dùng cho cả secondary và same-key resend. Claim atomically kiểm: chưa dùng recovery, physical allowance, cancellation, request deadline, provider total deadline và remaining sau local reserve ≥6 giây (bao gồm backoff).
5. Giữ durable job reservation trước HTTP, reservation không biết outcome vẫn tính. Nếu claim/reserve bị từ chối thì không gửi; không reset quota vì tạo ProviderBudget instance mới/reconnect.
6. Thay `+28` trong job bằng shared planning policy; không còn constants chồng chéo. Không khởi lại deadline ở repair/fallback hoặc giữa propose/generate.
7. Timeouts thực tế phải nhỏ nhất giữa one-attempt cap, provider total còn lại và planning còn lại sau local reserve. `claim_recovery` và `http_timeout` không được có hai định nghĩa remaining mâu thuẫn.
8. Diagnostic counters tách interpretation/repair/recovery/physical; logical call recovery thành công không bị nested error. Duy trì sanitize.

| Budget | Mặc định bắt buộc |
|---|---:|
| Planning/propose HTTP/job | 40/41/70 giây |
| Provider total/attempt/connect | 30/12/2 giây |
| Local reserve/min recovery start | 5/6 giây |
| Interpretation/semantic repair/recovery/physical | 1/1/1/3 |

**Fake-clock matrix:** remaining sau reserve=5.99 → không recovery; =6 với đủ provider time → có thể recovery; request còn nhiều nhưng provider total còn 2 → không recovery; 503/429/timeout/auth/cancel; secondary và resend; recovery ở interpretation hoặc repair; worker reservation race/crash/reconnect.

**DONE:** T11–T14 pass, freeze-field conflict không có repair thứ hai, job planning dùng 40 giây, fake clock 5 giây không gửi secondary, không production model hop.

### WP4 — Temporal/forecast: cùng tập kỳ cho chart, findings và conclusion

**Khắc phục R02/R05 và temporal gaps. Điểm nối:** shared coverage helpers, forecast presentation/conclusion, trend/driver features và runtime validators.

1. Guided và free text dùng cùng range/cadence static checks. Một ngày không thể thành weekly trend complete. Có thể gợi ý mở range hoặc đổi snapshot, nhưng phải có action/acknowledgement đúng nghĩa; không tự sửa rồi gọi trend.
2. Runtime đánh giá số kỳ đầy đủ/comparable. Nếu yêu cầu chính là trend mà không có hai kỳ hợp lệ, coverage thiếu/partial đúng loại; không `complete` chỉ vì có một line chart.
3. Dùng một temporal eligibility result cho KPI/chart/insight/conclusion/forecast/driver. Ghi bucket label và actual covered range để bucket-start ngoài ngày chọn không bị hiểu là dữ liệu ngày đó.
4. Giữ per-source observed bounds, freshness và completeness riêng. MIN/MAX không chứng minh không có gap; thiếu watermark metadata thì completeness=unknown. Không thay schema để tạo watermark trong scope này.
5. Không dùng nguồn mới nhất làm freshness cho mọi metric. Driver baseline/current cần cùng applicability/completeness; không khẳng định decline do clipped/stale periods.
6. Forecast engine giữ nguyên; tách future points khỏi in_progress. Horizon total chỉ cộng `kind=future`; in_progress trình bày riêng và không tính vào số kỳ “tới”.
7. Assertion tương lai: số future periods=horizon; future date bounds chính xác; total/last/interval/forecast refs dùng đúng points. Không có future points thì không tạo lời hứa/total=0 giả.
8. Expectation 95% được giữ thành limitation/response policy rõ; không guarantee và không giả interval. Không dùng substring `95%` để chấm đúng/sai.
9. Tránh nhãn “tốt hơn baseline” khi improvement âm: hiển thị tốt/kém và trị tuyệt đối đúng chiều; zero/negative baseline theo policy.

**Test oracle tối thiểu:** Jan–Sep mỗi tháng 100, reference 16/10, horizon=2 → Oct in_progress=100, Nov/Dec future=100+100; conclusion future total=200, không 300. Giữ 80% interval/backtest algorithm output như cũ.

**DONE:** T05/T15/T16/T27 pass; cùng kỳ và phép tính xuất hiện ở API, chart, conclusion, save/export; không false complete trên insufficient history/trend.

### WP5 — Insights theo transform và requirement/view coverage thật

**Khắc phục R06/R08. Điểm nối:** view_requirement_service, resolver bindings, derived_chart_service, chart_insight_service, quality/expansion và UI ChartInsight.

1. Dựng typed transformed evidence cho raw metric, signed_delta, contribution_share, pair Pearson. Insight chọn theo transform, không luôn đọc raw first artifact.
2. Signed delta chart phải mô tả nhóm tăng/giảm và độ đóng góp thay đổi, có current/previous khi cần; số current 900 không được mô tả như delta +100.
3. Với Top N/share, ghi đúng denominator: full-scope nếu có governed denominator artifact, hoặc chỉ selected cohort có nhãn rõ. Không tự lấy sum Top N rồi gọi tổng toàn phạm vi. Thêm regression vì đây là đường liên quan, chưa được review này kết luận mọi case đã sai.
4. Pair insight/view dùng cả hai source artifacts, unique pairing keys, đúng metrics/units/populations/time/scope và n hợp lệ. Đổi một source ref/key/metric phải làm verification/coverage fail.
5. `_implements` kiểm đầy đủ required metrics/dimensions, period/grain/scope, chart/statistic/transform, source bindings và validated content. Same query ref không đủ; grouped không mặc định nhận mọi chart.
6. Fulfilment có matched evidence refs; scalar/KPI/table được tính khi đúng requirement, không phải có rows là mọi requirement đã trả lời.
7. Bỏ global chart-count floor khỏi completeness verdict. Giữ depth làm ngân sách supporting work, không tạo nghĩa bắt buộc mới. Không dùng special Top≤5 thay cho policy chung.
8. Broad requested roles phải được thực hiện hoặc có reason thiếu cụ thể; optional omissions không làm mất primary meaning. Required omission → partial/attention/needs input đúng contract.
9. Chart relevance là validation cuối của compiled requirements; không tiếp tục late static mission drops rồi che bằng table. Dedup cập nhật references.

**Tests:** T17–T20/T28. Đặc biệt artifact có cả revenue/AOV nhưng requirement revenue/store, chart AOV/line → missing; pair thiếu source B → missing; scalar 0 chart đủ answer → complete; Top10 narrow không filler; broad thiếu requested role không complete.

**DONE:** delta fixture −400/−300/+100 có insight cùng dấu/số/đối tượng, view matrix không false-positive, không hard floor gây partial giả.

### WP5A — Trả lời đúng câu hỏi doanh thu/tổng hợp, không dùng cực trị làm đáp án mặc định

**Khắc phục R13 và nối WP5/WP6. Điểm nối:** AnswerRequirements trong resolver, analytical features/KPIs, short_answer/conclusion, response quality, UI/persistence/DOCX. Không thêm provider sau khi có dữ liệu.

1. Trước execution, lập answer requirements ở mục 2.4. Overview một metric trong phạm vi cần scoped answer; branch breakdown phải giữ dữ liệu chi nhánh theo yêu cầu. Không đổi mọi câu thành ranking hoặc deep report chỉ để đủ charts.
2. Nếu có full disjoint breakdown additive, có thể derive scoped total từ **toàn artifacts đã validated** khi chứng minh completeness/disjointness, có typed calculation/evidence. Nếu TopN/truncated/missing rows/non-additive thì cần independent scalar/denominator aggregate từ compiler chuẩn; không sum preview/displayed rows. Chỉ thêm SQL cần trả lời, trong capacity budget.
3. Với đơn hàng revenue theo branch, bảo toàn store identity để không merge hai chi nhánh trùng tên; population HOAN_THANH/DANG_GIAO không đổi. Store_revenue và revenue được reuse chỉ khi equivalence metadata và grain/scope/time chứng minh cùng nghĩa.
4. Scoped total có metric/unit/period/geography version/filter/source refs và coverage. Khi dữ liệu không đủ total, ghi “chưa tính được tổng” và partial thay vì lấy max để trả lời tổng.
5. Thứ tự trả lời mặc định: direct scoped answer → breakdown/ranking/gap/variation được hỏi → limitations/actions. Câu “cao nhất” là finding phụ trong Overview, nhưng là direct answer hợp lệ khi người dùng hỏi “cao nhất/TopN”.
6. Fixture minimum: Quán A=300, B=400 → tổng phạm vi=700, hai nhóm dữ liệu, max400 và gap100 là findings bổ sung. Rate/AOV fixture có trọng số khác nhau phải recompute từ operands, không sum300+400 hoặc average rates để làm toàn-scope metric.
7. Định danh total/denominator phải bind scope của requirement: tổng miền Nam không dùng all-system total hay Top20 total; `% tổng` phải ghi rõ scope. Display paging 10/20/540 không làm thay đổi total/denominator/kết luận.
8. Giữ “Trả lời ngắn” ở đầu gồm answer concise. Đặt artifact **KẾT LUẬN PHÂN TÍCH** ở cuối phần phân tích sau primary/supporting views, bốn phần hữu ích; không lặp cùng câu “cao nhất” ở hai box. DOCX/save/reopen dùng cùng artifact và thứ tự nội dung phù hợp.
9. Comparison/forecast/trend/driver/association dùng answer roles riêng như WP4/WP5, không bị thêm total/gap vô nghĩa. Requested evidence bị thiếu phải hiện unanswered/coverage partial, không chấm complete vì có một chart bất kỳ.
10. Coverage các phần hỏi ≥100% theo requested obligations; cap số answers/caveats không được âm thầm cắt nghĩa. Main KPI nếu hiển thị total phải do verified evidence, không số frontend tự tính.

**Tests/DONE:** Q01–Q08 pass; câu doanh thu miền có tổng và scope đúng; câu “doanh thu theo chi nhánh” trả breakdown cùng tổng hợp hợp lệ, không chỉ gap; TopN không bị tăng work vô cớ; report/verification/export giữ answer provenance.

### WP6 — Verification và conclusion replay đủ nội dung, unit, scope, requirement

**Khắc phục R07 và trust-dimension gap. Điểm nối:** chart numeric verifier, canonical evidence/quality replay, conclusion builder/verifier, response persistence và VerificationPanel utils.

1. Conclusion artifact là output của typed claims có provenance, không chỉ list text + evidence IDs. Claim tham chiếu loại computation, metric, unit, population, scope/time, operands/result và requirement.
2. Narrative text sinh deterministic từ verified claim template; validate bằng canonical replay/template identity, không dùng LLM judge hoặc đoán số từ prose để chứng minh correctness.
3. Row/derived fact phải khớp cả numeric value, unit, meaning và protected bindings. Một text đổi thành 999 tỷ USD nhưng value giữ đúng không được pass như statement verified.
4. `verify_conclusion` kiểm typed claims cùng canonical evidence/forecast result và toàn bộ requested coverage. Evidence ID tồn tại hoặc answer nonempty chưa đủ.
5. `assess_report`/saved verification phải kiểm artifact `conclusion` mới; không chỉ legacy `conclusions[]`. Copy report rồi mutate answer/finding phải giảm verification với reason cụ thể hoặc reject, không trả cùng quality object.
6. Bốn phần answer/findings/caveats/actions phải đủ khi applicable. Không ép bịa action; khi chưa có hành động có căn cứ, hiện limitation rõ, không silently empty nhưng vẫn claim đủ bốn phần.
7. Tránh cap câu trả lời/caveats làm mất requested parts: bounded output phải giữ primary requirements và mandatory limitations, còn supporting text có thể rút gọn với disclosure.
8. Reconciliation merge cập nhật overall status từ tất cả relevant checks. Mismatch bất kỳ → attention; sau lần rerun matched phải recompute cả baseline checks, không tự xóa attention do lỗi khác. Không đo → not_measured, không xanh giả.
9. Hoàn thiện đúng năm chiều structural/numeric/semantic/forecast/provider như PLAN nền. Mỗi chiều có measurements/status độc lập; independent oracle giữ như bằng chứng numeric riêng, không thay xác suất đúng toàn report.
10. Save/reopen/export giữ artifact/bindings; render legacy reports được nhưng không upgrade verification mới khi không replay được. Khi oracle chạy, persist kết quả đúng session/report revision để reload không thành trạng thái khác ngẫu nhiên.

**Mutation tests:** amount/sign/text/unit/group/period/metric/evidence ID/formula, selected-total denominator, future vs in_progress, signed delta vs current, missing requested answer/action/caveat. Assert cả API result, saved report verification và UI header.

**DONE:** T21–T24/T29 pass; mutate full report bị bắt; oracle 0/1 không còn headline “Các kiểm tra đều đạt”; conclusion output/save/DOCX nhất quán.

### WP7 — Risk UI và trạng thái nhập liệu trung thực

**Khắc phục R09; làm sau WP1/WP2 để UI lấy đúng contract.**

1. Risk summary có covered/unknown/error/not-applicable/insufficient-sample counters riêng. All no_data/insufficient/execution_error không được tổng kết safe/green.
2. Map tone gray → slate/neutral thật trong JSX. Aggregate healthy + subgroup breach là hai mức: giữ aggregate status theo threshold nhưng summary phải nổi rõ nhóm cần kiểm tra, không trình bày như tất cả ổn.
3. Caption tách “x/y tín hiệu đã tính hợp lệ” và “z tín hiệu/nhóm vượt ngưỡng”; không dùng breached count làm tử số có dữ liệu.
4. Server công bố `bad_direction: below|above` từ governed operator (`lt/lte` → below, `gt/gte` → above), hoặc adapter versioned tương thích. Frontend không dựa field thiếu rồi default sai.
5. Follow-up dùng metric/dimension/direction/time/applied scope của result, tạo typed next request. Delivery success điều tra bottom; cancellation điều tra top. Không mất time/filter khi click chip.
6. Guided ready không có thông báo “AI sẽ diễn giải” mâu thuẫn. Input READY_FOR_AI nói rõ cần interpretation; pending/unavailable không gắn guaranteed-valid badge.
7. Khi đổi question/signal selection/time/scope, clear hoặc mark old Risk result stale đúng identity; Risk request đang chạy được cancel/ignore theo semantics hiện có. Giữ race tests tốt đã có.

**Tests:** no_data/insufficient/error/green/yellow/red/mixed + subgroup breach; below/above follow-up; contradictory preflight findings; custom time scope; guided text edited.

**DONE:** T25/T26 pass trên utility/component/browser. Dùng result scope thực, không chỉ snapshot assertions trên static source.

### WP8 — Acceptance scorer đúng trước live; bổ sung API/backend browser journeys

**Khắc phục R10. Điểm nối:** live runner/cases, semantic evaluator, integration test harness và Playwright config.

1. Tách hai nhóm đo: deterministic safety matrix (0 provider) và ít nhất **20 supported semantic/near-scope cases đủ thông tin** định nghĩa trước. Ambiguity có nhóm/denominator riêng, không dùng để đủ số 20.
2. Default release mode chạy full report (`propose → approve → generate` hoặc job thật), không chỉ proposal. Nếu cần proposal-only diagnostic thì ghi rõ non-release và không tính useful report rate.
3. Mỗi semantic case có expected metric/population/grain/time/scope/required roles và numeric oracle hoặc explicit eligibility checks. Success phải trả lời đúng meaning, đủ required coverage, không verification mismatch. Partial không full-pass; thiếu dữ liệu thật phải có expected typed outcome định nghĩa trước.
4. Scorer được kiểm bằng adversarial fake outcomes: arbitrary proposal, wrong metric, partial/attention, incorrect scope/numeric, false guarantee và honest disclaimer. Không chấm dựa string status/substring đơn thuần.
5. Denominator freeze trước chạy. Failed/skipped/budget-exhausted/not-run không bị loại để tăng tỷ lệ; báo attempted và full-denominator rate riêng. Không đủ case/evidence → acceptance INCOMPLETE/FAIL.
6. Recovery case phải thực thi injection tại transport boundary rồi gửi secondary thật thành công khi có credential hợp lệ. `inject_transport_failure` không được chỉ là metadata; ghi injection event, real slot/count/hash/counters. Không gây lỗi/quota thật cố ý.
7. Giữ atomic meter trước mọi physical HTTP. Cả full suite và từng submission có caps; all HTTP paths được meter. Unknown outcome reservations vẫn tính; không auto replay.
8. Đo stage timings planning/execution/report/job, cold/warm/recovery; median semantic HTTP chỉ trong semantic cohort, không lẫn deterministic zeros. Ghi actual denominator/calls.
9. Exit code nonzero khi FAIL/INCOMPLETE/required NOT_RUN; summary phải có release_ready=false và reasons. Không dùng status RUN/exit0 như đạt nghiệm thu.
10. Thêm public FastAPI API tests cho jobs/propose/generate/modules/refine/risk, provider/SQL spies ở boundaries thật. Không gọi `__new__().guided_context` rồi gọi đó là cross-entry end-to-end.
11. Giữ 12 mocked browser regressions cho async lifecycle. Thêm Playwright project riêng đi qua backend development/fixture với **không mock `/api/ai/**`**, ngoài provider/warehouse adapters phía test server đã cô lập. Cấu hình test-only adapters không được public client bật để bypass policy production.
12. Browser fixture project kiểm gate/actions/applied scope/actual report/verification/save-load; served-bundle smoke kiểm bản build deployment. Mocks project không được ghi chung thành MANUAL_UI_PASS.

**DONE:** T30 và matrix API/browser pass; live runner dry tests chứng minh scorer không false-pass, denominator/counters đúng; lúc đó mới được chạy live acceptance.

### WP9 — Full verification, served build và bàn giao

1. Chạy full canonical backend một lần sau khi module fixes ổn định; giữ isolation/offline, không `unittest discover` trần.
2. Chạy frontend tests/typecheck/build; offline eval cũ+V3.3+ca mới; mocked browser + backend fixture browser. Nếu có sửa sau đó, rerun checks bị ảnh hưởng, không dùng kết quả trước-sửa làm release evidence.
3. Chuẩn hóa whitespace các lines lockfile đang thêm theo convention repo, không churn toàn file chỉ để diff sạch. `git diff --check` phải pass cho changes của vòng này; giải thích CRLF tồn tại trước nếu không đổi.
4. Rebuild web development container sau UI changes, tránh recreate API giữa suite; verify served asset hashes/feature contract version và hard reload. Không chỉ grep chuỗi mới rồi coi feature đúng.
5. Smoke API thật read-only: Risk Hà Nội/custom vs auto, narrow/report/scalar, forecast scope và allowed bounds. Semantic interpretation cho smoke có thể scripted nhưng phải ghi mode; không gọi đó là live semantic accuracy.
6. Chạy live sau scorer/gates đúng: ≤60 physical HTTP thông thường, diagnostic extension tổng ≤80; trên 80 cần approval riêng. Không tự retry cho đẹp hoặc loại failed cases.
7. Nghiệm thu manual UI theo mục 5, lưu expected/actual, report/request IDs, screenshot khi phù hợp và build fingerprint. Không đụng session/report của user ngoài phạm vi test; dùng owner/test fixture riêng khi có thể.
8. Cập nhật progress mỗi WP, phân biệt những checkbox được mở lại và đóng bằng evidence mới. Artifacts lịch sử giữ nguyên; run mới ghi thư mục có run ID.
9. Báo cáo cuối có findings đã đóng, remaining blockers thật, full results, actual provider HTTP, served version và kịch bản chủ dự án kiểm lại. Không commit/push.

**DONE:** Definition of Done mục 6 đạt, không còn task trong scope có thể tiếp tục mà bị bỏ ở TODO.

## 4. Ma trận regression bắt buộc

Mỗi case có ID, expected outcome, request mode, entry point, provider/SQL counts và requirement assertions. Thêm paraphrases/negation/alias/đảo clause; không hardcode từng câu vào production. Dùng boundary spies với fixtures, không AI thật cho unit tests.

| ID | Input/biến thể | Assert bắt buộc |
|---|---|---|
| T01 | Lợi nhuận tháng 9; prompt/question/direct job | UNSUPPORTED trước provider/SQL, không proposal revenue thay thế |
| T02 | Email khách hàng; privacy field trong mixed ask | Privacy block trước interpretation; client READY không override |
| T03 | Revenue và profit, profit clause trước/sau | Required unsupported không bị bỏ; không silent partial |
| T04 | Guided ranking revenue/store + đang lỗ | Typed terminal, provider=0, analytical SQL=0 |
| T05 | Guided/free weekly trend, ngày 15/09 | Cùng CLARIFY/corrective action, không complete one-bucket trend |
| T06 | AOV contribution_share qua evaluator/resolver/UI | Cùng REDIRECT Compare; không gọi metric unavailable |
| T07 | Unsupported concept bị phủ định/không yêu cầu tính | Không false block chỉ vì alias xuất hiện; giữ clause bindings |
| T08 | Module/rerun/refine/old approval đổi policy/scope | Gate/identity đúng, không bypass/cache sai; visual-only không AI/SQL |
| T09 | Risk Hà Nội tháng 9, auto vs custom cùng kỳ | Applied city filter và numeric scope bằng nhau |
| T10 | Structured scope override/auto + city/store/kiosk | Precedence nhất quán; unknown scope không fallback all |
| T11 | Frozen-field conflict cần repair tiếp lần hai | Stop sau một repair; không third semantic call/model hop |
| T12 | Secondary có 5.99s sau reserve | Không HTTP recovery, typed terminal stage đúng |
| T13 | Recovery 6s nhưng provider total còn 2s | Không send; request/provider deadline cùng kiểm |
| T14 | Job fake clock/propose/repair/cancel/restart | Planning 40s, durable≤3 physical, one recovery toàn submission |
| T15 | Jan–Sep=100, ref16/10, horizon2 | Nov+Dec=200; Oct in_progress riêng; report/save/DOCX không tổng300 |
| T16 | ≥95% expectation, disclaimer/interval/backtest | Không promise; disclaimer chứa95% vẫn được coi honest |
| T17 | Driver −400/−300/+100 | Chart insight mô tả delta, current/previous có nhãn; không raw900 thay+100 |
| T18 | Revenue/store view nhưng AOV line cùng q | Coverage missing, không satisfied vì chỉ chung ref |
| T19 | Pair thiếu source B/đổi key/unit/time | Coverage/verification fail; không chỉ bool(pair) |
| T20 | Scalar 0 chart; Top5/Top10 narrow; broad roles | Completeness theo nghĩa, không global floor/padding |
| T21 | Mutate conclusion text/value/unit/ref/period | Quality/verification phát hiện reason cụ thể, không unchanged assessment |
| T22 | Fact value đúng nhưng text999tỷUSD/unitUSD | Không xác nhận statement; canonical text/meaning mismatch |
| T23 | Oracle mismatch rồi matched rerun | Header/status/counters đúng, không giữ verified khi0/1 |
| T24 | Save/reopen/export legacy/new report | Preserve đúng claims/limitations/verification revision |
| T25 | Risk no_data/insufficient/error/mixed | Không false green; neutral tone và counts chính xác |
| T26 | Risk below/above + follow-up + guided ready | Bottom/top đúng, giữ scope/time, không contradictory AI message |
| T27 | Partial/current/stale multi-source/zero baseline | Không false trend/driver decline; completeness unknown rõ |
| T28 | Contribution/Top N/full denominator | Insight và displayed share dùng đúng denominator/selection |
| T29 | Bốn phần conclusion/multi-requirement/caveat cap | Không silently drop primary answer/caveat để vừa limit |
| T30 | Live scorer fake outcomes, skipped/recovery injection | Wrong/partial không pass; frozen denominator, injection có thực thi, exit đúng |

Cross-entry minimum: known terminal class đại diện qua preflight, direct prompt/question, propose→generate, job, guided, module/rerun, semantic refinement; không nhất thiết nhân tất cả cases thành tích Descartes quá lớn, nhưng mọi public path và mọi constraint class đều có coverage traceable.

### 4.1. Ma trận scope/geography và chống thêm/bỏ meaning

Các tập kỳ vọng lấy từ **fixture taxonomy độc lập** theo bảng WP1A, không gọi hàm expansion production để tạo expected rồi so với chính nó. Assert scope expression, exact canonical member set, SQL filter/CASE, artifact provenance và UI label.

| ID | Input/biến thể | Assert bắt buộc |
|---|---|---|
| G01 | Doanh thu miền Nam; `mien nam`, `phía Nam`, lặp “chi nhánh các chi nhánh” | Known south set đúng6; không empty/all/Hà Nội; preflight có resolved scope |
| G02 | Miền Bắc/miền Trung và Tây Nguyên | Đúng taxonomy4/6; source/version rõ, không model tự chọn cities |
| G03 | Đông Nam Bộ/Tây Nam Bộ | Đúng subsets4/2, không nhầm whole south |
| G04 | Miền Nam trừ HCM/ngoại trừ HCM/không gồm HCM | South−HCM=5; không all-system−HCM hoặc mất cả scope |
| G05 | Miền Nam và Hà Nội | Union7; không chỉ giữ literal Hà Nội |
| G06 | Kiosk miền Nam, chỉ kiosk vệ tinh tại HCM | Geography∩store_type, giữ qualification; không OR sai dimensions |
| G07 | So sánh doanh thu Bắc với Nam cùng tháng | Hai cohorts riêng, totals/gap đúng; không union rồi compare branches |
| G08 | Top5 từng miền vs Top5 trên toàn Bắc+Nam | Per-region partition vs global ranking phân biệt, không silently đổi TopN |
| G09 | Ngoài miền Nam | Universe/unknown classification rõ; không NOT IN bỏ NULL ngầm hoặc pretend outside-world total |
| G10 | Quảng Nam/địa danh ngoài enum/region chưa định nghĩa | Unresolved→clarify/unsupported đúng loại; không match tokenNam hoặc substitute city khác |
| G11 | Branch tên chứa Nam/Bắc; “Nam” đứng riêng | Bounded entity match hoặc CLARIFY; không geography substring false positive |
| G12 | Hỏi HCM, model đề xuất HCM+Hà Nội | Reject scope widening trướcSQL |
| G13 | Hỏi không scope, model tự filter Hà Nội | Reject unauthorized narrowing; legitimate metric business_filters vẫn giữ |
| G14 | Miền Nam nhưng model bỏ filter/chọn Hà Nội/subset/superset | Tất cả fail canonical scope equality trướcSQL; đúng6 pass |
| G15 | UI custom time + auto scope; explicit HN vs Nam | Time không mất scope; conflict typed clarification, không silent precedence |
| G16 | Scope group áp vào support/total/driver/pair/Risk | Mọi relevant query cùng scope hash; comparison support wider có nhãn và không vào primarytotal |
| G17 | Theo miền; unknown/NULL city; no rows ở một member | Derived reporting_region3+unclassified; sums không mất tiền/đếm đôi, no-data khác unmapped |
| G18 | Đổi mapping/version; module/rerun/refine→Bắc; save/export | Cache/approval invalidated, history giữ mapping cũ, no stale south filters |
| G19 | Mới mở/đang hoạt động/khách quay lại/VIP, paraphrase | Definition/data availability checked; không proxy hay silent drop qualifier; natural filler không overblock |
| G20 | Nha Trang/Đà Lạt/Phú Quốc và tỉnh/thành legacy | Đúng grain disclosure/clarify; không dùng kiến thức hành chính hiện tại thay city labels kho |

Fuzz/property checks bổ sung: đảo thứ tự member list không đổi scope fingerprint; duplicate/overlap union không nhân doanh thu; difference chỉ loại đúng members; swap cohort labels giữ operand binding; extra spaces/diacritics không thay set; conflicting aliases/missing mapping fail validation; mapping version đổi thì fingerprint đổi.

### 4.2. Ma trận direct answer/total/denominator

| ID | Input/dữ liệu | Assert bắt buộc |
|---|---|---|
| Q01 | Doanh thu miền Nam, scoped scalar | Answer bắt đầu bằng scoped total+kỳ, không chỉ max branch |
| Q02 | Revenue theo branch A300/B400 | Scoped total700, breakdown2; max400/gap100 chỉ là findings phụ |
| Q03 | 540 data groups, page10, display20 | Total/denominator từ full verified dataset, không page/display sum; population labels đúng |
| Q04 | Top5 trong miền Nam | Đúng ranking và selected-cohort labels; không sumTop5 gọi totalmiền hoặc ép thêm4charts |
| Q05 | AOV/rate/distinct theo region | Canonical aggregate operands/distinct, không sum/naiveAVG grouped values |
| Q06 | Compare2miền, sameperiod/population | Answer2totals+gap cùng unit/scope, không maxbranch thay cohort total |
| Q07 | No-data/truncated/unmapped/partial source | Không fabricated total hoặc complete; requirement-level caveat/unanswered |
| Q08 | Scope+total+evidence mutation, save/reopen/DOCX | Verifier bắt sai scopedtotal; shortanswer concise ở đầu, final4parts cuối report không lặp vô nghĩa |

## 5. Browser/manual acceptance trên bản build phục vụ

Các journeys dưới đây đi qua UI thật; không chỉ đọc source hoặc mocked fixture responses. Dùng test data/owner riêng cho save/module khi có thể.

| Journey | Kết quả cần nhìn thấy |
|---|---|
| Workspace → seven modes, old report/module | Modes/legacy mapping giữ đúng; không redesign ngoài scope |
| Nhập “doanh thu miền Nam” trước khi bấm | Scope chip đúng6 tỉnh/thành/version; không nói chưa nêu phạm vi |
| Câu scope chưa biết/Quảng Nam/branch mới mở | Unresolved phrase rõ; đúng clarification, không gửi all-scope tự động |
| Miền Nam trừ HCM; miền Nam và Hà Nội; kiosk miền Nam | Set operations đúng qua proposal/report, không chỉ recognized literals |
| So sánh Bắc/Nam; doanh thu theo miền | Cohort/grouping đúng taxonomy, unknown bucket rõ, không đoán organizational region |
| Revenue miền Nam + paging/report/save | Direct total đúng; số data-bearing/displayed/all stores phân biệt; export giữmapping |
| Nhập profit/email/mixed unsupported | Đúng decision và sửa được yêu cầu; không spinner provider cho known terminal |
| Guided Top5 → thêm điều kiện đang lỗ | Không chạy guided intent cũ hoặc query all-scope |
| Trend weekly trong một ngày | Range clarification, action rõ; không report complete với bucket14/09 |
| Risk Hà Nội + September custom | Result scope ghi Hà Nội; số không phải all-system585 nhóm |
| Risk unknown/error/subgroup breach | Không xanh giả; separate aggregate/local counts |
| Risk delivery success → next ranking | Bottom groups; giữ September/Hà Nội/applied filters |
| Forecast 2 tháng + current incomplete | Future horizon đúng; current point riêng, total không double-count |
| Driver report | Delta chart/insight/conclusion cùng đơn vị/signed values |
| Verification oracle mismatch | Header attention, numeric mismatch; rerun/reopen đúng version |
| Propose/job/refine/risk/reconcile chậm rồi edit/reset/history | Không late state, duplicate paid work hoặc loss of deliberate context |
| Save/reopen/DOCX | Conclusion bốn phần, required caveats/evidence/verification không mất |

## 6. Release gates và Definition of Done

### 6.1. Gate đo lường

- Deterministic safety, gate parity, numeric/scope/temporal/view/verification invariants và fault-injection **100%** theo matrix.
- Geographic set equality, clause/cohort preservation và direct-answer coverage **100%** trên G/Q matrix. Thêm ít nhất6 semantic live cases đủ thông tin về region/exclusion/union/compare/grouping vào frozen acceptance cohort; vẫn cùng trần60/80, không thêm một quota riêng.
- Full backend/frontend/typecheck/build/offline eval/browser regression pass; không skip/xóa tests để xanh. Expected policy updates có giải thích.
- Warm preflight p95 `<50 ms`, cold catalog/first request đo riêng trong cùng harness đã ghi môi trường.
- Provider budgets 1 interpretation + ≤1 repair + ≤1 recovery, ≤3 physical HTTP; exact guided/scan/report-only 0 provider.
- Live useful first-click **≥95% trên ≥20 supported semantic cases định nghĩa trước**, đúng frozen denominator; deterministic/ambiguity báo riêng. All mandatory cases chạy; skipped là incomplete, không xóa mẫu.
- Live không wrong number/scope/causal promise/secret leak; semantic median physical HTTP≤1, mỗi submission≤3. Planning p95≤40s, job≤70s; tách cold/warm/recovery.
- Tổng physical live≤60 thường, diagnostic tổng≤80; >80 approval riêng. Không phải quota phải tiêu hết.
- Recovery live phải có injection event và real successful configured secondary/compatible transport nếu môi trường đủ; thiếu thì NOT_RUN và chưa đóng reliability gate.

Nếu môi trường/credential thực sự thiếu hoặc approval review từ chối, hoàn thành phần độc lập, ghi action bị chặn/lý do/điều kiện mở khóa. Không dùng NOT_RUN như pass và không tự vượt budget.

### 6.2. Bằng chứng mỗi run

Ghi dưới `data-platform/evaluation/v33/<run_id>/`, giữ artifacts cũ:

- Exact HEAD, dirty diff digest, untracked source/test/catalog digests, policy/catalog/build versions, commands và test environment.
- Per-case expected/actual, constraints/actions/coverage, primary metric/population/grain/time/applied scope.
- Semantic/physical/repair/recovery counts, reservation events, stage/total latency, actual denominator và skipped/failures.
- Numeric oracle/mutation checks, browser project mode, screenshots/traces/manual results và served asset hashes.
- Diagnostic before/after, không chỉ lần pass; không raw secrets/provider headers/PII.
- Progress links mỗi finding → fix/test/evidence; rollback bằng synchronized prior artifacts, không git reset hoặc xóa history/data.

### 6.3. Checklist hoàn tất goal

- [x] R01–R13 được đóng bằng production-path fixes và regression mới; không chỉ thay progress labels.
- [x] Canonical decision/constraints/actions được mọi entry point thực thi đầy đủ, gồm guided/privacy/mixed unsupported.
- [x] Scope sets/reporting taxonomy có version, source và validators; miền Nam/Bắc/Trung/subregions được resolve nhất quán, không model tự chọn membership.
- [x] Mọi requested qualifier/cohort đã bind hoặc disclose unresolved; không silent drop, widening/narrowing hoặc fallback all-system.
- [x] Scoped total/direct answer đúng purpose, grain và denominator; “cao nhất” không thay câu trả lời doanh thu tổng hợp.
- [x] Risk custom time vẫn áp đúng inline scope; response/UI thể hiện applied context thật.
- [x] Provider policy đúng cả repair/recovery/window/deadline/model boundaries và ledger durable.
- [x] Forecast future total đúng horizon, không cộng current point; driver insight đúng transform.
- [x] Conclusion/claim text-unit-scope/canonical replay bắt mutation; oracle mismatch cập nhật overall status.
- [x] View fulfilment kiểm đúng metric/dimension/sources/transform; không chart floor/padding hoặc false complete.
- [x] Risk summary/direction/guided messages đúng, không false green/contradiction.
- [x] Per-source temporal completeness/freshness có semantics và tests rõ; unknown không bị nâng thành complete.
- [x] API tests, mocked browser và backend-fixture browser đều có bằng chứng riêng; served bundle/manual được kiểm.
- [x] Live scorer/denominator/injection/exit codes đúng trước khi chạy; live release gates đạt trong budget.
- [x] Full checks pass trên final code, artifacts/progress trung thực, không secret/ngoài scope/commit/push.

**Chỉ goal COMPLETE khi tất cả mục trên đạt.** Nếu còn blocker thật, báo CHƯA HOÀN TẤT với phần đã xong và điều kiện mở khóa. Không kết luận “chỉ còn live/manual” nếu vẫn còn invariant/probe fail.

## 7. Lời giao việc cho Claude

> Đọc `data-platform/AI_V33_POST_IMPLEMENTATION_REVIEW.md` và thực thi `data-platform/AI_V33_REVIEW_FOLLOWUP_PLAN.md` làm PLAN chính, gồm cập nhật case miền Nam/WP1A/WP5A. Tôi giao bạn sửa đầy đủ R01–R13 và gaps theo WP0–WP9 cùng hai work packages bổ sung từ working tree hiện tại, giữ những phần đã đúng. Thiết lập goal theo Definition of Done, thêm tests T/G/Q tái hiện rồi sửa production paths, tiếp tục A–Z qua API/browser/offline/live gates trong cùng budget. Làm capability/scope/direct-answer theo contract chung, không hardcode từng câu hoặc chỉ thêm alias miền Nam rồi dừng. Không dừng ở vài test xanh hoặc helper chưa nối; cập nhật progress với evidence. Không commit/push, không đọc secret, không sửa chatbot/K8s/schema/ingestion. Chỉ báo hoàn tất khi đủ checklist; blocker ngoài quyền phải nêu cụ thể.
