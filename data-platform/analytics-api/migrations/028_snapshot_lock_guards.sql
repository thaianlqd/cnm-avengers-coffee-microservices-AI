BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE VIEW analytics.snapshot_lock__bien_the_san_pham WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.bien_the_san_pham WHERE false;
REVOKE ALL ON analytics.snapshot_lock__bien_the_san_pham FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__bien_the_san_pham TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__ca_doi_soat WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.ca_doi_soat WHERE false;
REVOKE ALL ON analytics.snapshot_lock__ca_doi_soat FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__ca_doi_soat TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__ca_lam_viec_nhan_vien WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.ca_lam_viec_nhan_vien WHERE false;
REVOKE ALL ON analytics.snapshot_lock__ca_lam_viec_nhan_vien FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__ca_lam_viec_nhan_vien TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__chi_nhanh WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.chi_nhanh WHERE false;
REVOKE ALL ON analytics.snapshot_lock__chi_nhanh FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__chi_nhanh TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__chi_tiet_don_hang WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.chi_tiet_don_hang WHERE false;
REVOKE ALL ON analytics.snapshot_lock__chi_tiet_don_hang FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__chi_tiet_don_hang TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__danh_gia_chi_nhanh WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.danh_gia_chi_nhanh WHERE false;
REVOKE ALL ON analytics.snapshot_lock__danh_gia_chi_nhanh FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__danh_gia_chi_nhanh TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__danh_gia_san_pham WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.danh_gia_san_pham WHERE false;
REVOKE ALL ON analytics.snapshot_lock__danh_gia_san_pham FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__danh_gia_san_pham TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__danh_muc WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.danh_muc WHERE false;
REVOKE ALL ON analytics.snapshot_lock__danh_muc FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__danh_muc TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__don_hang WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.don_hang WHERE false;
REVOKE ALL ON analytics.snapshot_lock__don_hang FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__don_hang TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__giao_dich_thanh_toan WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.giao_dich_thanh_toan WHERE false;
REVOKE ALL ON analytics.snapshot_lock__giao_dich_thanh_toan FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__giao_dich_thanh_toan TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__giao_hang WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.giao_hang WHERE false;
REVOKE ALL ON analytics.snapshot_lock__giao_hang FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__giao_hang TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__khao_sat_phan_hoi WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.khao_sat_phan_hoi WHERE false;
REVOKE ALL ON analytics.snapshot_lock__khao_sat_phan_hoi FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__khao_sat_phan_hoi TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__khu_vuc WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.khu_vuc WHERE false;
REVOKE ALL ON analytics.snapshot_lock__khu_vuc FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__khu_vuc TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__khuyen_mai WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.khuyen_mai WHERE false;
REVOKE ALL ON analytics.snapshot_lock__khuyen_mai FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__khuyen_mai TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__khuyen_mai_su_dung WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.khuyen_mai_su_dung WHERE false;
REVOKE ALL ON analytics.snapshot_lock__khuyen_mai_su_dung FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__khuyen_mai_su_dung TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__nguoi_dung WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.nguoi_dung WHERE false;
REVOKE ALL ON analytics.snapshot_lock__nguoi_dung FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__nguoi_dung TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__san_pham WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.san_pham WHERE false;
REVOKE ALL ON analytics.snapshot_lock__san_pham FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__san_pham TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__shipper WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.shipper WHERE false;
REVOKE ALL ON analytics.snapshot_lock__shipper FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__shipper TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__ton_kho_san_pham WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.ton_kho_san_pham WHERE false;
REVOKE ALL ON analytics.snapshot_lock__ton_kho_san_pham FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__ton_kho_san_pham TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__voucher WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.voucher WHERE false;
REVOKE ALL ON analytics.snapshot_lock__voucher FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__voucher TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__yeu_thich_san_pham WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.yeu_thich_san_pham WHERE false;
REVOKE ALL ON analytics.snapshot_lock__yeu_thich_san_pham FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__yeu_thich_san_pham TO avengers_analytics_reader;
COMMIT;
