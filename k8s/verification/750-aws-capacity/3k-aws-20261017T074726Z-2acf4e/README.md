# 750 VU — CLOSED / QUALIFIED

Hai lượt750 độc lập normal120s vàlong300s đều STABLEPASS, generatorvalid,
metrics đầy đủ, postsmoke/naturalHPArecoveryPASS. Cleanup allknownbenchmark phases
kể cảENI PASS17Oct08:52:52UTC. Không còn fleet/control/key/token/privatejob.

Normal:156996requests,728.943RPS,p9592.535/hold73.503ms,6HTTP504/lỗi0.003822%.
Long:342364requests,805.046RPS,p9593.609/hold77.703ms,5HTTP504/lỗi0.001460%.
Không loại lỗi/outliers.750 là governedpublicbrowsevirtualusers, không phải tất cả
workflow production hoặc750RPS.1000NOTRUN.

3target+5generator m7i-flex.large, Freeplan,2.20USDcredit cap/90min. Sourceapp,
Dockerfile, resources/HPA/cache/DB settings/workload giữ nguyên; onlygeneratorcount.
Chi phí trong cost-summary.json là computeupperbound/dự toán, không phải invoice.

Đọc [báo cáo](../../../../K8S_750_CAPACITY_REPORT.md),
[PLAN](../../../../K8S_750_CAPACITY_PLAN.md), qualification.json và final-all-phase-cleanup.json.
Raw public logs bị global.gitignore bỏ qua vẫn được include byte-exact; scopeattrs chỉ
bỏ trailing-alignment whitespace warnings của.log. SHA256SUMS bao gồm mọi publicfile
trừ chính nó/bytecode. Controller source và full5generator CSV/compact exactnumeric
streams được giữ; original bulkytagstreams tạm trênAWS bị xóa cùngdisks, không có
responsebodies/PII/DBconfigvalues/controlsensitivefiles trongGit. Deliverylocalonly,
khôngpush/merge hoặc đổiGitHubauth. Validation271PASS+1historicalSKIP.
