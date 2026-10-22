# Evidence/spec cho PLAN comparison workspace

**PLANNED — NOT EXECUTED.** Thư mục này chưa chứa chứng nhận triển khai.

- [PLAN](../../AI_DATA_ANALYST_COMPARISON_WORKSPACE_PLAN_20261022.md)
- [GOALS](../../AI_DATA_ANALYST_COMPARISON_WORKSPACE_GOALS_20261022.md)
- planning-baseline.json: HEAD,432sourcehashes,drift[] so với qualified33; hash của originalincident/QA. Đây là baseline lậpplan; phải recheck trướcimplementation.
- acceptance-cases.json:48scenario (36development+12reservedtransfer), tất cảNOT_RUN; ma trậnparameterization được định nghĩa trongPLAN, chưa thực thi.
- independent-fixture-spec.json: raw fixture/expected values nhỏ, không có số kết quả business nhét vào production. Fixtures bổ sung đã liệt kê, chưa xây/runtests.
- Usercase lịch sử và independentSQL/rawdata: ../ai-system-reliability-impl-20261021/codex-user-two-cities-20261022/.

Không ghi fakepass hoặc chạy Gemini khi chỉ lậpPLAN. Khi triển khai tạo receipt mỗiattempt, giữ redbefore/greenafter, currentimage/sourcehash, query/providerledger và skips; receipt export cần viewstate manifest.

Bổ sung: [selection/clarification PLAN](../../AI_DATA_ANALYST_COMPARISON_SELECTION_ADDENDUM_20261022.md), stability-selection-cases.json8scenarios NOT_RUN; tổng core48+8=56planned. Actualincident và offline diagnostic reproduction ởstability-selection-incident/.
