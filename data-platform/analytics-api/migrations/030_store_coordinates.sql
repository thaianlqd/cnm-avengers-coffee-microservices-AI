BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE OR REPLACE VIEW silver.chi_nhanh AS
SELECT ma_chi_nhanh, ten_chi_nhanh, dia_chi, thanh_pho, so_dien_thoai,
       trang_thai, loai_diem_ban, gio_mo_cua, gio_dong_cua, vi_do, kinh_do
FROM identity.chi_nhanh;
GRANT SELECT (vi_do, kinh_do) ON silver.chi_nhanh TO avengers_analytics_reader;
COMMIT;
