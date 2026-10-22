-- Two focused top-level groups, populated with existing products through their child categories.
-- Safe to run repeatedly after the category hierarchy migration.
BEGIN;

INSERT INTO menu.danh_muc (ten_danh_muc, hinh_anh_icon, cap_bac, ma_danh_muc_cha)
SELECT 'Trà sữa & Macchiato', NULL, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM menu.danh_muc WHERE ten_danh_muc = 'Trà sữa & Macchiato' AND cap_bac = 1);

INSERT INTO menu.danh_muc (ten_danh_muc, hinh_anh_icon, cap_bac, ma_danh_muc_cha)
SELECT 'Bánh mặn & ăn nhẹ', NULL, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM menu.danh_muc WHERE ten_danh_muc = 'Bánh mặn & ăn nhẹ' AND cap_bac = 1);

UPDATE menu.danh_muc
SET ma_danh_muc_cha = (SELECT ma_danh_muc FROM menu.danh_muc WHERE ten_danh_muc = 'Trà sữa & Macchiato' AND cap_bac = 1 ORDER BY ma_danh_muc LIMIT 1)
WHERE ten_danh_muc = 'Trà Sữa' AND cap_bac = 2;

UPDATE menu.danh_muc
SET ma_danh_muc_cha = (SELECT ma_danh_muc FROM menu.danh_muc WHERE ten_danh_muc = 'Bánh mặn & ăn nhẹ' AND cap_bac = 1 ORDER BY ma_danh_muc LIMIT 1)
WHERE ten_danh_muc = 'Bánh Mặn' AND cap_bac = 2;

COMMIT;
