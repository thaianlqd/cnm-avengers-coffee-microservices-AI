"""Close finite qualification only when durable critical receipts actually pass."""
from pathlib import Path
import json,hashlib,statistics
from datetime import datetime,timezone
E=Path(__file__).resolve().parent;DP=E.parents[1];A=E.parent/'ai-system-audit-20261021'
def read(n):return json.loads((E/n).read_text())
def put(n,d):(E/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
backend=read('codex-regression-policy33-final/effective-final.json');offline=read('codex-offline-policy33-final/result.json');live=read('codex-live-policy33-final-review.json');matrix=read('codex-acceptance-matrix-policy33-final.json');source=read('codex-source-policy33-final-verification.json');bundle=read('codex-served-bundle-policy33-final.json');browser=read('codex-browser-policy33-final-v2/receipt.json');facts=read('codex-browser-policy33-artifact-review.json');web=read('codex-consolidated-web-policy33-final.json');word=read('codex-word-policy33-final-native/visual-review.json');domain=read('codex-domain-matrix33/result.json')
assert all(v['passed'] for v in [backend,offline,live,source,bundle,facts,domain])
assert backend['unique_tests']==1704 and backend['modules']==107
assert matrix['counts']=={'PASS_FINITE_ASSERTIONS':54}
assert live['positive_ai_first_pass']==live['positive_ai']==9 and live['physical_sends']==9 and live['semantic_passed']==12
assert web['passed']==95 and web['optional_skipped']==2 and len(browser)==12
assert word['status']=='PASS_FINITE_VISUAL_QA' and sum(len(x['reviewed_pages']) for x in word['cases'])==12
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in read('codex-source-policy33-final-tests-updated.json')['files'].items())
cs=json.loads((A/'codex-qualification-policy33-live-20261022.json').read_text());times=[c['elapsed_seconds'] for c in cs]
manifest=read('codex-qualification-policy33-live-20261022-manifest.json')
assert [(c['id'],c['payload']) for c in cs]==[(c['id'],c['payload']) for c in manifest['frozen_cases']]
refs={
'G00':('Baseline, frozen source/corpus và lịch sử attempts','codex-source-policy33-final.json'),
'G01':('Hợp đồng nghĩa, adapters, 448 template outcomes','codex-offline-policy33-final/advertised-roundtrip.json'),
'G02':('55 nhãn tỉnh nguồn, identity/rare/permission controls','codex-offline-policy33-final/result.json'),
'G03':('Mission/risk clock parity, presets và zero-AI paths','codex-regression-policy33-final/effective-final.json'),
'G04':('Cohort keys, independent A–F/raw ratio/AOV/distinct','codex-offline-policy33-final/result.json'),
'G05':('Goal/lens/depth, 26 domain × 3 mật độ × 3 độ sâu','codex-domain-matrix33/result.json'),
'G06':('Provenance, numeric/claim mutations, chart/text/export','codex-acceptance-matrix-policy33-final.json'),
'G07':('Authority/cache/revision/epoch/idempotency/recovery','codex-regression-policy33-final/effective-final.json'),
'G08':('Browser interactions, responsive layout, 0-AI insight toggles','codex-browser-policy33-final-v2/receipt.json'),
'G09':('107 module + independent oracles + 54 ca hữu hạn','codex-acceptance-matrix-policy33-final.json'),
'G10':('Fixed12 live, 9/9 AI first-pass, same-generation oracle','codex-live-policy33-final-review.json'),
'G11':('Served build/image/hash/healthy smoke','codex-served-bundle-policy33-final.json'),
'G12':('Markdown nghiệm thu, evidence và giới hạn công khai','../../AI_DATA_ANALYST_NGHIEM_THU_20261022.md')}
gates=[dict(id=k,status='PASS_FINITE_SCOPE',meaning=v[0],evidence=v[1]) for k,v in refs.items()]
result=dict(goal_status='DONE',qualification='QUALIFIED_FINITE_PLAN_SCOPE',completed_at=datetime.now(timezone.utc).isoformat(),serving_policy=bundle['versions']['plan'],input_policy=bundle['versions']['input'],quality_verifier=bundle['versions']['verifier'],gates=gates,open_critical_gates=[],known_unresolved_software_P0_P1=[],backend=backend,live={k:v for k,v in live.items() if k!='cases'},web={k:v for k,v in web.items() if k!='cases'},source=source,
 live_usage=dict(input_tokens=sum(c['diagnostics'].get('input_tokens')or 0 for c in cs),output_tokens=sum(c['diagnostics'].get('output_tokens')or 0 for c in cs),elapsed_seconds=dict(min=min(times),median=statistics.median(times),max=max(times))),
 limitations=['Finite fixed known-incident qualification and pairwise coverage; not blind unseen-language accuracy or an exhaustive metric Cartesian product.', 'I13 source geography is not owner-verified; no data migration. Warning remains in report/export.', 'Sharded process/module backend, documented test-only recheck; no monolithic qualification.', 'p95 gates passed at 2CPU/1.5GiB; no 50ms SLA for serving0.5CPU.', 'Two optional browser checks not executed: live full catalog layout and external OpenFreeMap street-tile availability.', 'Source epochs observed per dataset, not upstream transactional completeness. Forecast intervals/backtest not guaranteed future accuracy.', 'Native Word visual QA uses 12 fixture pages on frozen exporter; actual HTTP export content checked separately.'])
put('codex-qualification-policy33-final.json',result)
base='evaluation/ai-system-reliability-impl-20261021/'
def link(label,n):return f'[{label}]({base+n})'
md=f'''# Nghiệm thu AI Data Analyst — 22/10/2026

**Goal tổng: DONE — nghiệm thu trong phạm vi hữu hạn của PLAN G00–G12 và T1–T9.**

Bản localhost đã kiểm chứng: plan policy `2026-10-22.cohort-scope.33`, input policy `1.2.5`, quality verifier `2.8.8`. Các critical gates đã có kết quả cuối; không còn lỗi phần mềm P0/P1 đã biết trong phạm vi nghiệm thu. Không sử dụng tỷ lệ tiến độ tự ước lượng 70%/99% làm phép đo.

## 1. Kết quả nghiệm thu

| Cổng | Kết quả và phạm vi bằng chứng |
|---|---|
| Backend | **107/107 module, 1.704 test duy nhất đạt sau kiểm lại test fixture**; 0 failure/error hiệu lực, source sản phẩm giữ nguyên sau freeze |
| Offline semantics | **146/146**; V33 **33/33**, V34 **120/120** là denominator riêng; authored meaning **120/120**, không phải đo model hiểu ngôn ngữ |
| Guided templates | **448/448 outcome đúng**: 429 compile/preflight 0 AI; 19 chặn đúng vì thiếu thành viên so sánh thứ hai; không gọi cả 448 là đã compile |
| Domain/family | **234/234**: 26 domain × dữ liệu đầy đủ/ít/rỗng × 3 độ sâu; **63/63**: 7 metric family × 3 mật độ × 3 độ sâu; oracle độc lập từ raw records |
| Ma trận PLAN | **54/54 PASS_FINITE_ASSERTIONS**, gồm 14 ca trước đây còn partial; có test/receipt cho từng assertion |
| Danh mục tỉnh | **55/55 nhãn nguồn** giữ đúng filter qua preflight/execution, 0 AI; không có nghĩa Việt Nam hiện có 55 tỉnh |
| Web | Typecheck đạt; **231/231 utility tests**; **95 browser cases đạt, 2 optional skip**, có lịch sử recheck WebGL |
| Browser localhost thật | **12/12 journeys**: ranking/compare/risk/trend × 3 độ sâu; 59 chart, **136 facts** tính lại từ toàn bộ artifact cùng revision; 52 trang artifact bổ sung |
| Xếp hạng/phân trang | **18/18 UI cases** dùng báo cáo thật từ pipeline fixture 55 tỉnh có tie: Top/Bottom × N5/20/100 × 3 độ sâu; N100 có actual55; giá trị và nhận định giữ nguyên qua tìm kiếm/phân trang |
| Live Gemini cuối | **12/12 outcome đúng**: 11 completed + 1 unsupported đúng; **9/9 positive AI first-pass**, 2 deterministic 0 AI, 0 repair, 0 timeout; **9 physical sends / trần 36** |
| Kiểm độc lập live | **51 chart, 117 facts** tính lại; lấy thêm 34 trang artifact bất biến; cả 11 báo cáo có orders/directory khớp oracle trước hoặc sau cùng observed generation/schema |
| Refinement HTTP | Valid mới HTTP200/can_submit; unknown scope bị chặn; stale revision HTTP409 đúng; 3/3, 0 AI/0 warehouse query |
| Word | Native Word render và xem đủ **12/12 trang** fixture (10 cohort + 2 preview); bản trích ghi rõ 15/80 dòng; HTTP export kiểm riêng 6/6 nội dung và cùng revision |
| Bản đang phục vụ | API/web healthy, OOM=false; 432 file source hash khớp manifest cuối; JS/CSS HTTP khớp byte với web container; image API và test container giống nhau |

Mỗi denominator trên phục vụ một phép đo riêng; không cộng thành một tỷ lệ “độ chính xác AI toàn hệ thống”. Chi tiết máy đọc được: {link('qualification cuối','codex-qualification-policy33-final.json')}.

## 2. Những thay đổi đã hoàn tất

- Giữ đúng cohort Top/Bottom từ ranking sang store/payment/trend/map/KPI/nhận định/kết luận/export. Tỷ lệ, AOV và distinct được tính lại đúng raw population, tử/mẫu và identity; benchmark ngoài cohort phải có nhãn rõ.
- Risk deep chạy được với signal snapshot ghi rõ **hiện trạng**; không biến snapshot thành lịch sử theo tháng. Mission risk, so sánh, rare scope và refinement dùng hợp đồng server nhất quán.
- Mỗi goal có provenance do server tạo: clause hoặc lựa chọn có cấu trúc, dependency, query/cohort refs; verifier tính lại. Câu rộng được ghi là diễn giải, không giả làm yêu cầu tường minh.
- Không lấy tên chỉ số làm operator hoặc entity; không bỏ tên cửa hàng/sản phẩm ngay sau cụm chỉ số. Chỉ bỏ feature model tự thêm khi không được hỏi và không hợp shape; vẫn kiểm các feature được hỏi rõ.
- Kết luận dùng phát biểu có bằng chứng đúng phạm vi; forecast dùng forecast_ref với horizon/backtest riêng. Mutation scope, kỳ, đơn vị, fact/claim, stale revision hoặc quyền bị chặn trước publication/export.
- Chart dùng khoảng cách ngày thực, tách khoảng thiếu bucket, giữ thiếu dữ liệu thay vì điền 0; ngày sai/đảo chiều dùng bảng có lý do. Word giữ số âm, toàn bộ share base của donut, tên series và số dòng trích; không lấy prose model đổi tên chart sang mục tiêu khác.
- Đã sửa các fixture baseline cũ thiếu context/store type/fingerprint/count; không bỏ test hoặc tắt verifier để đạt xanh.

**Ca đối chứng Bottom 5 tháng 9/2026:** Ninh Thuận, Sóc Trăng, Bạc Liêu, Trà Vinh, Quảng Trị; tổng **1.071.000đ**, **12 đơn hợp lệ**, AOV **89.250đ**. Các view phụ giữ tập này. Mở/đóng “Nhận định từ biểu đồ” không tạo job mới hoặc gọi AI.

## 3. Live Gemini, quyền và ledger

Người dùng đã xác nhận riêng việc gửi fixed12 + catalog/schema/mẫu giá trị được phép sang Google Gemini API và phát sinh phí, giới hạn 36 physical sends. Không gửi mật khẩu/key trong nội dung hoặc raw PII. Lần auto-review đầu từ chối **trước khi tạo process**, không gọi provider; campaign chỉ chạy sau xác nhận bổ sung.

Campaign `.33` chạy một lần khi regression rảnh, giữ đúng 12 payload đã đóng băng, không loại ca và không chạy lại campaign để thay kết quả. Model được runtime ghi nhận: `gemini-3.5-flash-lite`. Reported usage: **31.471 input + 1.321 output tokens**; không suy ra hóa đơn thực tế. Thời gian request hữu hạn: min **1,187s**, median **6,4795s**, max **8,096s**, gồm các đường deterministic/unsupported.

Kết quả 9/9 first-pass đạt ngưỡng 95% trên campaign hữu hạn này. Đây là **replay các incident đã biết**, không phải blind holdout hay chứng minh 100% đúng với câu mới. Corpus holdout/oracle offline có kết quả riêng. Campaign policy27 trước đó **8/9 first-pass, 1 repair** vẫn được giữ nguyên; source33 có thay đổi cụ thể xử lý feature dư gây repair ở compare. Không thay số đỏ lịch sử bằng số mới.

Accounting có tên campaign: repair46 + qualification27=10 + qualification33=9 → **65 physical sends đã ghi nhận cho ba campaign này**. Audit lịch sử có ledger khác; 65 không phải tổng billing/lifetime của mọi phiên.

- {link('Manifest fixed12','codex-qualification-policy33-live-20261022-manifest.json')}
- {link('Review nghĩa/số/epoch và first-pass','codex-live-policy33-final-review.json')}
- {link('Input → goal/task → answer → view → claim → oracle','codex-input-task-answer-view-claim-oracle-policy33.json')}
- {link('Accounting campaign','codex-qualification-policy33-live-20261022-cases/accounting.json')}

Oracle READ ONLY được chụp trước/sau từng ca; `risk-followup` khớp bản sau, các báo cáo còn lại khớp bản trước. Chứng minh generation/schema chỉ bao phủ orders/directory trong SQL oracle này. Những nguồn risk khác có fixture/equivalence tests riêng; không tuyên bố đã đối chiếu raw warehouse tất cả sáu nguồn risk. Observed generation không chứng minh giao dịch upstream nhất quán hoặc dữ liệu nguồn đầy đủ.

## 4. Lịch sử kiểm lại và giới hạn

**Backend:** lượt full source đóng băng chạy 107 module/1.704 test có một assertion cũ đòi kết luận khác toàn bộ nhận định. Điều này xung đột với chính sách kết luận dùng lại phát biểu có căn cứ. Đã thay assertion bằng kiểm khớp evidence thật, positive canonical claim và negative unsupported causal claim; chạy lại toàn bộ module **24/24 đạt**. Lần sửa fixture đầu dùng nhầm verifier metadata mới cho report V23 cũ, phát sinh StopIteration, cũng được giữ. Không thay source sản phẩm sau lượt full. Kết quả hiệu lực gồm full + recheck, **không tuyên bố lượt full ban đầu hoàn toàn xanh**. {link('Receipt hiệu lực và test-only delta','codex-regression-policy33-final/effective-final.json')}.

**Offline:** hai harness đầu thiếu fixture trong `/tmp` container mới; đã nạp lại fixture bất biến và business IDs đọc đúng nguồn, giữ nguyên assertions rồi đạt. Không sửa oracle để khớp sản phẩm. {link('Kết quả cùng lịch sử','codex-offline-policy33-final/result.json')}.

**Browser:** lượt full có 1 timeout khởi tạo WebGL; module nguyên trạng kiểm lại khi máy rảnh đạt cả renderer thật/fallback. Lượt served đầu 10/12, hai lỗi harness ở vị trí drawer và chọn kỳ; sửa harness, chạy lại đủ 12/12, không sửa sản phẩm. Ranking harness đầu sai khoảng trắng trước VND, đã giữ attempt và kiểm lại đủ 18/18. {link('Web consolidation','codex-consolidated-web-policy33-final.json')}.

**Reviewer live:** lần đầu script QA chỉ chấp nhận evidence_id nên nhầm hai finding forecast_ref thành lỗi; lần kế tiếp sai tên trường backtest. Đã bổ sung kiểm forecast model cùng session/revision/provenance, horizon, lịch sử fit, intervals, cải thiện MAE và số trong câu kết luận. V3 đạt toàn bộ; giữ receipt/log các lần trước. Không gọi thêm AI hoặc sửa sản phẩm.

Các giới hạn được nghiệm thu công khai:

1. **I13 chưa có mapping được chủ dữ liệu xác nhận.** Giữ nhãn nguồn và cảnh báo ở report/export; không chỉnh địa chỉ hoặc tự chuyển dữ liệu sau sáp nhập. Nguồn [Nghị quyết 202/2025/QH15](https://congbao.chinhphu.vn/van-ban/nghi-quyet-so-202-2025-qh15-45050.htm) là tham khảo địa giới, không chứng minh vị trí cửa hàng. “Ga Da Nang → Hải Phòng” vẫn cần chủ nguồn xác minh. Không cần migration toàn bộ để hoàn tất phần mềm; nếu chuẩn hóa địa giới sau này phải có mapping và quy tắc lịch sử được duyệt riêng.
2. Regression dùng **process riêng/module, 2 CPU/1,5 GiB, network none**, cùng image API; **chưa chứng nhận monolithic**. Test tải 1/5/10 job và hai p95<50ms đạt tại tài nguyên này; không cam kết 50ms cho serving giới hạn 0,5 CPU.
3. Hai browser ca tùy chọn không chạy: layout toàn live catalog và khả dụng street tiles OpenFreeMap bên ngoài. Critical journeys, fixture catalog, WebGL renderer và SVG fallback đã đạt; không bảo đảm dịch vụ tile bên thứ ba luôn hoạt động.
4. Coverage dùng fixture/corpus hữu hạn và pairwise theo PLAN; không phủ mọi tổ hợp metric hay mọi câu tiếng Việt. Một view phụ thiếu dữ liệu có thể được báo rõ, ví dụ risk-followup, không lấp chart hoặc tự bỏ cảnh báo.
5. Forecast là thống kê có backtest và khoảng ước lượng, không bảo đảm tương lai. Mẫu/epoch/coverage giữ theo nguồn quan sát.
6. Word visual QA dùng **Microsoft Word native** vì bundled renderer thiếu; 12 trang là fixture cùng exporter đóng băng. File export HTTP thật được kiểm nội dung riêng, không tuyên bố chính file đó đã render thêm lần nữa. Các DOCX/PDF/PNG là vật liệu QA; thành phẩm yêu cầu là file Markdown này.

## 5. Bằng chứng G00–G12

| Milestone | Kết luận | Receipt chính |
|---|---|---|
'''
for k,(meaning,receipt) in refs.items():md+=f'| {k} | ĐẠT — {meaning} | {link("Bằng chứng",receipt)} |\n'
md+='''
## 6. Tự kiểm tra localhost

1. Mở `http://localhost:8501`, đăng nhập bằng tài khoản người dùng đã có; vào **Trợ lý AI**.
2. Chọn kỳ tháng 9/2026, nhập “Bottom 5 tỉnh/thành trong dữ liệu theo doanh thu tháng 9 năm 2026”; thử cả ba độ sâu. Đối chiếu tập năm tỉnh, tổng 1.071.000đ và AOV 89.250đ khi chọn chỉ số đó.
3. Với câu “Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán chỉ trong 5 tỉnh này”, kiểm tra view store/payment và chip phạm vi đều giữ cohort.
4. Mở/đóng nhận định, tìm kiếm/phân trang bản đồ; nhận định giữ đúng report/revision. Lưu/mở lại và xuất Word; xem cảnh báo địa bàn nguồn và số dòng trích.
5. Thử Risk HCM cùng kỳ: signal lịch sử giữ tháng 9, signal không có lịch sử ghi hiện trạng. Input không hỗ trợ hoặc thiếu dữ liệu phải báo rõ.

Các lần thử free text mới có thể gọi Gemini và phát sinh phí theo cấu hình; các bước UI chỉ mở/đóng nhận định không gọi AI. Hồ sơ giữ trong repository workspace, không phụ thuộc thư mục tạm. Không commit/push hoặc thay schema/quyền/dữ liệu nguồn trong phiên nghiệm thu.
'''
(DP/'AI_DATA_ANALYST_NGHIEM_THU_20261022.md').write_text(md)
q=DP/'AI_DATA_ANALYST_CODEX_QUALIFICATION_20261022.md'
archive=E/'codex-qualification-policy29-report-history.md'
if not archive.exists():archive.write_text(q.read_text())
q.write_text('''# Qualification AI Data Analyst — 22/10/2026

**Goal tổng: DONE trong phạm vi hữu hạn của PLAN G00–G12/T1–T9.**

Localhost: policy `.33`, input `1.2.5`, verifier `2.8.8`; API/web healthy, source và served bundle đã đối chiếu hash.

Bản đầy đủ tự chứa, gồm thay đổi, test, attempts, ledger, I13 và cách tự kiểm tra: **[MD nghiệm thu](AI_DATA_ANALYST_NGHIEM_THU_20261022.md)**.

| Cổng | Kết quả cuối |
|---|---|
| Backend | 107 module, 1.704 test duy nhất đạt sau test-only recheck 24/24; product source giữ nguyên; không monolithic |
| Offline | 146/146; V33 33/33, V34 120/120; 448/448 advertised outcomes (429 compile + 19 thiếu-input đúng) |
| Coverage | 26 domain × 3 mật độ × 3 độ sâu = 234/234; family63/63; source city55/55; matrix54/54 |
| Web | Typecheck + 231/231 utility; 95 pass/2 optional skip, giữ lịch sử WebGL recheck |
| Browser thật | 12/12, 59 chart/136 facts, 0 AI/job mới khi mở nhận định; saved/reopen/export cùng revision |
| Gemini | Fixed12: 11 completed + 1 unsupported đúng; 9/9 AI first-pass, 0 repair/timeout, 9/36 sends |
| Oracle live | Orders/directory cùng observed generation cho 11 report; 51 chart/117 facts tính lại, model forecast kiểm riêng |
| Word | 12 trang native Word đã xem; actual HTTP content6/6 kiểm riêng |

Không còn critical gate hoặc lỗi phần mềm P0/P1 đã biết trong phạm vi này. I13 vẫn là dữ liệu chưa được chủ nguồn xác nhận, có cảnh báo, không sửa nguồn. Kết quả live là replay incident đã biết, không phải blind unseen-language accuracy. p95<50ms đạt ở container test2CPU/1,5GiB, không cam kết SLA trên serving0,5CPU. Hai optional UI checks chưa chạy được ghi rõ trong MD nghiệm thu.

- [Qualification JSON cuối](evaluation/ai-system-reliability-impl-20261021/codex-qualification-policy33-final.json)
- [Ma trận54](evaluation/ai-system-reliability-impl-20261021/codex-acceptance-matrix-policy33-final.json)
- [Source verification](evaluation/ai-system-reliability-impl-20261021/codex-source-policy33-final-verification.json)
- [Served bundle](evaluation/ai-system-reliability-impl-20261021/codex-served-bundle-policy33-final.json)
- [Báo cáo cũ lưu lịch sử](evaluation/ai-system-reliability-impl-20261021/codex-qualification-policy29-report-history.md)
- [Nhật ký attempts](evaluation/ai-system-reliability-impl-20261021/README.md)

Không ghi đè failures lịch sử hoặc đổi chúng thành pass; kết quả mới có receipt theo source33. Không commit/push/reset/stash/clean/restore.
''')
g=DP/'AI_DATA_ANALYST_SYSTEM_RELIABILITY_GOALS_20261021.md';text=g.read_text()
for k in refs:text=text.replace('- [ ] '+k+' ','- [x] '+k+' ',1)
banner='''> **Trạng thái cuối 22/10/2026: DONE — G00–G12 đạt trong phạm vi corpus/fixture hữu hạn của PLAN.** Bản đang phục vụ `.33` / input `1.2.5` / verifier `2.8.8`. Xem [MD nghiệm thu](AI_DATA_ANALYST_NGHIEM_THU_20261022.md) và [qualification](AI_DATA_ANALYST_CODEX_QUALIFICATION_20261022.md). Những checkpoint IN_PROGRESS/NOT_QUALIFIED phía dưới là lịch sử, không phải trạng thái hiện tại. I13 vẫn có cảnh báo dữ liệu chưa owner-verified, không tự sửa nguồn.

'''
text=text.replace('\n\n','\n\n'+banner,1)
checkpoint='''

## Checkpoint cuối nghiệm thu Codex — 22/10/2026

Goal tổng: **DONE / QUALIFIED_FINITE_PLAN_SCOPE**. G00–G12 đã tick với bằng chứng trong [MD nghiệm thu](AI_DATA_ANALYST_NGHIEM_THU_20261022.md).
Backend107module/1704unique tests hiệu lực đạt (full + test-only recheck24/24, product-source unchanged); không monolithic.
Offline146, V33=33, V34=120; advertised448outcomes; domains234; families63; sourcecities55; acceptance54/54.
Web231/typecheck; browser95pass2optional skip + realserved12/12,59charts136facts; nativeWord12pages.
Gemini33fixed12:11completed1unsupported đúng,9/9positiveAI first-pass,0repair0timeout,9physical/36trần; 51charts117facts tính lại;11report orders/directory cùngobservedgeneration.
Source432hashes match; API/web healthy/OOMfalse, image/bundle khớp. Không còn test/provider đang chạy nền. Không mở thêm paidcampaign.
I13: chưa xác minh mapping với chủ nguồn, giữ cảnh báo; không migration. p95 gate2CPU không phảiSLA cho serving0.5CPU. Corpus live là known-incident replay, khôngblind accuracy.
Receipts cuối: `evaluation/ai-system-reliability-impl-20261021/codex-qualification-policy33-final.json`; source/bundle và mọiattempts ở cùngthưmục. Không commit/push/sửa dữ liệu/schema/quyền.
'''
g.write_text(text+checkpoint)
h=DP/'AI_DATA_ANALYST_RELIABILITY_HANDOFF_CODEX_20261022.md';old=h.read_text();at=old.index('## 0. Quy tắc bắt buộc')
h.write_text('''# HANDOFF AI Data Analyst reliability — đã nghiệm thu 22/10/2026

**Goal tổng: DONE trong phạm vi hữu hạn của PLAN.** Bản localhost `.33`, input `1.2.5`, verifier `2.8.8`.
Kết quả cuối: [MD nghiệm thu](AI_DATA_ANALYST_NGHIEM_THU_20261022.md) và [qualification](AI_DATA_ANALYST_CODEX_QUALIFICATION_20261022.md).
T1–T9 đã có evidence cuối: backend107module/1704test hiệu lực; Gemini9/9AI first-pass,9sends; ma trận54/54; nativeWord12pages; browser12/12; bundle/source khớp.
I13 là giới hạn dữ liệu còn được cảnh báo, không sửa nguồn. Không mở thêm campaign để thay kết quả. Các mục bên dưới là **bàn giao và lệnh lịch sử**, bao gồm trạng thái chưa xong ở thời điểm Claude dừng; không dùng chúng thay receipt33. Web package hiện không có script lint.

'''+old[at:])
notes='''

## Nghiệm thu cuối policy33 — DONE (22/10/2026)

- Source sản phẩm đóng băng `.33`/input1.2.5/verifier2.8.8; 432filehashes khớp manifest test-updated, productdrift[]. Test-only delta V23 có before/after hashes và attempts rõ ràng.
- Full107module1704unique tests có1obsolete cosmetic assertion; lần fixture đầu dùng nhầm modern verifier cho legacyreport, giữ StopIteration. Lần cuối toànmodule24/24 đạt với actual scoped evidence positive/unsupported causal negative. `codex-regression-policy33-final/effective-final.json` true; không tuyên bố originalfullallgreen hay monolithic.
- Offline external hoàn tất:146/33/120 denominators riêng; authored120;448outcomes(429compile19missingcompare); domains234; families63; cities55. AF/identity initialmissingtmpfixture được reseed immutable rồi recheck nguyên assertions; lịch sử giữ nguyên.
- Web231/typecheck;95unique browserpass2optional skip, giữ1WebGL startup timeout +unchanged module idle recheck. Extra realpipeline ranking18/18. Servedv2 đủ12/12,59charts136facts,52fullartifactpages; initial10/12harnessfails giữ nguyên. RefinementHTTP3/3; saved/reopen/Word cùngrevision.
- Native Wordfinal 10cohort+2preview pages đã xem; renderPNG/PDF/DOCXhashes ởcodex-word-policy33-final-native. ExactHTTPcontent6/6 kiểm riêng; không nói exactHTTPfileđãnative-render.
- Paid action lần đầu autoreview từ chối trướcprocess,0sends. User cho phép cụ thể fixed12/cost/destination/max36; receiptcodex-live-policy33-authorization.json. Chạycampaign đúng1lần sau regressionidle:11completed1unsupported đúng,9/9positiveAI first-pass,2deterministic0AI,0repair0timeout,9sends. Reported31471input1321outputtokens; không suy bill. Ledger46+10+9=65 cho3namedcampaigns, không gọi lifetimeallbilling.
- Live reviewer initial11/12 do chỉ accepts evidence_id, chưa hỗ trợ forecast_ref. V2 KeyError tênbacktestfield; V3 đã kiểm riêng modelcùngrevision/provenance/horizon/fitperiod/intervals/MAEimprovement/statementnumbers,12/12đạt. Không sửa sản phẩm/gọi thêm AI. Receipt+logs retained. 51charts117facts/34fullartifactpages. 11report có orders/directory matching before/after oracle sameobservedgeneration (risk-followup usesafter); không claim raw6risk sources/upstream completeness.
- Ma trận54/54finiteassertions; finalsource/bundle/APIhealthy/OOMfalse. `codex-qualification-policy33-final.json` goalDONE. MDnghiệmthu và GOALS/qualification/handoff đã cập nhật. I13warning/dataownerunverified, externaltile/optionalcatalogUI skips,2CPU latency/monolithic/finiteknowncorpus limits ghi rõ. Không commit/push/sửa source data/schema/quyền.
'''
(E/'README.md').write_text((E/'README.md').read_text()+notes)
(E/'codex-completion-checkpoint.md').write_text((E/'codex-completion-checkpoint.md').read_text()+notes)
print(json.dumps(dict(goal_status=result['goal_status'],gates=len(gates),documents=['AI_DATA_ANALYST_NGHIEM_THU_20261022.md','AI_DATA_ANALYST_CODEX_QUALIFICATION_20261022.md','AI_DATA_ANALYST_SYSTEM_RELIABILITY_GOALS_20261021.md','AI_DATA_ANALYST_RELIABILITY_HANDOFF_CODEX_20261022.md']),ensure_ascii=False))
