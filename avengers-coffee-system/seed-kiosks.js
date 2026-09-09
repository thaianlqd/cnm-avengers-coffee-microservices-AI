const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.seneuycwihbyqjdtcdvu:afSMTJmSkNwOEmAT@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require',
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

    if (hcm01 && hcm02) {
      await client.query(`
        INSERT INTO identity.chi_nhanh (
          ma_chi_nhanh, ten_chi_nhanh, dia_chi, thanh_pho, 
          gio_mo_cua, gio_dong_cua, trang_thai, 
          loai_mo_hinh, loai_vi_tri, vi_do, kinh_do, khu_vuc_id
        )
        VALUES 
          ('KVT001', 'Avengers Coffee - Landmark 81', '720A Điện Biên Phủ, P.22, Bình Thạnh', 'Hồ Chí Minh', '07:00', '22:30', 'ACTIVE', 'SATELLITE_KIOSK', 'TRUNG_TAM_TM', 10.793, 106.721, $1),
          ('KVT002', 'Avengers Coffee - Bitexco', '02 Hải Triều, Q.1', 'Hồ Chí Minh', '06:30', '22:00', 'ACTIVE', 'SATELLITE_KIOSK', 'TOA_VAN_PHONG', 10.771, 106.704, $1),
          ('KVT003', 'Avengers Coffee - ĐH Tôn Đức Thắng', '19 Nguyễn Hữu Thọ, Q.7', 'Hồ Chí Minh', '06:00', '21:00', 'ACTIVE', 'SATELLITE_KIOSK', 'CONG_TRUONG', 10.732, 106.699, $2),
          ('KVT004', 'Avengers Coffee - Crescent Mall', '101 Tôn Dật Tiên, Q.7', 'Hồ Chí Minh', '08:00', '22:00', 'INACTIVE', 'SATELLITE_KIOSK', 'TRUNG_TAM_TM', 10.728, 106.714, $2)
        ON CONFLICT (ma_chi_nhanh) DO NOTHING;
      `, [hcm01, hcm02]);
      console.log('Inserted Kiosks');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
