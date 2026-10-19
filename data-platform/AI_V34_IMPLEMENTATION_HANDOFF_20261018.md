# V3.4 — nghiệm thu từng phần và bàn giao cho phiên chat tiếp theo

**Bàn giao mới nhất:** [AI_V34_CLAUDE_FINAL_HANDOFF_20261019.md](AI_V34_CLAUDE_FINAL_HANDOFF_20261019.md). Đọc file mới trước: backend1239 hiện FAIL1+ERROR1; ledger320/323; replica23nguồn đã bật thật; Kafka producer3lockrestarts; F07frontend180testsPASS nhưng chưadeploy, F07backend vẫn chưa sửa. Các checkpoint dưới đây là lịch sử, không dùng chúng thay trạng thái mới nhất.

Chốt ngày **18/10/2026, khoảng 23:20 Asia/Ho_Chi_Minh**. **IN_PROGRESS — chưa hoàn tất PLAN, chưa đạt release gate.** Người dùng yêu cầu tạo tài liệu để chuyển phiên do gần hết hạn mức. Không đánh COMPLETE hoặc tự coi đây là yêu cầu hủy goal.

## 0.1. Tiếp tục 19/10/2026, khoảng10:13 — ưu tiên checkpoint này

Goal vẫn **IN_PROGRESS**, chưa đạt release gate. User chốt **chỉ ADMIN sử dụng Data Platform**; không mở tài khoản quản lý/chi nhánh. Owner nghiệp vụ23nguồn vẫn admin,300s/maxlag900s. Snapshot§0 và§1–10 bên dưới là lịch sử khi khác với mục này.

- User duyệt **323 TOTAL/full44**. Full run3 đã chạy44/44,0skip qua AnalysisJobs: **33/40useful=82,5%,37/44overall,FAIL**; failedL01,L03,L20,L32,L33,L41,L43, hard_failures[L03].57reservations=56external+1injected. Ledger hiện **320/323,còn3**, events320, SHA`c86d3bd8e356afda5a0530ff8418134318b7a9462998504843ae1ab801c7f38b`. Không paidcall sau run3. Cần duyệt mới và≥60capacity trước fullrun tiếp; không chạy subset/ghép kết quả/hạ guard.
- Evidence nguyên ở`analytics-api/evaluation/v34/live44-20261019-r3/`. Captures7failed giữ riêng; observer cũ thiếu granularity/comparison_time nên absence là unknown. Observer mới chỉ bổ sung hai field cho lượt tương lai; frozen44hash`5fc5eb47…` không đổi.
- Sửa offline: candidate menu thu hẹp alias theo canonical nhưng giữ metric được nêu chính xác, qualified/equivalent/same-source và frozen refinement; coupled availability/reason targets; diagnosticprobe thu đủ metric/time/feature issues không execution; optional repair field cho phép explicitnull; bỏ selected_total không được yêu cầu trên nonadditive ranking. L01 vàL43 replay đạt; L32 historical repair vẫn bị chặn, controlled repair phải explicitclear orphanfeaturemap. Không claim mọi failedlive đã được sửa bằng exact replay.
- Review độc lập phát hiện earlycomparisonshape guard target nhầm baseline; đã tái hiện, sửa sang field shape thực sự sai và test baseline/target frozen.34relatedPASS17,751s. Fullbackend trước review đã **dừng có chủ đích**, không gọi PASS; fullbackend sau review đang chạy `/tmp/v34-20261019-post-review-final/backend.log`. Hai targeted commands khác có lỗi gọi tên module không tồn tại, giữ log, không tính chúng là fullPASS.
- Corpus offline146+33+120PASS; reference120PASS83compiled/37terminal,hash8b6f9164…; browser32PASS55,8s (28mock+4HTTPfixture).35pipelineintegrationPASS10,999s+31API/PG/RedisPASS8,094s trước replica additions. AST81services394edges78reachable,largestSCC58; không thêm service thứ3.
- User duyệt gói quyền Kafka: **6GRANT/24cột/3bảng**, đã đối chiếu JSON và áp, private pipeline profile0600/mountreadonly riêng; bật producer+consumer. Actual checkpoint cả3 tiến lên; Bronze checksum9/9partition; projection đã có>17.000recordsV3.4. Không sourceUPDATE/TRUNCATE/PIIgrant. Có **1producerrestart do LockNotAvailable lúc03:02:44UTC**, cursor giữ và đã resume đến hếtpage; consumer0restart. Backlog còn, chưa claim SLA15phút hay completeness. Evidence`analytics-api/evaluation/v34/streaming-rollout-20261019-*.json` và implementation19/streaming-bronze-readback.json.
- Replica chuẩn bị đầy đủ:23source schema/nullability/PK khớp; target mapped types/PK khớp (rawvarchar→TEXT khác biệt là phép ánh xạ hiện có). New role/profile riêng không dùng cho Kafka; helper chỉ provisioning+GRANT, không factDML/DDLtable/view.40unitPASS1,112s. Isolated actualPG canary thay snapshot2lần + fullcycle23sources giả lập (1category, các nguồn khácempty)PASS1,733s,23checkpointunknown; không chứng minh productionvolume/completeness.
- Fullcycle test phát hiện `load_data_contracts` thiếu globaljson import; đã sửa. Governedfullcycle nay không gọi DDLview, fixture vàunit xác nhận. Image data-sync mới đãbuild, chưa tự tạo/sửa schema thật.
- User trả lời **“oke bạn”** cho `replica-rollout-review.json`: duyệt2role riêng/26GRANT/canarymenu.danh_muc/full23replica300s, atomicTRUNCATE+INSERT target từngbảng, sourceREADONLY, không DDLtable/view/Kafkaoffsetreset. Đã áp đúng2role+26GRANT và tạo privateprofile; **đang dừng olddata-sync để chạy canary rồi mới bật full23**. Xem`analytics-api/evaluation/v34/replica-rollout-20261019-applied.json`; đừng apply lại/rotate profile đang có.

Remaining: hoàn tất canary/full23 và readbackcheckpoint/health; actual batch committedpublication/parity; fullbackend và source/artifactscan cuối/currentAPI runtime identity; live44 acceptance sau approvalcapacity mới; Word renderQA thiếu workspace runtime theo Documents skill; remoteCI/branchpolicy pending vì khôngcommit/push. Scoped-manager deployment không thuộc đối tượng sử dụng được user chốt, các route chưa hỗ trợ scoped vẫn deny; không đổi thành national access. Không trao maturity8/9 hay COMPLETE.

## 0. Cập nhật ngày 19/10/2026 — snapshot trước live3 và approvals mới

Goal vẫn IN_PROGRESS. Người dùng yêu cầu tiếp tục toàn bộ NOW, sau đó xác nhận **admin phụ trách nghiệp vụ cả23nguồn; cập nhật mỗi300giây, độ trễ tối đa900giây**. Đã cập nhật canonical data contracts, packaged API metadata và health threshold; không đổi technical owner, DB grants hay tự chứng nhận completeness.

- Full backend source hiện tại: **1230 PASS,685,537s**. Lượt trước1229 có2errors(context refine và optional ranking companion), đã sửa và giữ failed log. Refinement dùng delta-specific instructions, không tăng24000char budget. Cohort companion chỉ áp cho requested requirement; optional supporting work không được nâng thành requested.
- Semantic offline: **146old+33V33+120V34 PASS**; reference120PASS(83compiled/37terminal), hash8b6f9164… nguyên. Đây là authored offline meanings, không phải live accuracy.
- Fixtures: **36pipelineunit PASS0,648s;35PG/Kafka/MinIO PASS9,239s;30API/PG/Redis PASS6,170s**. Hai ca reader accounting thực tế PASS0,342s; phủ metadata5queries/cache0, directreader, executor không đếm trùng, SQL/fetch failure và capacity reject trước I/O.
- SQL QueryBudget hiện đếm executor/dryrun +metadata +directAPIreader cursors trong cùng19attempt allowance mặc định. Không lưu SQL/params/rows trong counters. Transaction controls/writer/pipeline và separate readiness/background connection factory ngoài coverage này; không gọi đây là mọi SQL toàn hệ thống.
- L41 two-period scalar vàL43 same-ranked-cohort mixed-population companion đã triển khai, replay/fullbackend/realPG PASS; L11 cũng offlinePASS. **Cả3chưa live lại**; giữ nguyên failed full44 kỳ trước, denominator40, kỳ vọng và frozen corpus.
- OTelAPI opt-in/no-op đã xong ở existingtelemetry owner; dependency1.39.1, runtime flag vẫn0, không SDK/exporter/collector/egress. Source lineage inspect→new-analysis đã kiểm tra ở backend trước provider/SQL và giữ session/provenance/verification binding.
- Runtime audit spool đã bật `/app/.runtime/audit-spool`0700, config public có private backup. Restart cùng APIcontainer sau khi0activejobs, startupDDLdisabled; ledger hash nguyên9056e045… . Real Chrome guided→save→reopen→Word download thành công; auditspool sau save0pending, không fabricate outage/PG smoke trong production.
- Hai Kafka workers từng crash vì source bind-mount lên image cũ thiếu sharedmodule. Đã build/deploy image mới **épDATA_PLATFORM_GOVERNED_STREAMING=0**: standby/running/restarts0, không mở source/state/Kafka/MinIO clients. Không bật ingestion, không đổi grants/checkpoint offsets.
- Real Chrome: đủ7modes; guided Tổng quan revenueSeptember/focused chạy không tăng providerledger. Lưu19/10 rồi mở đúng bản mới giữ440072000VND,5timepoints/1chart, partialperiodwarnings. Bản18/10 thiếu chartdata được cảnh báo artifacts expired; không giả phục hồi lịch sử. Word mới tải được85049bytes; **chưa renderPNG/QA bố cục** vì thiếu workspace dependency loader mà Documents skill bắt buộc.
- Preflight final:990/990HTTP200,0warehouseconnect/0externalHTTP; cold247,779ms; warmp50=14,608/p95=17,078/p99=19,738/max49,927ms.33synthetic signedprincipals, serialin-processASGI/Linuxaarch64/Python3.11.17; không network/load/multi-instance/SLO7ngày proof.
- Source scanner:803stagedfiles/~64,81MB, default Gitleaks rules +narrow reviewed allowlists; finalscan sạch, positivecontrol syntheticinactive token exit42. Regex allowlist từng tự match generic-api-key trên literal `key, duplicate…`; đổi spelling regex tương đương `[k]ey`, không mở rộng rule/path exception. Generated artifacts phải quét tiếp sau checkpoint docs.
- Current DB reader metadata:23contracts/admin/300s/900s; checkpoint table0rows, nên cả23chưa có loadcheckpoint certificate. Không dùng số21trong snapshot cũ để claim đã chứng nhận2nguồn.
- CI source có5jobs gồm actualHTTPfixturebrowser và source/artifactscanner trước upload. RemoteCI/requiredbranchrules chưa chạy/cấu hình vì khôngcommit/push. AST81services393edges78reachable, largestSCC58(baseline60); giữ2netnewservices, blast radius195candidatefiles gồm3docs, vượt estimate95–120 cần reviewer xem.

Remaining: final browser/artifact evidence checkpoint đang hoàn tất; Word canonical render runtime; actual governed data rollout/publication với reviewed least-privilege writer grants và destructive reconciliation approval; full scoped BI adapters/business role matrix; network/load evidence; remoteCI/adminrules; **paid full44 acceptance chưa được duyệt**. Ledger263/280/còn17, fullrun cần≥60capacity. Không tự reset ledger hoặc chạy subset để nghiệm thu.

Snapshot§1–10 bên dưới là lịch sử18/10, trừ chỗ có ghi cập nhật; dùng checkpoint§0 và progress19/10 khi khác nhau.

## 1. Đọc phần này trước khi làm tiếp

Goal còn nguyên: **thực hiện toàn bộ NOW Phase0–8 của `AI_V34_PLATFORM_MATURITY_PLAN.md`**, bảo toàn nền V3.3, sửa lỗi thật trên bản phục vụ và nghiệm thu đúng bằng chứng. Người dùng không muốn chỉ sửa một case hoặc báo xong vì test subset xanh.

| Hạng mục | Snapshot lịch sử18/10 tại bàn giao |
|---|---|
| Full backend gần nhất | **1.201 PASS, 658,004s**; chạy trước sửa L11/audit spool cuối. Không dùng số này làm full PASS cho source cuối |
| Sau sửa cuối | **96 targeted PASS, 20,046s**; gồm audit/spool, observability, semantic repair, V3.3 live regressions/identity, catalog lifecycle |
| Real data fixtures mới nhất | **35 PostgreSQL/MinIO/Kafka PASS, 11,314s +27 API/PostgreSQL/Redis PASS, 5,892s**; có audit lost-commit-ack/replay với role INSERT-only |
| Web | **177 unit PASS**, typecheck/build PASS; **32 browser PASS** =28 mocked +4 actual HTTP fixture. Sau đó không sửa web product |
| Offline semantic |146 old +33 V3.3 +120 V3.4 PASS tại checkpoint trước L11; reference120 PASS =83 authored compiled intents +37 terminal/request boundary; không phải120 lần LLM hiểu đúng |
| Live full lần1 |44/44,0skip; **35/40 useful =87,5%, FAIL** |
| Live full lần2 |44/44,0skip; **37/40 useful =92,5%, FAIL**; cần≥38/40; overall41/44; L03 PASS, hard_failures[] |
| L11 sau lần2 |Đã sửa/replay offline PASS; chưa live lại, chưa full backend lại |
| L41 /L43 |Còn mở; không đổi expectation hoặc bỏ khỏi denominator |
| Provider quota |**263/280 TOTAL, còn17**. Không đủ dự trữ≥60 để chạy full44. Không có approval vượt280 |
| API/web |Docker healthy; `/health`200ok, `/api/readiness`200ready, warehouse/catalogtrue lúc chốt. Ready không chứng minh mọi câu hỏi thành công |
| Audit spool |Code/tests có; **operator setting chưa bật**, runtime hiện vẫn DB-only fail-closed |
| Source /Git |Working tree chưa commit/push; HEAD nền f9a1a6ff…, branch_thaian. Không reset/clean hoặc bỏ untracked |
| Tests/process đang chạy |Không còn full/live runner đang hoạt động. Các test khởi chạy trong phiên đã kết thúc |

Không được cộng các subset thành một full result, ghép hai live runs thành PASS, gọi37/40 là95%, hoặc tự nâng target score thành achieved.

## 2. Repo, quy tắc và thứ tự đọc

Repository đang dùng:

```text
/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI
```

- Branch `branch_thaian`; HEAD **`f9a1a6ff8d3c88e1bc9954c134d7cef8bdcd050b`**. So cached `origin/branch_thaian`:0/0 tại bàn giao; **không fetch mới trong lượt chốt này**. Không dùng Git HEAD một mình làm identity vì nhiều source/untracked chưa commit.
- Đọc `CLAUDE.md`, `.claude/rules/general.md`, `data-platform.md`, `token-budget.md`; không thấy AGENTS ở lần inventory trước. Không spawn subagent nếu người dùng chưa yêu cầu.
- Chỉ Data Platform +harness/CI liên quan. Không sửa identity/chatbot/Kubernetes/mobile/web-customer. Identity chỉ được dùng adapter vào hệ thống hiện có.
- Không commit/push/reset/restore/stash/clean/rebase; không hoàn tác việc chưa nhận ra nguồn gốc. Xem diff trước khi sửa.
- Không đọc/in/copy secret `.env`, credential files, tokens/cookies/browser passwords. Dùng factory sẵn có; chỉ đọc boolean/counter/hash cần thiết. `.env.example` là file mẫu, được sửa.
- Không `down -v`, prune/delete volumes hoặc DROP/TRUNCATE DB thật. Full-reconcile trong code hiện có TRUNCATE trong transaction: **không bật governed ingestion thật một cách tự động**.
- Migrations/DDL mới ngoài phạm vi đã duyệt cần approval cụ thể. Approval026/027/028 không là blanket approval cho migration khác hoặc fact repair.
- Sau sửa web phải `up -d --no-deps --build web-ui`, kiểm served asset hash. Không chạy `up --build web-ui` có dependencies; có thể recreate API/mất ledger tạm.
- API mount code trực tiếp, có auto-reload. Tránh sửa product files khi full suite/live đang chạy; kiểm active jobs trước lifecycle/restart. Không tự resend uncertain paid work.
- Test mặc định offline; không `unittest discover` trực tiếp trong env production. Dùng runner chuẩn bên dưới.

Nguồn tài liệu:

1. File này: checkpoint mới nhất và việc cần tiếp tục.
2. [PLAN V3.4](AI_V34_PLATFORM_MATURITY_PLAN.md): yêu cầu/DoD/gates gốc, không phải báo cáo implementation đã xong.
3. [Progress V3.4](AI_V34_PLATFORM_MATURITY_PLAN.progress.md): lịch sử chi tiết, có nhiều checkpoint đã bị source sau thay thế.
4. [Findings hiện tại](evaluation/v34/implementation-20261018/findings-current-status.md) và evidence cùng thư mục.
5. [Handoff V3.3 cũ](DATA_PLATFORM_HANDOFF_20261018.md): **lịch sử V3.3**, không áp trạng thái COMPLETE/ledger151/HEADee8a… của tài liệu đó cho V3.4 hiện tại. Code V3.3 sau đó đã vào f9a1a6ff…; không rewrite manifests run18.

## 3. Approval đang có — không hỏi lại những mục này

| Approval người dùng đã trả lời rõ | Đã làm /giới hạn |
|---|---|
| “Duyệt migrations026/027 và role DB giới hạn quyền” |026_analysis_modules +027_platform_governance đã áp; ownership/audit/checkpoint/publication metadata và limited DB roles. Không sửa fact orders để tạo test |
| “Duyệt triển khai21view khóa snapshot” |028_snapshot_lock_guards đã áp;21 `analytics.snapshot_lock__*`, một cột boolean/0rows; reader chỉ SELECT guard views, không mở full Silver/PII |
|240TOTAL |Đã dùng; lịch sử bảo thủ160 trước V3.4, không reset151 cũ |
| **“Duyệt280TOTAL, giữ nguyên phạm vi”** |Ceiling hiện tại280, không cần hỏi lại280. Chỉ Google Gemini `generativelanguage.googleapis.com`, existing configured primary/secondary, câu hỏi+governed business metadata; không raw rows/PII/credentials |

028 SHA256: `4f115ebb45ce4cd497fd2218df31c54e81d28c8530a97e3049e02af757b15f1d`.

**Chưa có** approval >280, DDL khác, mở grants cho manager/regional/system/pipeline, business owner/SLA mới, destructive source reconciliation, hoặc commit/push. Không dùng CLI `--approved-ceiling` làm permission.

## 4. Ledger và hai lần live — phải bảo toàn

Authoritative persistent ledger trong API:

```text
/app/.runtime/provider-ledger/v33-live-http-ledger.json
```

- **reserved263/events263**, SHA256 lúc chốt **`9056e04564899bf4100455111a398432e4431ca5b0ca9888d22a0faed39c3026`**; approved280, remaining17.
- `/tmp/v33-live-http-ledger.json` cũ151 là historical evidence, **không** thay ledger persistent bằng bản151 hoặc recreate count0.
- Chuỗi accounting:151historical →160conservative recovery (4known manual transports +5unknown reservations) →161 sau1L03 diagnostic →213 sau52reservations full lần1 →263 sau50reservations full lần2.
- Recovery160 đã giải thích/được duyệt; không gửiHTTP trong recovery. Giữ original151events/prefix/hash; không xóa unknown/failed/injected attempts.
- Meter global hiện bao phủ harness; **không claim mọi manual UI paid click đều tự được global-metered**. Nếu có manual work ngoài harness phải đối chiếu logs và hạch toán bảo thủ trước paid work tiếp theo.
- Full run cần remaining≥60 trước bắt đầu. Tại263, ceiling tối thiểu để có60 là323; mọi ceiling mới cần người dùng duyệt rõ. Chưa đề nghị/được duyệt340 hoặc mức nào khác. Không tiêu17 còn lại cho retry đẹp hoặc subset rồi ghép thành release.

Frozen cohort không đổi:

```text
analytics-api/evals/live_cases_v34.json
SHA256 5fc5eb47fd515d314c5d1d7186a9306c5c262bfac4dca3c1d1ccc206d29bda2c
44mandatory /40useful /4expected clarify; reference_date2026-10-18
```

| Run | Kết quả và bằng chứng |
|---|---|
| `evaluation/v34/acceptance-20261018-frozen44/` |35/40; failedL29,L32,L41,L43,L44;52reservations =51external+1injected. Planningp953513,78ms/jobp954341,64ms; durable counters matchtrue |
| `evaluation/v34/acceptance-20261018-frozen44-rerun2/` |37/40; failedL11,L41,L43;50reservations =49external+1injected. Planningp954001,66ms/jobp954689,98ms, wall253,2s; median1/max2physical; durable counters matchtrue; releasefalse |

Mỗi thư mục có `live44.json`, `live44.cases.json`, `runner.log`; bản gốc do container ghi còn nằm dưới `analytics-api/evaluation/v34/…`. Đã copy về evidence root đúng. Không overwrite bất kỳ run nào.

L03 live đúng HCM/Hà Nội September:154577000/96171000VND; diagnostic độc lập trước hai full runs cũng PASS1HTTP. L22 injected503/secondary recovery PASS. Không có hard numeric/scope failure được scorer ghi nhận; điều đó không là chứng nhận source truth hoặc mọi số đã được business owner ký duyệt.

## 5. Những phần đã triển khai — production path và giới hạn

### 5.1. Security/auth/ownership và lỗi dữ liệu trống

- `services/access_policy.py` là owner principal/RBAC/resource/scope fingerprint; middleware bảo vệ routers, direct SQL default-disabled/admin+AST policy; không tin UI/role tự khai hoặc browser cookie như account identity.
- Login adapter dùng Identity hiện có qua gateway; Redis opaque HttpOnly session TTL15phút; không copy JWT secret vào repo, không token localStorage. Chưa tạo identity system khác.
- Deployment policy hiện ADMIN national non-PII, permissions có `analytics.read/platform.read/reports.save/reports.export/reports.legacy/sql.explore`; **system.read/pipeline.trigger chưa cấp**, SQL Explorer vẫn disabled theo cấu hình. Manager/regional/unknown deny khi chưa có trusted grants; legacy BI scoped adapters chưa đầy đủ nên deny an toàn.
- Reader SELECT theo cột trên21Silver sources được phép, không DDL/DML/PII/raw tables. Report writer cho metadata. Không grant reader full relation chỉ để chữa LOCK.
- Saved reports/module/session/job/artifacts có owner/policy identity; client `created_by` bị bỏ qua. Ownerless legacy admin-quarantine/read-only, không login đầu tiên chiếm ownership.
- Các ảnh dashboard0/empty lúc đầu liên quan rollout auth/DB/web và fallback UI sai; đã sửa luồng data thật/không fake totals. Có independent metric/export/DB fixtures. Quan sát runtime cũ40460orders/1215stores, không suy DB đã empty. Số count đó là snapshot đã đọc, không phải số chốt mới hôm nay.

### 5.2. Lỗi generate của payload người dùng: snapshot LOCK

- Request tham chiếu `658a9d6ef6d84c77af16f365dd06837c`: proposal đúng nhưng generate fail PostgreSQL42501 tại `LOCK TABLE silver.chi_nhanh`; nguyên nhân role chỉ có SELECT theo cột không được explicit relation LOCK.
- 21guard views được duyệt giải quyết bằng recursive locks theo view owner, giữ reader column restrictions. RR snapshot lấy **sau** khóa; tests thực chứng concurrentTRUNCATE bị chặn và commit trước snapshot thấy777.
- Readiness kiểm actual reader guard-lock capability +read-only snapshot, không chỉ SELECT1. `/api/readiness`ready là hạ tầng sẵn sàng, không đồng nghĩa NL/report/data completeness đã thành công.
- Replay public propose→generate từ captured intent trên kho thật/HTTP bị chặn choSeptember revenue **440072000VND**, verification pass. Không gọi đây là một lần live model hiểu đúng.

### 5.3. Save/reopen/DOCX và typed inspect

- Root cause mới phát hiện trên Chrome: save server-authoritative lấy `session.report_response` vốn đã prune chartdata/rows phục vụ refinement; kết luận có số nhưng donut empty.
- `routers/reports._authoritative_report` nay hydrate từ **owned immutable artifacts** qua existing `restore_report_presentation`, giữ verified chartbindings/insights, chạy chart_checks. Không tin client rows hoặc mutate session summary; không analytical SQL/provider mới.
- SavedGET/Word cùng hydrate path khi bản lưu cũ bị prune; artifact hết hạn/không còn thì disclose unavailable/409, không fake0/empty success. Catalog/policy cũ không tự được nâng verified theo catalog mới.
- UI reopen fetch resource server theoID, epoch/abort/recheckpermission; legacy list hiện “chỉ đọc, chưa xác minh”, ẩn claim giả và disable forbidden export/delete.
- Real restricted-reader fixture +actual warehouse internal approved-principal replay xác nhận chart/conclusion parity, hai donut totals440072000VND, bỏ client999999999. Internal fixture principal không là Identity HTTP login test.
- Entity inspect đọc đúng ownedartifact/page/compositekey,0AI. “Phân tích riêng nhóm” tạo guided draft mới giữ metric/period/queryfilters/typed composite scope, preflight lại, chờ explicit Analyze. Null/unrepresentable/missinglineage không bật action; không lấy client totals làm report mới.
- Đã sửa scalar `eq` scope khiến UI crash: AnalysisScopePanel display adapter scalar/list. Source identity draft hiện **chưa được chuyển thành new backend lineage field đầy đủ**, không claim đã xong provenance cho new-analysis chain.
- Latest served asset **`/assets/index-Dryde78P.js`**, SHA **`fed6609c7dd0ff7210c6229fc5f6cf56e939a5be18cb775d68bd1912a81a9b0b`**, khớp localdist sau web-only build.
- Browser32fixture PASS và source/warehouse checks có; **chưa visually recheck actual Chrome saved donut sau fix cuối**, vì user liên tục đổi tab. Không giả đã xem. Khi dùng CUA cần state mới, không dùng index cũ hoặc tranh tab với user.
- Word thực từng tải42922bytes, OOXML có revenue/conclusion/verification/unknown completeness. **Chưa renderPNG/layoutQA** do bundledLibreOffice/workspace loader unavailable; không dùng desktopLibreOffice. Skill đã đọc: `/Users/thaian/.codex/plugins/cache/openai-primary-runtime/documents/26.921.10847/skills/documents/SKILL.md`. Bước render-and-verify còn thiếu, không gọi OOXML check là visual QA.

### 5.4. Semantic/control/stats/data/operations giữ nền hiện tại

- Một Hybrid/catalog/resolver/compiler path; provider không sở hữu SQL/formula/scope/access. Giữ≤1interpretation+≤1targetedrepair+≤1transportrecovery/≤3physical, planning40/job70/provider30/attempt12/connect2/reserve5; không tăng retry để lấy PASS.
- L03 missing-axis dependency sửa precise target; time/metric/unrelated scope vẫn frozen. Regional derived cohort completion chỉ1group_gap requirement, exact2disjoint primarygroups, nofilter/ranking; đúng reporting_region+exact union, không generic unlock dimensions.
- L32 TopN kèm explicit “thấp nhất/lowest” dùng metadata value-direction local clause, không dùng business quality direction để đảo tỷ lệ hủy. L44 alias metric chung “số đơn sử dụng voucher” không còn false promotion grouping. Catalogroot version**10**, IDs/formulas/populations giữ nguyên; legacy fingerprint thay do metadata update, không rewrite approvals cũ.
- 43metrics/33dimensions/18subjects, stableIDs/team lifecycle, additive semantic fingerprint/contract diff. `avengers-data-team` là accountable implementation team dựa existingDAG, **không claim mọi business source owner đã ký duyệt**.
- Offline corpus120 giữ freeze **`12959e3daef9e07d9941ba60abef564a64ad73203bc386a452e28b4783067fa4`**; reference120 freeze **`8b6f9164fde3a3dad0b43c27c6da75c2d8e137b561abefd975afbc55605aaefa`**.83compiled+37terminal, authoredoffline. Holdout đã được diagnosis, không còn claim unseen.
- Forecast3.4 commonfolds/held-out diagnostics/coverage/historyhash, existing stale/future/current guards; Spearman fullpairs/ties/sensitivity; MAD/IQR anomaly chỉ đủ history/exposure+source certificate. Actual completenessunknown nên statistical anomaly unavailable là đúng, không fakegreen.
- Oracle reserve physicalattempt trước runner, errors/timeouts vẫn consume≤3; một snapshot/epoch vector; generation đổi→incomparable, missingepoch→not_measured; không gọi sameformula oracle là independent source truth.
- DataHealth mở rộng existing coverage owner,23source/schema/checkpoints/expiry và3measuredDQchecks; **21source checkpoint evidence còn thiếu**, unknown completeness không tự thành complete từMIN/MAX/NOW.
- Sync source upperbound/overlap/idempotentupsert/independentfullreconcile/atomiccheckpoint; Kafka acknowledgedcursor/manualoffset/requiredBronze/idempotentprojection/quarantine; batch exactrunmanifest/immutablepublish/requiredgates/typedrejects/GoldDBversionedpointer.35pure+35realdatafixtures có. **Governed production ingestion flag vẫn0, nguồn thật/batch committed publication chưa rollout nghiệm thu**; không gọi stream là canonical CDC hoặc pandas là Spark distributed.
- Existing JobRepository atomicRedis registration+readback lostEXECack; global12/owner4/workers4; shutdown/cancel đúnglocal work, không resend paid uncertain. Real fixture2Redisclients, **chưa2fullAPIprocess contention/load**.
- SQL QueryBudget existing capacity owner mặc định19physical attempts, gồm dryrun/fail; request/job context qua threads; snapshot admission4exporters/pool12/queryconcurrency2. **Metadata/legacyBIrawcursor accounting chưa đủ**, `metadata_attempts=None/not_measured` đúng, không đổi0.
- Provider rolling observations +single lazy half-open probe/cooldown lease, stale success không xóa429mới; no background paidprobe. Shared multi-process cooldown NEXT.

## 6. Vừa sửa cuối, cần tiếp tục nghiệm thu

### 6.1. L11 — đã fix offline, chưa live lại

Question: “Điểm đánh giá trung bình theo chi nhánh tháng9năm2026”. Capture model chọn đúng `avg_store_rating`,store,September nhưng `decision=clarification`, `availability=needs_input`, không reason/clarification và thiếu analysis_kind.

- File `services/hybrid_analyst_planner.py::parse` bổ sung completion rất hẹp: một requirement, metric locked, một explicit groupedclause, exactperiod, không reason, filters/ranking/forecast/granularity/supporting/featuretargets; derivedfeatures chỉscalar hoặc rỗng. Chỉ chuẩn hóa unexplained status và missingaggregate shape đã xác định bởi catalogmetric+groupedclause.
- Không metric/time/filter/entity guess; genuine reason/clarification, missingperiod, changedperiod, wrongmetric, extraaxis/filter, insufficientsource đều không được promote. Mọi anchor/resolver/compiler/runtime guard vẫn chạy sau đó.
- Fixture **`tests/fixtures/v34_live44_rerun2_failed_intents.json`** giữ normalized L11/L41/L43 outputs, không rawHTTP/rows/secret. Test ở `tests/test_v34_semantic_repair.py`: capturedL11,negativevariants vàgeneric revenue/city/2025 +rating/store/2025;0externalHTTP/0warehouse.
- Các diagnosticfailed trước khi completeaggregate cũng lưu: không xóa failure để làm đẹp evidence.

### 6.2. Audit spool — code/tests xong subset, runtime chưa bật

- Owner vẫn **`services/telemetry.py`**, không thêm service/store riêng. Opt-in `DATA_ANALYST_AUDIT_SPOOL_DIR`; unset giữ DB-only fail-closed.
- Private absolute dir0700/file0600, owner UID check/no-symlink; flock admission≤0,25s;≤1000events/4MiB/8192bytes mỗirecord; fsyncfile+directory trước acknowledgement. Corruption/full/diskfail/unsafepermissions→503 trước privileged action; không discard audit history.
- Sanitized typed records chỉopaqueactor/resource IDs,policy/scope/queryhash,request/job IDs,originalUTCclock,controlled details; không prompt/SQL/rows/credentials.
- KhiDBhealthy, replay≤25pending cùngnew event trong transaction; `INSERT … ON CONFLICT DO NOTHING` theoUUID, không UPDATE/DELETE audit. Lostcommitack hoặc cleanupcrash replayidempotent; giữ original occurred_at.
- Snapshot có `audit_delivery` counters cho spooled/replayed/cleanup_failed/failed, process observations; không claim durable SLO metrics.
- **96targetedPASS** gồm actual filesystem lock/contention/capacity/fsync/corruption/symlink/lostack; **27PG/API PASS** có lostcommitack thật, roleINSERT-only replayexact1event, SELECT/DELETE42501. Không có migration/grant mới.
- `server.py` operator allowlist thêm `DATA_ANALYST_AUDIT_SPOOL_DIR`; `.env.example` thêm cách dùng. **Không sửa `.runtime/deployment.json` để bật setting**. Boolean kiểm lúc chốtfalse. Phiên mới cần chọn mounted persistent path, owner/mode đúng, verify noactivejobs trước config/lifecycle; không đọc/in credential file.
- **Chưa có OTel API instrumentation/exporter**. Có JSONlogs/metrics/context/physicalevents; không coi spool là đã xong toànF18.

## 7. Remaining work theo PLAN — đừng đánh DONE sớm

| Nhóm | Phần còn thiếu /điều kiện đóng |
|---|---|
| Final revision gates |Sau L11/spool cuối chưa full backend/eval/reference/integration/browser/served run trên một final identity. Web chưa đổi nên177/32 là checkpoint thích hợp, nhưng phải ghi đúng phạm vi |
| Live acceptance |37/40FAIL. L11fixoffline chưa đo live; L41/L43open. Sau candidatefinal/offline phải có approval quota đủ≥60 và runall44 mới, không stitch |
| L41 period comparison |“So sánh doanh thu tháng8 với tháng9năm2026”: model trảclarifyempty hoặc gomunionrange rồichange features sai shape. Existing anchor yêu cầu coverage từngperiod. Cần biểu diễn đúng two-period comparison và sharedyear/time semantics; không chấp nhận SUMAug+Sep thaycompare hoặc nớifrozenkind/time |
| L43 ranked companion |Top5store theo cancellationrate kèmorder_count: ratepopulationHOAN_THANH/DA_HUY, countallorders. Resolver chặn independent rankings khácpopulation là đúng. Muốn support phải bind companion vào **cùng selected ranking cohort**, giữ independentpopulation/count/key/provenance/verification; không gỡ populationguard hoặc rank riêngcount. Frozen expectation chưa được đổi |
| Data rollout |Source owners/cadence/SLA/lateness assumptions chưa business-approved; governed sync/stream/batch chưa deployment proof/currentcommittedrun;21certificatesmissing. Fullsync cóTRUNCATE/DDL path nên không tự bật hoặc chạycanarydestructive trênDBthật |
| Governance |Explicitbusinessrowgrants/manager/regional policies chưa có; scopedlegacyBIadapters còn deny thayglobalfallback. Finalrole×route/resource/scope/revocation/cache/export/auditmatrix cầnđóng. Không tự cấpsystem/pipeline vìUIthiếuquyền |
| UI/export |Actualserved authenticated savedreopen saufixcuối chưavisualQA; current principal/history/logout stale checks cần finalservedgate. Wordlayout renderPNGchưacótool. Newgroup-request backendlineage còn thiếu |
| Operations |Auditspool chưaoperatorenabled/smoked trongruntime; OTelAPI/no-opinstrumentation vàSQLmetadata/legacyBIattemptaccounting chưa xong.2fullAPIprocess/networkfault/loadproof chưa đo; không claimscale8/SLA7ngày |
| CI/release |Workflow source có backendnetwork-none,web/browser,datafixtures/referenceeval. **Reviewed secretscanner vàHTTPfixture browserCIjob cần rà/bổsung**, remoteCI chưapush/run. Read-onlyGitHubAPI trước đó: protection404“Branch not protected”,rulesets[]/effectivebranchrules[]; adminpending. Khôngcommit/push theo repo rule |
| Complexity |81services/390edges/78reachable, largestSCC**57**; baseline79/358/76/SCC60. SCC tăng từcheckpoint53 sau thay đổi tiếp theo, phải review thật (L11 thêm dependency trực tiếp vào time_resolution), không giấu bằng dynamicimport.2newservices giữ, nhưng blast radius vượt estimate |

Những phần không đủ data/approval được ghi pending/unavailable, không tự tăng điểm. Không thể chốt whole-platform DoD chỉ vì core Analyst hiện sinh report được.

## 8. Evidence và source identity để tiếp nhận

Root chính: **`evaluation/v34/implementation-20261018/`**. Full logs lớn không đọc nguyên nếu chưa cần; grep failure/summary trước.

| Artifact | Ý nghĩa |
|---|---|
| `post-live-repairs-backend-1201.txt` |Full1201PASS **trước L11/spool cuối** |
| `post-live-repairs-web-177.txt`, `…typecheck.txt`, `…build.txt` |177/type/build checkpoint |
| `post-live-repairs-browser-32.txt` |28mocked+4HTTPfixturePASS; `…browser-sandbox-failure.txt` giữ EPERMlisten trước tests, không PASS |
| `post-live-repairs-pipeline-35.txt`, `…api-fixture-26.txt` |Data/API fixture trước spool |
| `audit-spool-l11-catalog-96.txt` |Targeted mới nhất96PASS |
| `audit-spool-pipeline-35.txt`, `audit-spool-postgres-api-27.txt` |35+27actual fixtures, INSERT-only audit replay |
| `rerun2-l11-*.txt` |Reproduce/failedintermediate/positiveboundaggregation; log65+missingmodule làrunnerinvocationFAIL, không callfullgreen |
| `preflight-asgi990-post-live-repairs.json` |990warm actualASGI serial, p95**19,970ms**,p5015,742ms,cold267,849ms;0warehouse/0externalHTTP. TrướcL11/spool cuối, khôngnetwork/multiinstance/SLO |
| `served-post-live-repairs-identity.json` |Dryde78Pserved/localbytehashmatch |
| `served-owned-artifact-replay.json` |Actualwarehouse/policy-bound savedpresentation hydration440072000,0HTTP; không IdentityHTTPlogin |
| `runtime-snapshot-repair.json`, `snapshot-guards-deployed.json` |42501rootcause/approvedguarddeployment |
| `handoff-runtime-health.json` |Health/readiness read-only mới nhất |
| `handoff-source-manifest.json` |Sourcepath/hash +rawtrackeddiff +ledger263 tại bàn giao; khôngreleaseapproval |
| `handoff-architecture.json`, `handoff-git-status.txt`, `handoff-diff-stat.txt` |ASTgraph/dirty/untrackedinventory |

Raw tracked diff SHA tại chốt code: **`80c9d784d971cfbc4cc2d1ae88c0fe49c12b1808533702ae3bd1244f0edcf68e`**. Nếu source hoặc docs đổi tiếp, hash/inventory phải ghi mới, không overwrite historical runs.

Inventory169file ở các checkpoint trước **chưa liệt kê đủ một số tracked regression/untracked normalizedfixture paths**; raw tracked diff hash vẫn có nhưng untrackedfilelist không đầy đủ. Handoff inventory được quét lại từ Git dirty+untracked, loại runtime/evaluation/build/cache/secretenv, thay vì copy danh sách169 cũ. Đây là giới hạn evidence cũ cần ghi nhận, không sửa ngược historicalmanifests. File handoff được tính ở manifest cuối sau khi viết.

Inventory cuối gồm **175source/config/docs files,79untracked** (bao gồm file handoff này; không bao gồm evaluation artifacts/private runtime/cache/build). Có thể tăng khi phiên mới tạo thêm file; đây không là quota phải chạm đủ. Source/config/code đã vượt estimate95–120files/28–35new trongPLAN; cần review scope/maintainability trước release.

## 9. Lệnh làm tiếp — mặc định offline

Chạy từ repository root. Docker trên môi trường hiện tại thường cần sandbox escalation đã được reviewer cho phép; nếu bị EPERMlisten khibrowser thì escalate đúng local ports, không giảm assertion.

```bash
# 1. Tiếp nhận: đọc trạng thái; không reset/clean/checkout.
git status --short
git diff --check

# 2. Targeted hiện tại (đúng tên module; không có test_v34_capability_parity.py).
LOG_DIR=/tmp/v34-next-targeted .claude/scripts/dp-test.sh module \
  tests.test_v34_audit tests.test_v34_observability \
  tests.test_v34_semantic_repair tests.test_v33_live_regressions \
  tests.test_v33_identity tests.test_v34_catalog_lifecycle

# 3. Sau khi chốt tất cả product edits: full backend một lần.
LOG_DIR=/tmp/v34-next-full .claude/scripts/dp-test.sh backend
LOG_DIR=/tmp/v34-next-eval .claude/scripts/dp-test.sh eval

# 4. Web và fixture integration. Scriptpipeline chưaexecutablebit: dùngbash.
LOG_DIR=/tmp/v34-next-web .claude/scripts/dp-test.sh web
LOG_DIR=/tmp/v34-next-pipeline bash .claude/scripts/dp-pipeline-test.sh integration

# FixtureHTTP hiện còn chạy port18765; kiểmhealth trước, không start trùngtên.
# Nếu chưa có: bash .claude/scripts/dp-fixture-http.sh (process riêng).
V33_API_TARGET=http://127.0.0.1:18765 LOG_DIR=/tmp/v34-next-browser \
  .claude/scripts/dp-test.sh e2e

# Chỉ nếu websource đổi và đãpasschecks:
docker compose -f docker-compose.data.yml up -d --no-deps --build web-ui
```

Reference evaluator:

```bash
docker compose -f docker-compose.data.yml exec -T analytics-api \
  env AI_OFFLINE=1 DATA_ANALYST_ENV=development \
  DATA_ANALYST_SESSION_STORE=memory DATA_ANALYST_ARTIFACT_STORE=memory \
  python -m evals.semantic_reference_eval_v34 --out /tmp/v34-next-reference.json
```

**Không có lệnh paidfull có thể chạy ngay trong quyền hiện tại**: còn17, gatecapacity≥60. Sau khi candidatefinal+offlinegates và userduyệtceilingmới, runner là `python -m evals.live_acceptance_v33`, bắt buộc `--case-file evals/live_cases_v34.json --jobs --execute`, persistentledgerpath ở§4, ceilingđúngapproval và **outdirectorymới chưa tồn tại**. Không `--cases`subset để nghiệm thu. Outputdir/fsyncprobe phải được chuẩn bị trướcHTTP; runner đã cóguard này.

Không chạy `unittest discover` tùy ý trên APIproductionenv, không `docker compose config` hoặc `docker inspect` không lọc (lộenvsecrets), không `cat .runtime/db_credentials.json` hoặc `.env`. Không recreate API nếu chưa bảo toàn ledger/jobs/config.

## 10. Runtime/fixtures và gợi ý mở phiên mới

- API `avengers_analytics_api`, web `avengers_analytics_web`, DB/Redis/MinIO hiệnhealthy. UI8501/API8502. API cùngcontainer được giữ; không có full/live runner còn chạy lúc bàn giao.
- FixtureHTTP `v33-followup-fixture` cònUp, local18765. Fixturestack mới `avengers-v34-fixture-{postgres,minio,kafka,redis}-1` network-none namespace/nohostDBports; Redis16379 trongnamespace. Fixturecũ `v34-pipeline-{postgres,minio,kafka}` cũng cònUp đểgiữdiagnosis. Không nhầm với DBứngdụng.
- Muốn dừngfixturemới có `bash .claude/scripts/dp-pipeline-test.sh stop` (giữstate), khôngdown-v/prune. Phiênchốt chưastop để tránh mấtcontext của phiên tiếp.
- Goaltracker cũ trả `usageLimited`, objectiveA–Z cònnguyên. Không `update_goal complete`; không tựsetpaused/blocked vì đang chuyểnchat.
- Không bắt đầu thêmfeature khi chỉ được yêu cầu đọc handoff. Nếu user tiếp tụcgoal, xử lý remaining code/fixtures/operatordecisions, chốtfinalsource rồi fullgates; quota mới chỉhỏi saukhi cócandidateconcrete, không hỏi lại026/027/028/280.

Prompt gợi ý để dán vào phiên mới:

> Đọc `data-platform/AI_V34_IMPLEMENTATION_HANDOFF_20261018.md`, PLANV3.4 và progress; tiếp tục goal A–Z hiện còn IN_PROGRESS. Giữ workingtree/ledger/historicalfailures; không commit/push/reset/clean, không sửa hệ khác. Live hai full runs lần lượt35/40 và37/40FAIL, ledger263/280 chỉ17remaining. L11fix+auditspool cuối96targetedPASS/27PGfixturePASS nhưng chưafull/live lại; L41/L43cònmở, data/governance/CI/opsremaining đã ghi tronghandoff. Hoàn tất phần độc lập thật cẩn thận, không hạguard hoặc đổi denominator để xanh; không paidfull khi chưa có quota đủ và approval mới.
