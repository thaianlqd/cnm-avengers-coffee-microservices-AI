BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE VIEW analytics.snapshot_lock__bai_viet WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.bai_viet WHERE false;
REVOKE ALL ON analytics.snapshot_lock__bai_viet FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__bai_viet TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__ca_kiosk WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.ca_kiosk WHERE false;
REVOKE ALL ON analytics.snapshot_lock__ca_kiosk FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__ca_kiosk TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__cong_no_nhuong_quyen WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.cong_no_nhuong_quyen WHERE false;
REVOKE ALL ON analytics.snapshot_lock__cong_no_nhuong_quyen FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__cong_no_nhuong_quyen TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__doi_soat_kiosk WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.doi_soat_kiosk WHERE false;
REVOKE ALL ON analytics.snapshot_lock__doi_soat_kiosk FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__doi_soat_kiosk TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__don_mua_combo WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.don_mua_combo WHERE false;
REVOKE ALL ON analytics.snapshot_lock__don_mua_combo FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__don_mua_combo TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__gia_kiosk WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.gia_kiosk WHERE false;
REVOKE ALL ON analytics.snapshot_lock__gia_kiosk FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__gia_kiosk TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__ho_so_nhuong_quyen WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.ho_so_nhuong_quyen WHERE false;
REVOKE ALL ON analytics.snapshot_lock__ho_so_nhuong_quyen FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__ho_so_nhuong_quyen TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__hoi_thoai_cskh WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.hoi_thoai_cskh WHERE false;
REVOKE ALL ON analytics.snapshot_lock__hoi_thoai_cskh FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__hoi_thoai_cskh TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__hop_dong_nhuong_quyen WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.hop_dong_nhuong_quyen WHERE false;
REVOKE ALL ON analytics.snapshot_lock__hop_dong_nhuong_quyen FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__hop_dong_nhuong_quyen TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__khao_sat_tra_loi WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.khao_sat_tra_loi WHERE false;
REVOKE ALL ON analytics.snapshot_lock__khao_sat_tra_loi FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__khao_sat_tra_loi TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__kiosk WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.kiosk WHERE false;
REVOKE ALL ON analytics.snapshot_lock__kiosk FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__kiosk TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__ngoai_le_giao_hang WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.ngoai_le_giao_hang WHERE false;
REVOKE ALL ON analytics.snapshot_lock__ngoai_le_giao_hang FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__ngoai_le_giao_hang TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__royalty_nhuong_quyen WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.royalty_nhuong_quyen WHERE false;
REVOKE ALL ON analytics.snapshot_lock__royalty_nhuong_quyen FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__royalty_nhuong_quyen TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__shipper_nop_cod WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.shipper_nop_cod WHERE false;
REVOKE ALL ON analytics.snapshot_lock__shipper_nop_cod FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__shipper_nop_cod TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__the_qua_tang WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.the_qua_tang WHERE false;
REVOKE ALL ON analytics.snapshot_lock__the_qua_tang FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__the_qua_tang TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__thu_chi_nhuong_quyen WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.thu_chi_nhuong_quyen WHERE false;
REVOKE ALL ON analytics.snapshot_lock__thu_chi_nhuong_quyen FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__thu_chi_nhuong_quyen TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__thuong_loyalty_don WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.thuong_loyalty_don WHERE false;
REVOKE ALL ON analytics.snapshot_lock__thuong_loyalty_don FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__thuong_loyalty_don TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__tin_nhan_cskh WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.tin_nhan_cskh WHERE false;
REVOKE ALL ON analytics.snapshot_lock__tin_nhan_cskh FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__tin_nhan_cskh TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__topping_don_hang WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.topping_don_hang WHERE false;
REVOKE ALL ON analytics.snapshot_lock__topping_don_hang FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__topping_don_hang TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__vi_chu_kiosk WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.vi_chu_kiosk WHERE false;
REVOKE ALL ON analytics.snapshot_lock__vi_chu_kiosk FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__vi_chu_kiosk TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__vi_khach_hang WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.vi_khach_hang WHERE false;
REVOKE ALL ON analytics.snapshot_lock__vi_khach_hang FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__vi_khach_hang TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__vi_khach_hang_giao_dich WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.vi_khach_hang_giao_dich WHERE false;
REVOKE ALL ON analytics.snapshot_lock__vi_khach_hang_giao_dich FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__vi_khach_hang_giao_dich TO avengers_analytics_reader;
CREATE OR REPLACE VIEW analytics.snapshot_lock__vi_shipper WITH (security_barrier=true) AS
    SELECT false AS lock_guard FROM silver.vi_shipper WHERE false;
REVOKE ALL ON analytics.snapshot_lock__vi_shipper FROM PUBLIC;
GRANT SELECT ON analytics.snapshot_lock__vi_shipper TO avengers_analytics_reader;
COMMIT;
