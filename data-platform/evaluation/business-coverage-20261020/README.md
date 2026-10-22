# Bằng chứng audit chỉ đọc — 20/10/2026

Không phải acceptance implementation. `manifest.json` ghi scope và hashes. Các JSON chỉ chứa metadata, IDs của schema/metric, aggregates và health states; không có mật khẩu, token, comment text hoặc business row IDs.

- `db-audit.json`: metadata/cột và counts cho source/replica; 78 quan hệ nguồn đã lọc schema hệ thống. Count không có nghĩa chứng nhận nghiệp vụ.
- `source-ledger.json`: danh sách đầy đủ để Claude xử lý P0; disposition là triage, chưa phải business certification. Các bảng không count không được coi là rỗng.
- `details.json`: aggregate review/product120/visibility/inventory và checkpoints tại mốc audit. Duplicate column names trong SQL được giữ theo thứ tự `columns` + `rows`, không chuyển thành object mất dữ liệu.
- `relations.json`: PK/FK/unique definitions và aggregate enums; review join orphans; thiếu satellite combo table.
- `health-summary.json`: kết quả reader path runtime; cột quyền truy cập `sync_history`; envelope có/không có full snapshot.
- `preflight.json`: 6 câu chạy metadata-only, AI_OFFLINE=1; không có model replay.
- `candidates.json`: packet thực của câu review, không gọi model.
- `actor-route-inventory-round2.json`: 110 declaration files ở services/gateway (29 controller,55 entity),381 decorators gồm Controller/WebSocket và15 traced file refs có hashes. Đây là static index, không phải381 endpoint live/đã chứng minh auth. Ghi10human actor contexts và technical contexts riêng; source type census từ metadata vòng1.
- `data-shapes-round2.json`: source READ ONLY khoảng10:19 giờ Việt Nam ngày20/10;44 JSON shape profiles +2 ARRAY metadata, aggregates guest/delivery/gift/wallet. Chỉ shape/count, không JSON values/keys tự do hoặc PII. Có SQL của các aggregate nghiệp vụ.
- `data-shapes-round2-keys.json`: transaction READ ONLY riêng khoảng10:20, phân biệt thiếu shipperId335 với conflicting keys7.472; hai khóa đều không orphan. SQL đi kèm, không xuất row IDs.

Vòng hai không thay evidence vòng1 và không phải full snapshot certificate. JSON shape profile dùng `jsonb_typeof(column::jsonb)`, GROUP BY shape, đếm SQL NULL và empty `{}`/`[]`; mỗi query có SAVEPOINT và timeout12s. `columns`+`rows` giữ thứ tự để không mất cột trùng tên. Không gọi login/getWallet/topUp/transfer/reload/train hoặc business mutation; source paths được kiểm qua code. Chưa kiểm mọi nested key/field version, Redis/client contents, live shipper/accountant/mobile hoặc mọi route registration; các gate này được ghi ngay trong PLAN R3.

Nguồn dùng `sync.get_source_conn()` từ container data-sync: REPEATABLE READ READ ONLY, statement timeout12s cho aggregate probes. Replica dùng cùng chế độ readonly. Source và replica là hai snapshots riêng, không dùng đối chiếu count làm full-content certificate. Endpoint chung runtime app/ingestion đã được xác nhận; chưa chứng minh nhà cung cấp Supabase.

Các truy vấn tái kiểm trọng tâm (chạy dưới readonly profile, không cấp quyền mới để audit):

```sql
SELECT count(*), round(avg(so_sao),4),
       count(*) FILTER (WHERE binh_luan LIKE '[Dữ liệu mẫu]%') AS marked_sample,
       count(*) FILTER (WHERE phan_hoi_quan_ly IS NOT NULL) AS replied
FROM orders.danh_gia_san_pham;

SELECT trang_thai, count(*)
FROM orders.danh_gia_chi_nhanh GROUP BY trang_thai;

SELECT dang_kinh_doanh, count(*), sum(so_luong_ton),
       count(*) FILTER (WHERE so_luong_ton <= muc_canh_bao)
FROM inventory.ton_kho_san_pham GROUP BY dang_kinh_doanh;

SELECT has_column_privilege(current_user,'public.sync_history','finished_at','SELECT'),
       has_column_privilege(current_user,'public.sync_history','status','SELECT');
```

Để tái tạo candidate packet offline, trong analytics-api dùng `preflight_catalog`, `request_anchors`, `DomainIntelligence`, `AnalyticalResolver(catalog, reference_date).index`, `candidate_packet(..., question, ui={})`. Chỉ xuất candidate domain/metric IDs và retrieval score, không gọi interpreter/provider. Reference audit là2026-10-20.

Probe health đầu tiên với AI_OFFLINE=1 không đọc được private reader profile vì cơ chế thiết kế của `db.connection_credentials`; đã chạy lại **riêng hàm đọc health** với runtime profile và thành công. Không kết luận production thiếu credentials từ lần probe offline đó. Lỗi sync_history reader thiếu column grants được kiểm chứng độc lập bằng `has_column_privilege` dưới runtime reader.
