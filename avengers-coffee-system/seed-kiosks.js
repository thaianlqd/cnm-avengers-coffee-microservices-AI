const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:afSMTJmSkNwOEmAT@db.seneuycwihbyqjdtcdvu.supabase.co:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to Supabase PostgreSQL');

    // Create Khu Vuc 
    const res = await client.query(`
      INSERT INTO identity.khu_vuc (ma_khu_vuc, ten_khu_vuc, thanh_pho, mo_ta)
      VALUES 
        ('KV-HCM-01', 'Khu vực Trung tâm Quận 1', 'Hồ Chí Minh', 'Khu vực quận 1 tập trung nhiều tòa nhà văn phòng'),
        ('KV-HCM-02', 'Khu vực Quận 7', 'Hồ Chí Minh', 'Khu đô thị Phú Mỹ Hưng, tập trung chung cư cao cấp'),
        ('KV-HN-01', 'Khu vực Cầu Giấy', 'Hà Nội', 'Khu vực đông sinh viên và văn phòng')
      ON CONFLICT (ma_khu_vuc) DO NOTHING
      RETURNING id, ma_khu_vuc;
    `);

    console.log('Inserted Zones:', res.rows);

    // Get the IDs to insert Kiosk
    const zones = await client.query(`SELECT id, ma_khu_vuc FROM identity.khu_vuc`);
    const hcm01 = zones.rows.find(z => z.ma_khu_vuc === 'KV-HCM-01')?.id;
    const hcm02 = zones.rows.find(z => z.ma_khu_vuc === 'KV-HCM-02')?.id;

    // Get parent branches
    let branches = await client.query(`SELECT ma_chi_nhanh FROM identity.chi_nhanh WHERE loai_diem_ban = 'CHI_NHANH_CHINH'`);
    let cn1 = branches.rows[0]?.ma_chi_nhanh;
    let cn2 = branches.rows[1]?.ma_chi_nhanh || cn1;
    
    // Insert a new Parent Branch specifically for Đồng Khởi (if not exists)
    if (hcm01) {
        const dkRes = await client.query(`
          INSERT INTO identity.chi_nhanh (
            ma_chi_nhanh, ten_chi_nhanh, dia_chi, thanh_pho, 
            gio_mo_cua, gio_dong_cua, trang_thai, 
            loai_diem_ban, loai_vi_tri, vi_do, kinh_do, khu_vuc_id
          )
          VALUES 
            ('HCM_DK', 'Avengers Coffee - Flagship Đồng Khởi', '72 Lê Thánh Tôn, Q.1', 'Hồ Chí Minh', '07:00', '23:00', 'ACTIVE', 'CHI_NHANH_CHINH', 'TRUNG_TAM_TM', 10.778, 106.702, $1)
          ON CONFLICT (ma_chi_nhanh) DO NOTHING
          RETURNING ma_chi_nhanh;
        `, [hcm01]);
        // If we just inserted it, or it already exists, we use 'HCM_DK' as the parent for Đồng Khởi kiosk
    }
    const parentDK = 'HCM_DK';

    if (hcm01 && hcm02) {
      await client.query(`
        INSERT INTO identity.chi_nhanh (
          ma_chi_nhanh, ten_chi_nhanh, dia_chi, thanh_pho, 
          gio_mo_cua, gio_dong_cua, trang_thai, 
          loai_diem_ban, loai_vi_tri, vi_do, kinh_do, khu_vuc_id, chi_nhanh_me_ma
        )
        VALUES 
          ('KVT001', 'Avengers Coffee - Landmark 81', '720A Điện Biên Phủ, P.22, Bình Thạnh', 'Hồ Chí Minh', '07:00', '22:30', 'ACTIVE', 'KIOSK_VE_TINH', 'TRUNG_TAM_TM', 10.793, 106.721, $1, $3),
          ('KVT002', 'Avengers Coffee - Vincom Đồng Khởi', '02 Hải Triều, Q.1', 'Hồ Chí Minh', '06:30', '22:00', 'ACTIVE', 'KIOSK_VE_TINH', 'TOA_VAN_PHONG', 10.771, 106.704, $1, $5),
          ('KVT003', 'Avengers Coffee - ĐH Tôn Đức Thắng', '19 Nguyễn Hữu Thọ, Q.7', 'Hồ Chí Minh', '06:00', '21:00', 'ACTIVE', 'KIOSK_VE_TINH', 'CONG_TRUONG', 10.732, 106.699, $2, $4),
          ('KVT004', 'Avengers Coffee - Crescent Mall', '101 Tôn Dật Tiên, Q.7', 'Hồ Chí Minh', '08:00', '22:00', 'INACTIVE', 'KIOSK_VE_TINH', 'TRUNG_TAM_TM', 10.728, 106.714, $2, $4),
          ('KVT005', 'Avengers Coffee - Phố đi bộ', 'Nguyễn Huệ, Q.1', 'Hồ Chí Minh', '17:00', '23:30', 'ACTIVE', 'KIOSK_VE_TINH', 'VIA_HE', 10.774, 106.703, $1, $5),
          ('KVT006', 'Avengers Coffee - ĐH Bách Khoa', '268 Lý Thường Kiệt, Q.10', 'Hồ Chí Minh', '06:30', '20:30', 'ACTIVE', 'KIOSK_VE_TINH', 'CONG_TRUONG', 10.772, 106.657, $1, $3),
          ('KVT007', 'Avengers Coffee - Vạn Hạnh Mall', '11 Sư Vạn Hạnh, Q.10', 'Hồ Chí Minh', '08:30', '22:30', 'ACTIVE', 'KIOSK_VE_TINH', 'TRUNG_TAM_TM', 10.775, 106.669, $1, $3),
          ('KVT008', 'Avengers Coffee - Vinhome Central Park', '208 Nguyễn Hữu Cảnh', 'Hồ Chí Minh', '06:00', '23:00', 'ACTIVE', 'KIOSK_VE_TINH', 'KHU_DAN_CU', 10.794, 106.722, $1, $3),
          ('KVT009', 'Avengers Coffee - Phú Mỹ Hưng', 'Nguyễn Văn Linh, Q.7', 'Hồ Chí Minh', '07:00', '22:00', 'ACTIVE', 'KIOSK_VE_TINH', 'KHU_DAN_CU', 10.731, 106.702, $2, $4),
          ('KVT010', 'Avengers Coffee - Etown', '364 Cộng Hòa, Tân Bình', 'Hồ Chí Minh', '06:30', '19:30', 'INACTIVE', 'KIOSK_VE_TINH', 'TOA_VAN_PHONG', 10.801, 106.643, $1, $3)
        ON CONFLICT (ma_chi_nhanh) DO UPDATE SET 
          loai_diem_ban = EXCLUDED.loai_diem_ban,
          loai_vi_tri = EXCLUDED.loai_vi_tri,
          chi_nhanh_me_ma = EXCLUDED.chi_nhanh_me_ma,
          ten_chi_nhanh = EXCLUDED.ten_chi_nhanh,
          dia_chi = EXCLUDED.dia_chi;
      `, [hcm01, hcm02, cn1, cn2, parentDK]);
      console.log('Inserted Kiosks');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
