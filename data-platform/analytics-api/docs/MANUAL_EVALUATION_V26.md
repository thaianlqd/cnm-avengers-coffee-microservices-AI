# V2.6 manual live matrix

The implementation ran this matrix offline with scripted decisions and synthetic
rows. These live steps remain for the user after deployment. Do not infer language
accuracy, tokens or live warehouse numbers from the fixtures. Main inputs are
question, time, optional context and optional expectation. No domain/depth setup.

| Case | Question / inputs | Expected review and behavior |
|---|---|---|
| A | `Top 5 sản phẩm bán chạy nhất tại TP.HCM`; time Auto; optional fields blank | Quantity sold, product grouping, HCM scope and Top 5. No arbitrary revenue score or donut from Top N. One planning call, zero proposal analytical SQL; approval zero AI; at least one useful visual. |
| B | `Phân tích tình hình bán hàng TP.HCM tháng này`; Auto; optional fields blank | Current month and HCM; useful catalog sales lenses. AI chooses breadth. Rich views where justified, no forced chart quota. |
| C | `Phân tích sâu sản phẩm TP.HCM quý trước: xếp hạng, doanh thu, cơ cấu danh mục và xu hướng số lượng`; Auto or Quý trước; optional fields blank | Preserve all four requested components. Ranking/revenue product grouping, category mix category grouping and historical trend granularity come from blueprints when omitted. No grouping_required failure. |
| D | `Phân tích hoạt động kinh doanh quý trước`; context `TP.HCM và Hà Nội; chi nhánh, sản phẩm, voucher, thanh toán`; expectation blank | Interpret optional context as scope; show all selected domain/lens business labels and matching periods for review. |
| E | `Phân tích hoạt động tháng trước`; context blank; expectation `Phân tích toàn diện, nhóm góc nhìn và điểm cần chú ý` | AI selects comprehensive breadth and useful lenses. Group by metadata story/domain; report limitations where fewer views are justified. |
| F | `Xu hướng shipper tháng này`; optional fields blank | Actionable historical-data issue, one call, zero analytical queries. Current metadata has shipper snapshots only. Clicking a snapshot choice returns to an editable question with all_time; it does not silently execute reduced analysis. |
| G | After successful approved B, save `Đánh giá TP.HCM hàng tháng` | Save server canonical meaning and strategy, not SQL/results. Name, domains, version and fingerprint visible through owned APIs. |
| H | Select G, choose Tháng này, click Chạy lại | Zero AI calls. Recompile and query current Silver rows; new result timestamp/provenance, no reuse of old values. |
| I | Select G's active chip, enter `Thêm phân tích voucher` | One new planning call, no proposal SQL, compact prior canonical state; retain old requested work unless explicitly removed/replaced. Review and approve, then zero more AI calls. |
| J | `Đánh giá toàn diện hoạt động kinh doanh quý trước`; context `TP.HCM so với Hà Nội: chi nhánh, sản phẩm, khách hàng, voucher, thanh toán`; expectation `Nhiều biểu đồ và điểm cần chú ý` | Comprehensive domain story, actual historical clocks/cohorts, distinct customers not summed, all requested work retained, meaningful visuals and grounded highlights. |

For each live proposal capture diagnostics: provider call/attempt count,
repair/fallback/escalation count, blueprint materialization rules, requested and
supporting counts, actual body sizes for native/compat, headroom, actual reported
tokens and latency. On approval capture DB query count, chart families, result
contracts and observed timestamps. Never estimate token counts from characters.
A manual retry is a separate explicit action, not an automatic repair call.

Additional checks: remove active chip without clearing question; search modules;
rename/archive; save a new variant; choose a custom date range; inspect a previous
run (available within the current server session retention window). Change a
catalog fingerprint in a test deployment and verify needs_review blocks AI/SQL;
use Update to prefill and review a fresh problem. Check a second browser profile
cannot list/load/save/rerun the first profile's modules or sessions.

Deployment prerequisite: apply `migrations/026_analysis_modules.sql` through the
normal migration process. No migration was applied by this task. HTTPS/proxy
installations should configure `DATA_ANALYST_ALLOWED_ORIGINS` with exact frontend
origins; same-origin HTTP and Vite proxy preserve the browser Host including port.
