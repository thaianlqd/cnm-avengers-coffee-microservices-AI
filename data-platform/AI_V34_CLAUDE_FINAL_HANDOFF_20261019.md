# V3.4 — bàn giao cho CLAUDE tiếp tục đến FINAL

Chốt **19/10/2026, khoảng10:25 Asia/Ho_Chi_Minh**. Người dùng yêu cầu file bàn giao vì Codex gần hết hạn mức. **PLAN vẫn IN_PROGRESS; chưa FINAL, chưa đủ release gates.** Không tiếp tục sửa sản phẩm trong lượt chốt file này.

## 1. Tiến độ và mục tiêu phải giữ

**Ước khoảng80% khối lượng triển khai**. Đây là ước lượng kỹ thuật, không phải tỷ lệ test PASS, điểm trưởng thành, hay phần trăm nghiệm thu. Phần nghiệm thu còn đáng kể: fullbackend mới nhất FAIL, live44 FAIL, batch chưa publication thật, F07 còn backend giả và frontend đang sửa dở.

Mục tiêu gốc: hoàn tất **toàn bộ NOW Phase0–8** của [PLAN](AI_V34_PLATFORM_MATURITY_PLAN.md), giữ nền V3.3, sửa đúng production, có evidence trên cùng candidate cuối. Không thu hẹp thành sửa riêng một case hoặc chỉ làm test xanh.

| Phase | Trạng thái ở checkpoint này |
|---|---|
|0 Baseline/inventory | Đã làm; phải cập nhật identity cuối vì source còn thay đổi |
|1 Consolidation/security containment | Đã triển khai phần chính; AST81services, chỉ2netnewservices; cần review blast radius cuối |
|2 Semantic/capability | Nhiều offline fixes và corpus PASS; live3 còn7failed, chưa nghiệm thu |
|3 Ingestion/DQ | Replica23nguồn đã bật thật và2vòng thành công; Kafka đang chạy nhưng producer có lock restarts; actual batch publication còn thiếu |
|4 Governance | Auth/ownership/audit/dedicated roles đã triển khai; user chốt chỉADMIN sử dụng; final route/resource matrix còn cần kiểm lại |
|5 Analytics/trust | Forecast/anomaly/Spearman/oracle/replay đã có code+fixtures; dữ liệu chưa có completeness certificate nên phải giữ unavailable/not_measured đúng nghĩa |
|6 UX | Analyst/lineage/save/export đã làm; F07 operational UI đang sửa dở, chưa deploy frontend cuối |
|7 Observability/scale | OTel opt-in, auditspool, SQLaccounting và preflight990 đã có; không có2APIprocess/networkload/7daySLO proof |
|8 Acceptance/CI | Chưa đạt. Fullbackend1239 có1failure+1error; live33/40; remoteCI/branchpolicy pending |

Đọc file này trước. [Handoff cũ](AI_V34_IMPLEMENTATION_HANDOFF_20261018.md)§0.1 và§0 là các checkpoint trước; các đoạn ledger263/Kafka standby/checkpoint0 bên dưới **đã lỗi thời**. [Progress](AI_V34_PLATFORM_MATURITY_PLAN.progress.md) là lịch sử, không phải mọi dòng đều còn hiện hành.

## 2. Workspace và hàng rào

- CWD `/Users/thaian/Documents/KLTN_Avengers_Coffee_System/cnm-avengers-coffee-microservices-AI`.
- Branch `branch_thaian`, HEAD `f9a1a6ff8d3c88e1bc9954c134d7cef8bdcd050b`. Working tree rất nhiều dirty/untracked; HEAD không định danh toàn candidate.
- Đọc `CLAUDE.md`, `.claude/rules/general.md`, `data-platform.md`, `token-budget.md` và skill thích hợp. Không commit/push/reset/stash/clean/rebase/restore. Không bỏ untracked hoặc hoàn tác thay đổi chưa biết nguồn gốc.
- Không đọc/in `.env`, credential files, tokens/cookies/passwords. Dùng factory cấu hình sẵn; chỉ xuất counters/booleans/hashes cần thiết. Không `docker compose config` hay inspect toàn bộ env.
- Không `down -v`, prune/delete volumes. DDL/grants/fact reconciliation ngoài gói đã duyệt cần approval cụ thể. Không ghi vào Supabase nguồn.
- Data Platform là phạm vi đang làm. Các tab IDE mới `load-tests/k6/customer-browse*.js` là ngữ cảnh đang mở, **không phải yêu cầu đổi sang k6/app customer**.
- Dùng Docker/Python3.11 và `.claude/scripts/dp-test.sh`; không dựng venv mới, không trực tiếp unittest discover trong env mainAPI. Test mặc định offline.
- Không sửa production source trong khi live acceptance đang chạy. Chốt mọi product edits, tests, identity rồi mới xin capacity và chạy full44.

## 3. Quyết định và approvals còn hiệu lực

| Quyết định/approval người dùng | Phạm vi đã được phép |
|---|---|
|Migrations026/027 và role DB giới hạn | Đã áp ownership/audit/checkpoints/publications và reader/writer/pipeline profiles; không blanket approval cho DDL khác |
|21snapshot-lock views028 | Đã áp zero-row boolean guard views; không mở rawPII SELECT |
|Business owner | **admin cho cả23nguồn** |
|Cadence/SLA | **300giây, trễ tối đa900giây**; không tự chứng nhận bounded late commits/completeness |
|Đối tượng sử dụng | **Chỉ ADMIN sử dụng Data Platform**; không mở manager/regional/customer. Các scoped adapter chưa hỗ trợ tiếp tục deny; không biến thành national access |
|Native Chrome | User cho phép kiểm tra Chrome đang mở; không thao tác nội dung không liên quan |
|Live323TOTAL/full44 | Đã dùng run3; **320/323, còn3**. Không đủ capacity cho fullrun mới |
|“Duyệt gói quyền và bật Kafka” | Đúng6GRANT,24cột/3rawtables trên rolepipeline hiện có, INSERTprojection+sequence, credential riêng; đã áp và bật |
|“oke bạn” cho replica review | Tạo2role riêng,26GRANT, canarymenu.danh_muc rồi full23targetreplica, atomicTRUNCATE+INSERT từng bảng,300s; đã áp và bật |

Replica review: [replica-rollout-review.json](evaluation/v34/implementation-20261019/replica-rollout-review.json). Kafka review: [streaming-rollout-review.json](evaluation/v34/implementation-20261019/streaming-rollout-review.json). Không hỏi lại các approvals này. **Chưa duyệt quota>323, batch role/grants mới, schema migrations khác, commit/push hay remote branch-policy changes.**

## 4. Live acceptance — tuyệt đối không làm mất lịch sử

Authoritative ledger: `/app/.runtime/provider-ledger/v33-live-http-ledger.json` trong mainAPI, mounted persistent. Chỉ kiểm hash/counters; không reset/copy ledger cũ đè lên.

- `reserved=320`, `events=320`, SHA256 **c86d3bd8e356afda5a0530ff8418134318b7a9462998504843ae1ab801c7f38b**.
- Chuỗi:151historical→160recovered conservative→161diagnostic→213run1→263run2→320run3.
- Trần323, còn3. Full44 runner bắt buộc **ít nhất60capacity** khi bắt đầu. Từ320, trần tổng tối thiểu cho một fullrun mới là **380**, cần user duyệt mới rõ ràng; chưa được phép dùng380.
- Egress đã duyệt: Google Gemini `generativelanguage.googleapis.com`, existing configured primary/secondary, câu hỏi+governed semantic metadata; không rawwarehouse rows/PII/credentials.

| Full run | Kết quả |
|---|---|
|1 |35/40useful, FAIL |
|2 |37/40useful, FAIL |
|3,19/10 |44/44,0skip; **33/40useful=82,5%,37/44overall,FAIL**; failedL01,L03,L20,L32,L33,L41,L43; **hard_failures[L03]** |

Run3 dùng57reservations=56externalHTTP+1injected503. Maxphysical/case2. Planningp95=3367,95ms,jobp95=4340,88ms. Không dùng latency tốt để bỏ qua semantic failure.

Evidence nguyên: `analytics-api/evaluation/v34/live44-20261019-r3/{authorization.json,result.json,result.cases.json}`. Captures: `tests/fixtures/v34_live44_rerun3_failed_intents.json`. Observer cũ không ghi granularity/comparison_time: field vắng là **unknown**, không phải bằng chứng model bỏ field. Observer mới chỉ thêm field cho lượt tương lai, không rewrite paid results.

Frozen cohort: `analytics-api/evals/live_cases_v34.json`, **44mandatory/40useful**, SHA256 **5fc5eb47fd515d314c5d1d7186a9306c5c262bfac4dca3c1d1ccc206d29bda2c**. Gate≥38/40, L03 phải đúng, không hardfail. Không sửa corpus/kỳ vọng/denominator, không ghép subset hoặc best-of-runs.

## 5. Semantic code đã sửa sau run3

- `semantic_candidate_service.py`: giảm menu alias không được yêu cầu về canonical; giữ exact metrics, qualifier axes, same-source/equivalent siblings và stored refinement IDs. Không sửa anchors gốc.
- `semantic_preflight_contract.py`: collapse unqualified alias claimants kể cả canonical đã có; vẫn giữ qualified meaning.
- `analytical_resolver.py`: reasonless nonrequested classification target cảavailability/reason; comparison shape target đúng fields thay vì unlock baseline.
- `hybrid_analyst_planner.py`: diagnostic probe thu independent/coupled conflicts trong boundedrepair, không grounding/execution/acceptance; normal merge/frozen guards giữ nguyên. SYSTEM làm rõ scalar2period và observationaldriver_delta.
- `analysis_intent.py`: repair optional fields có explicitnull để xóa field model tự thêm; omittedfield vẫn inherit. Không mở quyền sửa field không được target.
- `request_anchors.py`: loại selected_total không được yêu cầu trên nonadditive ranking, giữ TopN và independent companionpopulation.
- `tests/test_v34_live44_third_regressions.py`:9tests. L01 vàL43 replay đạt; L32 historicalrepair vẫn fail đúng, controlledrepair phải explicitclear orphanfeature_metrics. L33/L41 có synthetic variants vì historicalobserver thiếufields; không claim exactpaidreplay đã chữa mọi failure.
- Review độc lập phát hiện earlycomparisonguard targetnhầmcomparison_time; đã tái hiện/sửa. **34relatedPASS17,751s** sau sửa; baseline/target không được lén đổi.

## 6. Fullbackend mới nhất FAIL — việc đầu CLAUDE cần xử lý

Log: [post-review-backend-1239-failed.txt](evaluation/v34/implementation-20261019/post-review-backend-1239-failed.txt), bản gốc `/tmp/v34-20261019-post-review-final/backend.log`.

**1239tests/809,247s,1failure+1error**, không phải1239PASS:

1. `tests.test_semantic_recovery_boundaries.SemanticRecoveryBoundaries.test_provider_time_grammar_is_complete_in_primary_delta_and_repair`: `KeyError:'properties'`, line24. Test duyệt mọi `time.anyOf` branch như object, nhưng repair grammar vừa thêm `{type:'null'}`. Cần kiểm nullable branch đúng ngữ cảnhrepair, vẫn kiểm đầy đủ time-kind schemas/requiredfields; không xóa test/hạ frozen guards. Chưa sửa tại bàn giao.
2. `tests.test_v32_mission_reliability.HonestPreflightTests.test_preflight_stays_zero_call_and_fast`: avg56,1158ms>50ms cho20preflight. Cần tái hiện riêng, xem load/caching/cost rồi sửa nếu cần. Fullrun khi Kafka/data-sync/fixtures cùng chạy; đây là giới hạn đo cần ghi, **không tự gọi flaky rồi bỏ qua hoặc tăng ngưỡng50**. Benchmark990 trước đó p95=17,078ms không thay thế failure mới này.

Full1230PASS685,537s ở checkpoint trước run3 còn là lịch sử. Một fullbackend giữa hai checkpoint đã dừng bằngSIGINT để sửa reviewfinding; log `post-r3-backend-interrupted-for-review.txt`, không tính PASS. Hai targetedcommands từng gọi nhầm tên module không tồn tại; giữ logs, không cộng chúng thành fullPASS.

## 7. F07 đang làm dở — frontend đã sửa, backend chưa sửa

Đây là phát hiện cuối, **chưa hoàn tất**, cần ưu tiên trước FINAL.

### Backend còn số mẫu thật trong source

`analytics-api/routers/platform.py`:

- `get_platform_overview` line13: storage432.8/685.4/128.2MB, Kafka7partitions/2consumers/48.5msg/s/lag0, jobs3/timestamptháng9/SLAđạt, quality99.8/rules6/violations0, infrastructure luôn hoạt động. Bronze objects đang lấy projection DBrowcount, không phải S3objects.
- `get_data_lineage` line130: sốdòng/size/throughput/duration/status literals, sourceOLTP có node trỏ nhầmSilver.
- `get_lakehouse_details` line220: dunglượng/objects/tablecount/health literals.
- `get_streaming_details` line330: projectioncounts/timestamps có SQL thật, nhưng fallbackcounts/partitions/throughput/group/lag0/healthy giả; responsekey`live_events`.
- `get_pipelines` line422: jobs/DAGstates/times/durations/rows/SLA hoàn toàn mẫu, DAGID không khớp DAG thật.
- `get_data_quality` line543 đã delegate measured3checks đúng; `trigger_pipeline` line489 đã mô tả đúng **appendGoldKPIsnapshot**, không phải chạy Bronze→Silver→Gold.

Hướng sửa: giữ wirecompat và datasetpermissionguards; tách configured topology khỏi observed status. Chỉ dùng nguồn đọc thực có quyền hoặc trảnull/unknown/not_measured. Cached `data_coverage_service.peek()` đã xử lý expired. Quality3checks không đại diện toànkho. Projection counts không chứng minh lag/Bronze/Kafka health. `analytics.pipeline_publications` có DBpointer cũng không chứng minh objectmanifest verified/activejobs/Airflow schedule. Không mở DBgrants để làmdashboardxanh. Không in rawDBexception quaHTTP.

### Frontend source đã sửa sau khi fullbackend bắt đầu

Các file sau **đã lưu trong workspace, chưa rebuild container**:

- `src/store/usePlatformStore.ts`: fetchSystem đọc`lData.logs`, validatearrays, clearonerror, account/versionguard, isLoadingSystem; fetchStreaming đọc`live_events` vớicompat`recent_events`, clearonfailure; fetchPipelines error/versionguard.
- `src/views/SystemAdminView.tsx`: bỏ accounts/roles/logs mẫu, giữ loading/empty/error, kết nối hiển thị chưađo, màustatus theo dữ liệu.
- `StreamingView.tsx`, `PipelinesView.tsx`, `StorageView.tsx`, `ArchitectureView.tsx`: bỏ sampleevents/currenttimestamps/fakeKPIs/durations/rows/files/CDCtools chưa có. Thay bằng data được trả về hoặc configured/unknown. Các view này hiện không được mount trong App nav; không tự bật thêm nav.
- `src/components/PipelineLogModal.tsx`: bỏ Spark/MinIO/success/exit0 log tự dựng, chỉ metadata thực và trạng thái chưathu thậplog; không giả chạy lại medallion bằng KPIaction.
- `src/types/index.ts`: nullable unmeasured total_events/last_batch_run/active_jobs; optional DBpublications.
- `src/utils/platformData.test.mjs`: thêm3test wire/envelope/errorclear/stale-system-response.

**180webunitPASS, typecheckPASS, localbuildPASS**, logs`f07-web-*` trong evidence19. Chưa có browser/visualQA cho F07 mới, chưa bổ sung SSRempty-state/malformedpayload/browseradminlogs checks. `OverviewView` vẫn có null→0/growth fallback trong payload200 cần xem (errorgate đã có, đừng bỏ gate).

Served JS vẫn **`/assets/index-C-2PaRQr.js`** (hash0e36f68f… từ checkpoint trước); localF07build là **`/assets/index-BrCyyeAb.js`**. Không claim runtime khớp source. Sau sửa cuối phải typecheck/test/build, `up -d --no-deps --build web-ui`, đối chiếu asset hash và browser trên bundle mới.

## 8. Replica23nguồn — đã rollout thật, không apply lại

- Tool mới `analytics-api/tools/deploy_v34_replica.py`: default offlineplan. Tạo group`avengers_replica_writer` và login`avengers_dp_replica`, không reuse Kafka group.26GRANT=schemasUSAGE +SELECT/INSERT/UPDATE/TRUNCATE đúng23targettables +3syncmetadatatables +1historysequence. Helper không factDML/DDLtable/view/workeractivation.
- Private profile `/app/.runtime/replica-secrets/warehouse-replica.json`, parent0700/file0600; compose chỉ mount readonly thư mục này vào data-sync. Không đọc/in credential.
- `data-sync/sync.py` governedmode dùng profile riêng và precheck trước source/targetIO. SourceREADONLY/REPEATABLEREAD. Đã sửa globaljsonimport và chặn create_warehouse_views cuối governedcycle; không tự cấpCREATE.
- Canary thật`menu.danh_muc`: before23/source23/after23, checkpointgeneration1/unknown,0,740s; image/sourceSHA **0e234d31bf5a5ae2c318833bff63ee2b08fafa9f0fc3928adba05f05f23cbe3f**.
- Dừngoldworker trướccanary rồi bậtfull23 bằngapprovedflag. Vòng1 **23/23,191917rows,31,4s** lúc03:14:26UTC; vòng2 **23/23,124290rows,25,1s** lúc03:19:52UTC. Sốrowscycle2 gồm full/incremental, không phải tổngwarehouse giảm.
- Readback23checkpoint: generation>0, errornull,age<900s, completenessunknown. Replica không insertrealtime/update streamcursor/create table; Kafka khôngTRUNCATE replica. Chưa certify latecommit/completeness.
- Runtime `avengers_data_sync` running/restarts0, image **sha256:cd94e1ea3c32e4cafc9fe1b7d6685f441294c8ebfe67d54cda5e6e41c7e9153e**.
- Loop hiện đợi300s **sau khi vòng trước xong**; first→second start khoảng331s. Hợp đồng làexpected300/maxlag900; nếu cần strict start mỗi300s phải sửa lịch có test, không claim scheduler hiện strictwallclock300.
-40pipelineunitPASS1,112s; actualPG separate-role canary2lần +actualfullcycle23syntheticsources PASS1,733s. Fixturefullcycle chỉ1category vàotherempty; không là productionvolume proof.

Evidence: `analytics-api/evaluation/v34/replica-rollout-20261019-{applied,first-full-readback}.json`; `evaluation/v34/implementation-20261019/{replica-canary,sync-contract-review,sync-schema-pk-review,replica-rollout-review}.json`, replicaunit/fixturelogs.

## 9. Kafka — đã bật, còn lock/restart/backlog cần kiểm

- `tools/deploy_v34_streaming.py` áp đúng6GRANT/24columns/3streams theoreviewJSON; credentials existingpipeline được provision riêng, không mount toànAPIsecretstore.
- `private_database_profile` trong`pipeline-common/pipeline_runtime.py`:O_NOFOLLOW/regularfile/UID/mode/size/exact2keys; governedworkers không fallbackbroaden envcredential.
- Workerimages mới có sharedmodule/metadata. Runtime `DATA_PLATFORM_GOVERNED_STREAMING=1` lúcup đãáp; compose default vẫn0, **lệnh up sau này phải giữflag1** nếu muốnstreamactive.
- Producer cursor tiến sauack, consumer offsetcommit sauBronzechecksumdurable, DBprojectionreplayable. Actual3checkpointadvance,9/9partitionBronzechecksumverified; projection>17.000V3.4records tại initialreadback. Có backlog, chưa đo actual15min end-to-endSLA.
- Latest **producerrestarts3**, đều`LockNotAvailable` lúc03:02:44,03:19:37,03:19:42UTC; cursorpreserved/resume, consumerrestarts0. Cần đo conflict với replicaTRUNCATE/readlock, boundedretry/backpressure vàlag; không xóa cursor/resetoffset để đẹp số. Đừng mô tảworker ổn định0restart.
- Kafka producer image`sha256:8907365fbc4c99f4a33ed3d6a2a158c8c8b1555268e8965f52888e2d54d81f1f`; consumer`sha256:c35fc2df94c63989662b62b4815ae493d83f26add1b449cfc4ce910c2dfecb0d`.

Evidence: `analytics-api/evaluation/v34/streaming-rollout-20261019-{applied,initial-observation}.json`; `evaluation/v34/implementation-20261019/streaming-bronze-readback.json`. Không claim CDC haycanonicalSilver được cập nhật từKafka.

## 10. Batch publication còn thiếu

Code/fixtures cho run_id/as_of/input_manifest, immutableobjects, requiredoutputfences, transactionalDBpointer/replay đã có ở`pipeline-common/{batch_runtime,pipeline_runtime}.py`, `spark-jobs/{bronze_ingestion,silver_transform,gold_aggregation}.py`, `entrypoint.sh`, AirflowDAG. **Chưa chạy actual committed Bronze→Silver→Gold run sau replica rollout.**

- Bronze đòi checkpoint cho5sources; trước đây0rows nay23đãcó nên điều kiện đó mới có thực.
- `spark-jobs` compose vẫn dùng broadlegacyDBenv, chưa có batchprivateprofile/dedicatedread-writeDBrole. Không chạy thật bằngownerrole chỉ để qua gate.
- Không reuse/broaden Kafka profile: approvalstream chỉ24cột/3bảng. Nếu cần batchrole/grants mới, chuẩn bị exactplan+fixture+image rồi xinuserduyệt riêng.
- BronzeQUERIES còn lấyaddress/notes không dùng trongGold; reviewthu hẹpprojection/privacy trước rollout. IDs phục vụ customer/shipperstats có sử dụng; không bỏ tùy tiện làm sai thống kê.
- Sau approvedrun: xác minh objectmanifest+hash+quality+runID trêncả3layers vàDBpointer, giữoldpublishedrun khi lỗi; đối chiếuGold/marts/Analyst cùnggeneration. Không thay`to_sql(replace)` hay sửaSilverfacts để épPASS.
- Airflow profiletools hiện không chạy. Không bịaDAGsuccess/nextschedule. pandas/Parquet hiện làruntimebatch, không claimSpark/Trino/Debezium/Delta chưa triển khai.

## 11. Các phần đã có cần bảo toàn

- L41 typed comparison_time baseline, compile2aggregate riêng, delta/%/NULLzero vàfrozenperiodguard. L43 compiler-ownedselectedcohort +companionpopulation riêng, fullkeysetverification/replay.
- Source-lineage inspect→new-analysis validate ownedapprovedrevision/catalog/fulltypedkey/artifact/metric/time/filterintersection trướcprovider/SQL; UIediteddraft bỏref; persistedprovenance.
- AccountedReaderCursor chia sẻQueryBudget19 choexecutor/dryrun/metadata/directreader, reservebeforeattempt/failure/fetchbound, khôngdoublecount. Transactioncontrols/writer/pipeline/separatereadiness-backgroundfactory ngoài coverage đã disclose.
- Auditspool runtime đãbậtprivate0700/0600, bounded/fsync/flock/idempotentreplay; actualsaveaudit0pending. Không giảDBoutage ởproduction.
- OTelAPI1.39.1 opt-in default0/noSDK/exporter/egress, controlledspans/redaction/dropcounters/threadcontext.
- Identity login opaque server session; SQLdefaultdisabled; ownership/revocation/export/oracle/session/artifactguard; ownerlesslegacyquarantined. ChỉADMINđượcrollout, không choauto-claim.
- CI5jobs source/offline/fixture/browser/scanner, pinnedGitleaks8.30.1 digest; localpositivecontrol có phát hiện. RemoteCI/requiredbranchrules chưa cóvì khôngpush.
- LastAST81services394edges78reachable/largestSCC58 (baseline60); handoff inventory **210source/config/docs files**, vượt estimate95–120. Không checount bằngdynamicimports.

## 12. Evidence đã đo và giới hạn

| Gate | Latest known |
|---|---|
|Backend |1239/809,247s **FAIL1+ERROR1**, trướcF07backendfix |
|Targeted semantic/review |34PASS17,751s |
|Offline semantic |146old +33V33 +120V34 PASS sau run3fixes, trướcearlycomparisonreviewfix nhỏ |
|Authored reference |120PASS=83compiled/37terminal; hash**8b6f9164fde3a3dad0b43c27c6da75c2d8e137b561abefd975afbc55605aaefa** |
|Pipeline fixtures |35PG/Kafka/MinIOPASS10,999s;31API/PG/RedisPASS8,094s trước replica additions; separate replica fullcyclePASS1,733s |
|Web |180unit/typecheck/buildPASS sau F07frontend; chưa deploy |
|Browser |32PASS55,8s trước F07frontend;28mock+4HTTPfixture; không dùng để claimF07QA |
|Preflight990 |200/990all,0warehouse/0external; cold247,779ms,warmp50=14,608/p95=17,078/p99=19,738/max49,927ms; serialASGI33syntheticprincipals/Linuxaarch64/Python3.11.17/RSS142168KiB; trướclatestsource |
|Source scanner |803files/~64,81MBclean ởcheckpointcũ; **chưa scan latestsemantic/replica/F07/docs/artifacts** |
|Real Chrome |GuidedSeptember→save→reopen đúngreport440072000VND/5points/1chart; actualWorddownload85049bytes; trướcF07 |
|Live |Run3 FAIL33/40; ledger320/323 |

Evidence mới vàfailedlogs đãcopy vào `data-platform/evaluation/v34/implementation-20261019/`. Không rewrite historicalruns/manifests. Current source manifest riêng của handoff không phải releaseapproval.

Manifest mới: [claude-handoff-source-manifest.json](evaluation/v34/implementation-20261019/claude-handoff-source-manifest.json),210files kèm hashes, loại runtime/secrets/evaluation/build/cache và k6 ngoài phạm vi. Tracked diffSHA **5be8ee9de8f292f6b6e840aa9fe3327c8c9655dc8ce194848034fe05442dfa24**; không dùng hash này thay untrackedfile hashes hoặc kết quả gate. Manifest ghi rõ chưa scan source cuối.

## 13. Word renderQA còn vướng runtime

Actual filedownload `/Users/thaian/Downloads/Đơn_hàng_và_doanh_thu (1).docx`,85049bytes; chưa renderPNG/kiểm bốcục. Không inspect unrelatedDownloads.

Documents skill đã áp: [Documents SKILL.md](/Users/thaian/.codex/plugins/cache/openai-primary-runtime/documents/26.921.10847/skills/documents/SKILL.md).

Instruction đã đọc: “Use Codex workspace dependencies for docx artifact work: resolve them through the workspace dependency loader or runtime skill” và “Do not use system `node`, system `python`, global npm packages, or repo-local installs.” Skill còn yêu cầu bundledLibreOffice qua`load_workspace_dependencies`, không dùngdesktopLibreOffice, `render_docx.py`→xem mọiPNG.

Codex session không cóworkspace dependencyloader/runtime này; không bypass. CLAUDE cần theo tools/skill thực sự có trong môi trường của mình, ghi đúng giới hạn nếu không có renderer; không coiOOXML/ZIPcheck làvisualQA, khôngclaimWordlayoutPASS.

## 14. Thứ tự tiếp tục để đến FINAL

1. Đọcstate/approvals; kiểmledger320/hash vàruntime; khôngapplylạiroles/profile. Chạy targeted2backendfailures, sửa đúnggrammar/performance, giữlogfailure.
2. Hoàn tấtF07backend+frontendwire/null/empty/error/status; bổ sungmeaningfulregression/browser/SystemAdmin. Không sửaquyền đểlàmUIxanh. Review diff và cácfileUI đãrewrite, đừng restoretùy tiện.
3. KiểmKafka lock/restarts/backlog thực; giữoffset/idempotency/durability. Kiểmreplicahealth nhiềuvòng/cadence thực, sourceunknownhonest; không tựcertifycomplete.
4. Chuẩn bịvàkiểmthửbatchprivateprofile/minimalgrants/image; xinapprovalnếucần, chạy actualrun/publication/parity. Không mượnowner/Kafkarole.
5. Chốtmọiproductedits. Chạy fullbackendchuẩn,web/eval/reference/fixture/browser; điều tra mọifailure. Chạy lại chỉ khi cóchange/failure/cụ thểconcern, khôngspamfullsuite.
6. Deployđúngsource: web-onlyno-depsbuild; APIrestartcùngcontainer chỉsau0activejobs, startupDDLdisabled, ledgerpersistentgiữnguyên. Khôngrecreate/resetAPIledger. Verifyservedhash,readiness/auth và0AIguided/save/reopen/export trên runtimecuối.
7. Cập nhậtAST/source/config/catalog/policy/contracts/image/bundlemanifest, scan source+generatedartifacts trướcupload. Không đọcsecretstores đểscan.
8. Saucandidateđãquaofflinegates: xinuserduyệt **total≥380/full44** (tại320cần≥60). Ghiapproval+hash rồi full44 quaAnalysisJobs/cùngcorpus/kỳvọng. Không dùng3remaining cho subset. NếuFAIL, giữevidence,sửaofflinevàxinbudgetđúngchofullnếuthiếu.
9. Hoàn tấtWordvisualQA vàci/adminpolicy trongquyềnmôitrườngthực. Repo cấmcommit/push: không tựvượt đểremoteCIgreen; cầnuseraction/authorization cụthể. Pendinggatephảighiđúng, khôngforgeFINAL.
10. MatrixF01–F18→code→test→actualresult→remaining; đốichiếu§33/§36PLAN. ChỉđánhFINAL/COMPLETE khiDoDthựcsựđạt,khôngđổi scoreprojection thànhachieved.

## 15. Lệnh đã kiểm chứng

```bash
git status --short
git diff --stat

LOG_DIR=/tmp/v34-next-targeted .claude/scripts/dp-test.sh module \
  tests.test_semantic_recovery_boundaries tests.test_v32_mission_reliability \
  tests.test_v34_live44_third_regressions tests.test_v34_period_comparison

LOG_DIR=/tmp/v34-next-web .claude/scripts/dp-test.sh web
LOG_DIR=/tmp/v34-next-unit bash .claude/scripts/dp-pipeline-test.sh unit
LOG_DIR=/tmp/v34-next-integration bash .claude/scripts/dp-pipeline-test.sh integration

# Khi mọi product edits đã chốt:
LOG_DIR=/tmp/v34-next-backend .claude/scripts/dp-test.sh backend
LOG_DIR=/tmp/v34-next-eval .claude/scripts/dp-test.sh eval
docker compose -f docker-compose.data.yml exec -T analytics-api \
  env AI_OFFLINE=1 DATA_ANALYST_ENV=development \
  DATA_ANALYST_SESSION_STORE=memory DATA_ANALYST_ARTIFACT_STORE=memory \
  python -m evals.semantic_reference_eval_v34 --out /tmp/v34-next-reference.json

# FixtureHTTP đang chạy; đừng starttrùngtên. Nếu cầnrestart, đợi --rm cleanupxong.
curl -fsS http://127.0.0.1:18765/health
V33_API_TARGET=http://127.0.0.1:18765 LOG_DIR=/tmp/v34-next-browser .claude/scripts/dp-test.sh e2e

# Web-only deploy sauchecks, không recreateAPI dependencies:
docker compose -f docker-compose.data.yml up -d --no-deps --build web-ui

# Giữ cảhaiapprovedflags khi up cácworkers sau này:
DATA_PLATFORM_GOVERNED_INGESTION=1 DATA_PLATFORM_GOVERNED_STREAMING=1 \
  docker compose -f docker-compose.data.yml up -d --no-deps data-sync kafka-producer kafka-consumer
```

Không chạy paidcommand ngay. Sau**approvalmới** mới dùng `evals.live_acceptance_v33 --approved-ceiling <approvedTOTAL> --execute --jobs --case-file evals/live_cases_v34.json --ledger /app/.runtime/provider-ledger/v33-live-http-ledger.json --out <fresh-run>/result.json`. Giữsource/corpuskhôngđổitrongrun.

Docker/localbrowsernetwork cần quyềnthực thi ngoài sandbox trongmôitrườngCodex hiện tại; toolđãđượcreviewchophépchoactionsđãduyệt. CURLkhôngescalated cóthểbáoconnectionrefuseddùfixturehealthy; đãxácminhngoàisandboxHTTPfixture200. Khôngsuyđoánfixturechếttừmộtlệnhsandboxfail.

## 16. Process/runtime tại bàn giao

- Không còn fullbackend/live/provider runner đang chạy. LastfullbackendđãkếtthúcFAIL. Web180checkskếtthúcPASS. ChỉcácserviceđượcbậttheophêduyệtvàHTTPfixturecònchạy.
- MainAPI`avengers_analytics_api` running/restarts0,image`sha256:44b8965bdf052c334c351b58dd0521e58e6f7a5a55c26bfec638c52a3acaabc0`; sourcebindmountkhôngchứngminhprocessđãreloadmọiedits. Chốt0activejobs/restart/identitycuối.
- Web`avengers_analytics_web` running/restarts0,image`sha256:cfc11ea4c77906fad90c7378276f11370415a960e23d865c629b0d33ad557124`; vẫnassetcũC-2PaRQr.
- HTTPfixture`v33-followup-fixture` port18765 đangrunning,readonlyAPIsource,0externalHTTP; khởitrướcF07backendfix. KhiđổiAPIphảirestartfixtuređúng vàhealthtrướcbrowser. KhôngstopmainAPIđểđổi fixture.
- Isolatedfixtureproject`avengers-v34-fixture` cóPostgres/Redis/Kafka/MinIO; giữstate/logs,khôngdown-v.

## 17. Prompt giao CLAUDE

> Đọc `data-platform/AI_V34_CLAUDE_FINAL_HANDOFF_20261019.md` trước, rồi PLAN§33/§36 và repo rules. Tiếp tục toàn bộ NOW V3.4 đến goals FINAL, không chỉ sửa subset. Hiện khoảng80% implementation nhưng chưa nghiệm thu: full1239 có1error timegrammar nullable và1preflightperf56ms>50; live3=33/40FAIL/hardL03,ledger320/323,còn3. ChỉADMIN sử dụng. Replica23nguồn vàKafka đã đượcduyệt/cấpđúngrole/bậtthật,khônghỏilại/khôngresetprofile; producer3lockrestarts cầnxửlý. F07frontendđãsửabỏmẫu/180tests/type/buildPASSnhưngchưadeploy; backendplatform5routesvẫncònsốmẫuchưasửa. Batchactualpublication/WordrenderQA/finalgates/remoteCIcònthiếu. Khôngcommit/push/reset/clean,khôngđọcsecret,khôngpaidcallnếuchưaapprovalmớivà≥60capacity. Hoànthànhworkđộclập,chuẩnbịexactreviewableactionsrồimớixinapprovalcầnthiết. Giữfailedruns/corpus/kỳvọng/ledger,khôngnớisafety/khôngclaimCOMPLETEtrướcevidence.
