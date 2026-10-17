# Tiếp tục mục tiêu 1000 VU — chỉ features_k8s

Trạng thái: **đã chuẩn bị và kiểm tra harness; chưa có phép credit/topology mới,
chưa provision, chưa chạy benchmark mới**. Kết quả đã đo vẫn là 500 repeatably
qualified, 750 invalid generator, 1000 not run. Starting HEAD của lượt tiếp tục:
`db37689577d90e23868db68be494e30f35a013f6`. Không push, đổi auth hoặc merge.

## Lý do chọn phương án

Ở 750 VU, ba máy phát tải đạt CPU98.80/100/99.50%; target node CPU peak41%,
không OOM/restart. Sampled Pod CPU peaks: Gateway204m, Identity128m, Menu106m,
News107m; Pod RAM peaks37/54/45/45MiB. Đây là snapshot trong một phép đo generator
invalid, không phải bằng chứng ứng dụng chắc chắn chịu được1000VU.

Profile cũ chỉ ra full JSON validation là chi phí lớn trên generator. Hạ CPU/RAM
service không giảm công việc kiểm tra JSON trên máy phát và có thể tăng throttling.
Dockerfiles đã multi-stage, runner chỉ npm dependencies production; Kubernetes
đã NODE_ENV=production. Vì vậy chưa thay Dockerfile, requests/limits, HPA hoặc code
ứng dụng. Giữ tuning AWS upstream keep-alive đã chứng minh ở hai500PASS.

Phương án: giữ ba target m7i-flex.large; xin tối đa **sáu generator cùng loại**.
1000 chia167/167/167/167/166/166VU, bằng tải mỗi máy đã hợp lệ ở500 chia ba máy.
Điều này là dự đoán để thiết kế phép đo, không bảo đảm PASS. 750 chia125 mỗi máy;
HTTP request/JSON/every-item validation/gzip/think3s và các gate hoàn toàn giữ nguyên.
Máy bổ sung vẫn cần measured-inadequacy proof; không tự scale vô hạn.

## Phần đã chuẩn bị

- Relay/lifecycle/cleanup và exact numeric merger/analyzer hỗ trợ2..6 generators.
- Mặc định một generator, topology<=3 giữ nguyên. Muốn>3 bắt buộc authorization
  khớp user approval, credit cap,110min,3targets,Free plan và m7i-flex.large.
- Cost guard tính đủ9máy và reserves; thiếu phép hoặc thiếu dự toán bị chặn trước
  inventory/provision. Pending manifest lưu user_approved=false, cap đã duyệt0.
- Giữ tất cả validity gates: CPU/RAM/FD/ENA/coverage, actual VU và skew<=2s, whole
  và hold thresholds, metrics, smoke/recovery, noOOM/restart/pressure.
- Bổ sung kiểm tra duplicate partition và tổng VU đúng, không average percentiles.
- Cleanup xóa private job artifacts cả generator4..6 sau khi AWS cleanup verified.
- Kiểm tra helper:76 PASS,1 historical SKIP; AST/diff/secret-pattern scan PASS.
  Workload SHA256 không đổi; chưa có benchmark hoặc kết quả capacity mới.

## Phương án chạy sau khi có phép

1. Xác minh lại inventory/ENI, giá, AMI/instance eligibility và Free plan. FreshRunId,
   keys/certificates, frozen app/workload/source hashes; không dùng sessionCLOSED cũ.
2. Native AWS build/import app giống source đã qualified500. Chỉ chuyển DB config
   theo phép trước tới ba target cùng account/region, encrypted/pinned certificates;
   generated startup placeholders, READ ONLY, không migration/seed/reset/write.
3. Regression250 rồi500normal bằng tối đa ba generator. Đối chiếu source/dataset;
   không suy từ một HTTP PASS rằng máy phát hợp lệ.
4. Dùng bằng chứng750invalid cũ để thêm từng generator trong bound được duyệt;
   đối chiếu owned fleet IDs/certificates, ghi proof hash. Chạy750normal rồi750long300s.
5. Chỉ sau hai750PASS hợp lệ mới1000normal rồi1000long300s; thêm confirm nếu còn thời
   gian/credit. Target bottleneck mới cần measured evidence trước một config experiment.
6. Capture metrics/conntrack/throttle/ENA, self-heal/rolling, post-smoke và natural
   recovery. Stop/cleanup khi eligibility/quota reject, đủ bằng chứng invalid, đạt
   runtime/cost bound hoặc lỗi kiểm chứng. Không nâng plan/IAM/quota.
7. Dọn AWS và local controls/secrets, giữ report/evidence/checksums, lưu local k8s.

## Dự toán đề nghị, chưa được duyệt

Giá refresh17Oct07:36UTC:0.1197USD/máy/giờ. Tối đa9máy,110phút:
compute<=**1.97505USD**, EBS reserve0.15, IPv4 reserve0.10, transfer reserve0.65;
tổng dự toán2.87505, xin **trần bổ sung3.00USD credit**, chỉ Free plan.
Trần dự toán lũy kế nếu duyệt15.4431USD; không phải hóa đơn hoặc tiền trừ thẻ.
Không bắt đầu fleet mới bằng phần cap của lượt đã đóng; phải được phép riêng theo
mục19 yêu cầu gốc. Quota read bị AccessDenied: không đổiIAM; actual launch rejection
là stop condition, không tự xin quota hoặc thay instance sang loại ngoài Free plan.

Chứng cứ chuẩn bị:
[k8s/verification/1k-followup-preflight/20261017T073534Z](k8s/verification/1k-followup-preflight/20261017T073534Z).
Tham khảo [Grafana về generator CPU headroom](https://grafana.com/docs/k6/latest/testing-guides/running-large-tests/)
và [AWS về Free-plan eligible EC2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html).
DataPlatform/branch_thaian/Mac Docker Compose và Docker Desktop CPU/RAM giữ nguyên.
