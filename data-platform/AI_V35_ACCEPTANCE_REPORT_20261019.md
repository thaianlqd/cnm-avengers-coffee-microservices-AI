# Nghiệm thu V3.5 ngày 19/10/2026

**Trạng thái: LOCAL VERIFIED, RELEASE PENDING — chưa FINAL.** Bản sửa lỗi Overview 503 đã được triển khai và qua quan sát15 phút. Full backend 1.299/1.299 và các evaluator/unit pipeline cuối đã xanh. Nguồn và chứng cứ được đóng băng trong candidate-manifest.json; kết quả quét nằm ở secret-scan.json. CI đúng candidate commit và required branch rules còn thiếu. Không lấy CI của HEAD cũ làm chứng nhận cho working tree V3.5.

## Bản đang dùng

Login có nền café local/form bên phải. Báo cáo có16 dashboard nghiệp vụ, mỗi bài toán3–7 biểu đồ; BI/AI dùng chung ReportWorkspace với KPI gọn, chart cao214 px, lưới8/4 hoặc6/6, mobile 1 cột. Trả lời ngắn, giải thích, kết luận, giới hạn, định nghĩa chỉ số và nhận định đều đóng mặc định, bấm mới mở. Tab Kiến trúc có14 thành phần và hai đường dữ liệu; sơ đồ cấu hình không tự nhận là health monitor.

Chỉ tab **Trợ lý AI** được khởi tạo luồng gọi provider. Preset bị chặn trước logical/physical reservation và tại job ledger. Xem/lọc/inspect/lưu/xuất không gọi provider. Rời Trợ lý AI gửi hủy tác vụ sở hữu; request đã gửi ra trước đó không thể thu hồi. ADMIN là role duy nhất, có system.read và SQL Explorer trusted_admin; không hardcode quyền phía trình duyệt, không biến PostgreSQL roles thành người dùng ứng dụng.

## Lỗi503 và bản sửa đã triển khai

Nguyên nhân đã bắt được: PostgreSQL 55P03 khi worker giữ khóa TRUNCATE trên bảng replica trong suốt remote fetch và proof scan, làm hai đường Overview hết lock_timeout 2 s. Bản sửa dùng temp stage trong session, DELETE khóa không còn và upsert chỉ dòng thay đổi; dữ liệu/proof/checkpoint vẫn commit cùng transaction. Reader tiếp tục nhìn generation đã commit.

User duyệt rõ “Duyệt cấp DELETE và rollout”; đã cấp đúng23 target tables cho avengers_dp_replica, không sửa quyền nguồn/schema/offset. Canary118 sản phẩm PASS 0,818 s, generation93→94. Worker image63596b55… chạy từ13:21:48UTC; [gói quyền và rollout](evaluation/v35/implementation-20261019/replica-mvcc-rollout-review.json), [receipt](evaluation/v35/implementation-20261019/replica-mvcc-grants-applied.json).

Sau rollout: **182 lần gọi hai handler Overview trong900 s,0 lỗi**, chậm nhất2,349 s. Chrome thật reload hiện174.347.500 đ / 1.696 đơn ở kỳ30 ngày. Đây là direct handler/read-only probe; không thay cho gate HTTP/auth. [Overview proof](evaluation/v35/implementation-20261019/overview-mvcc-validation.json).

## Kiểm chứng

Đường dẫn trong bảng tương đối với `evaluation/v35/implementation-20261019/`.

| Gate | Kết quả hiện hành | Bằng chứng |
|---|---|---|
| Full backend | 1.299/1.299 PASS, 0 failure/error/skip, 737,877 s; network none, 1 CPU / 1 GiB; nguồn hiện tại khớp bản đóng băng | [local-validation.json](evaluation/v35/implementation-20261019/local-validation.json) |
| Affected resource/snapshot/jobs | 27/27PASS59,815s; test12!=6 đỏ trước sửa | /tmp/v35-reader-envelope-green.log |
| Web/types/build | 183/183PASS, typecheck/buildPASS; không đổi web sau bản đã triển khai | local-validation.json |
| Browser | UI35/35PASS52,3s; HTTP4/4PASS11,4s trước thay đổi trình bày; affected BI/AI currency journeyPASS5,5s | [compact-ui-validation.json](evaluation/v35/implementation-20261019/compact-ui-validation.json) |
| Semantic offline | Fresh 146 cases, compile 108/108, V33 33/33, V34 120/120; authored reference 120/120, 83 compiled intents; 0 failure | local-validation.json |
| PostgreSQL pipeline | 27/27PASS8,190s, gồm2MVCC regressions đỏ→xanh; unchanged tuple/old reader/rollback/parity | [rollout review](evaluation/v35/implementation-20261019/replica-mvcc-rollout-review.json) |
| Pipeline/worker unit | 58/58 pipeline PASS 0,709 s; worker/certificate 21/21 PASS 0,023 s, network none | local-validation.json |
| Real Kafka/MinIO/batch | 15/15PASS144,974s; offset replay, sink failure, dedup, quarantine, immutablepublication và retry | [pipeline-broker-validation.json](evaluation/v35/implementation-20261019/pipeline-broker-validation.json) |
| Hai process faultmatrix | 5crashwindows PASS; SQLcancel0,506s; revoke4stages; ≤3send;16halfopen→1probe; drain/Redisoutage | [two-api-fault-matrix.json](evaluation/v35/implementation-20261019/two-api-fault-matrix.json) |
| Reader pool cuối | Hai process PG thật6+6; thứ7/APItypedexhaustion; sau trả kết nối pool_used=0 | [two-api-reader-pressure-current.json](evaluation/v35/implementation-20261019/two-api-reader-pressure-current.json) |
| Load đại diện | 0,5 CPU/384MiB mỗiAPI:15profiles1/4/8/12/20×3,111completed/24expected429,0 provider HTTP; maxp9924.613,077ms | [two-api-load-profiles-representative.json](evaluation/v35/implementation-20261019/two-api-load-profiles-representative.json) |
| Ops15 phút | 1543/1543operations, exactcounter793+750,60/60jobcontext;0failure/HTTPprovider | [operational-soak.json](evaluation/v35/implementation-20261019/operational-soak.json) |
| Runtime sau MVCC | 16samples/900 s,23healthy,maxlag327,324s;4workerrestartdelta0; backlog360.228→318.767 | [runtime-post-mvcc-soak.json](evaluation/v35/implementation-20261019/runtime-post-mvcc-soak.json) |
| Critical parity mới | Fullprojection: orders40.460/items72.063/stores1.215/products118 khớp; generation96/96/98/98 trong targetMVCCsnapshot | [critical-readonly-parity-post-mvcc.json](evaluation/v35/implementation-20261019/critical-readonly-parity-post-mvcc.json) |
| Gold/marts/Analyst | Nhập cùng actualAnalyst exported snapshot; 40.460đơn/4.373.803.500đ alltime khớp; batch khácrun ghi incomparable | [cross-path-parity.json](evaluation/v35/implementation-20261019/cross-path-parity.json) |
| Risk thật | Admin đóng kỳ09/2026;28baselinebuckets, cancellation4,58%/expected4,31%, within_baseline;0 AI | [real-september-risk.json](evaluation/v35/implementation-20261019/real-september-risk.json) |
| Identity hiện hành | Policy3.5.0,65protected/0undeclared/0stale; chỉADMIN;6readers; ledger457/events457/hashb3c07ac…không đổi | [runtime-final-identity.json](evaluation/v35/implementation-20261019/runtime-final-identity.json) |
| Remote release | Applicablebranchrules=[]; CI successful gần nhất vẫn HEADeda390b8, chưa chứa dirtyV3.5 | [remote-release-current.json](evaluation/v35/implementation-20261019/remote-release-current.json) |

Giữ nguyên bằng chứng thất bại ở0,15CPU/API và full backend0,5 CPU; không nới timeout/assertion để lấy xanh. Fixture Kafka ban đầu0,15CPU gây offsetcommit timeout thật; đổi riêng brokerfixture sang0,5 CPU, client phục hồi và đủ15testsPASS. Không đổi cap runtime, offset/group/volume thật.

## Giới hạn dữ liệu và tài nguyên

Runtime giữ các giới hạn: API 0,50 CPU / 1.024 MiB; MinIO 0,20 CPU / 768 MiB (Go heap 384 MiB, GOMAXPROCS=1); producer 0,10 CPU / 256 MiB; consumer 0,15 CPU / 384 MiB; replica 0,20 CPU / 384 MiB. Mỗi API có 2 worker, 6 kết nối đọc trong pool và 2 snapshot coordinator. Hai API có tối đa 12 kết nối đọc trong pool; metadata, readiness, audit, writer và kết nối trực tiếp được đếm riêng. Admission vẫn là 12 tác vụ toàn hệ thống và 4 mỗi tài khoản. Các fixture đã dừng trước full backend; không bật Spark, Airflow hoặc collector.

Các soak là phép đo cục bộ có giới hạn, không phải productionSLO. Producer có absoluteRestartCount10 từ trước cửa sổ mới; restartdelta trong15 phút là0. Kafka backlog vẫn đang xử lý, chưa caught-up. Dashboard đọc replica; không suy ra Silver realtime từ Kafka lag. Bronze9/9partition checksum có bằng chứng riêng; không resetoffset để làm đẹp lag.

23nguồn do admin phụ trách, nhịp300s/SLA900 s. Snapshotparity khác chốt kỳ nghiệp vụ: chỉ đơn/chi tiết09/2026 được user xác nhận đóng. DA_DUYET hợp lệ nghĩa “đã duyệt”. D15 vẫn verification=attention; khảo sát12phản hồi thiếu chi nhánh giữ nhóm chưa phân loại. D08/D14/D15 mặc định alltime có nhãn; kỳ trống không lấp0.

## 19 nhóm: chứng cứ và chấm điểm

Không tự chuyển target thành điểm achieved. Bảng dưới là đối chiếu chứng cứ local; Testing/release và đánh giá19 nhóm vẫn pending trước FINAL. Không dùng trung bình che gate thiếu.

| Nhóm | Chứng cứ hiện có / giới hạn |
|---|---|
| Ingestion | Cursor/ties/late/delete/schema/crash/atomicproof/MVCC; PG27 và real4sourceparity; batch15integration |
| Streaming | Actualbrokerreplay/fault/Bronze, deployed15minrestartdelta0; backlog công bố, không CDC/exactlyonce |
| Semantic | Catalog/compiler/reference giữ nguyên identity; offline146/33/120; full backend cuối xanh |
| NL | Preservedrun6; giữ review8,1 lịch sử, chưa tự nâng thành target8,2; khôngpaidrerun |
| Capability | READY/CLARIFY/REDIRECT/UNSUPPORTED và zeroI/O preflight regressions |
| SQL | AST/readonly/audit/ADMIN/cancel/snapshot; actualpool6+6/exhaustion/release |
| Provider | Dashboardforbidden, immutable457ledger, reservebeforesend, sharedcircuit/crashmeter;0 unapproved calls |
| Forecast | Preserve commonfolds/interval/insufficienthistory regressions, không thêmmodel |
| Risk | RealcertifiedSeptember và unknown/stale/exposure guards,0 AI |
| Correlation | Preserve paired/exposure/constant/noncausal contracts |
| Chart | 16 real presets/3–7charts/requirementIDs; inspect/denominator/crosspathproof |
| Trust | Samegeneration MVCC oracle/marts/Analyst; differentbatch/definition incomparable; no fakezero |
| UX | Loginactual/mobile, ADMIN, compact35browserjourneys, closeddisclosures; Word visual QA hoãn theo user |
| Testing | Required local gates xanh; sixjobCI workflow có thêm2API/load/fault/900 ssoak, remotecandidateCI chưa chạy |
| DQ | 23contractmeasurements/18criticalnegatives/4criticalrealproofs; closure chỉ kỳ đã duyệt |
| Governance | Route100%/ADMINpolicy/DBleastprivilege/durableaudit; branchrules pendingrepo admin |
| Ops | Exacttwo-targetcounter/trace/privacy/audit/900 s; runtime23sources; khôngproductionSLO |
| Scale | TwoOSprocess/CAS/fairness/load/crash/cancel/revoke;6readerbudget đúngPLAN |
| Maintainability | CùngASTinventory81modules/409edges/SCC58→51; noanchors→planner/provider→session reverseedge; oneReportWorkspace/actions/tabowner |

## Phần còn lại trước FINAL

1. User commit/push candidate theo quy tắc repo; CI phải xanh đúng SHA đó. Repo admin cấu hình và kiểm chứng actual required checks cho sáu job Data Platform. Agent không commit/push hoặc thay quyền branch.
2. Chốt điểm 19 nhóm sau review chứng cứ và remote gate. Word visual QA hoãn theo yêu cầu user; không dùng XML test thay visual proof. Không nâng quota, reset ledger hoặc gọi paid provider.

## Kiểm tra nhanh và rollback

Reload localhost:8501 → Tổng quan có số liệu. Báo cáo → D01/D03/D08/D14 có nhiều biểu đồ; lời giải thích/kết luận đóng, bấm mở/đóng; đổi kỳ/phạm vi đúng scope, kỳ trống có thông báo. Explorer → SELECT COUNT đơn; System → ADMIN/policy truth. Kiến trúc → chọn Kafka/MinIO/replica xem hợp đồng, không tự bật dịch vụ. Ngoài Trợ lý AI không gọi provider.

Rollback worker chỉ khi phát hiện lỗi: dừng có kiểm soát, dùng image cũ đã ghi trong rolloutreview, giữ committedsnapshot/checkpoint/offset. Không chạy TRUNCATE/repair hoặc revoke grant ngoài quyết định rollback được duyệt; không xóa volume. UI đã phục vụ bundle index-BaIpSnt1.js, hash0d2b79ca… theo served-ui.json.
