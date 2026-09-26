/** Runs against an isolated database created from V5_TEST_PG_URL. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { Promotion } from './promotion.entity';
import { PromotionUsage } from './promotion-usage.entity';
import { UserService } from './user.service';

const pg = require('pg');
const adminUrl = process.env.V5_TEST_PG_URL;
const run = adminUrl ? describe : describe.skip;

run('Identity promotion usage real PostgreSQL race', () => {
  const databaseName = `v5_identity_${randomBytes(5).toString('hex')}`;
  let admin: any;
  let db: DataSource;
  let service: UserService;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(adminUrl!);
    url.pathname = `/${databaseName}`;
    db = new DataSource({ type: 'postgres', url: url.toString(), synchronize: false,
      entities: [Promotion, PromotionUsage] });
    await db.initialize();
    await db.query('CREATE SCHEMA identity');
    await db.query(`CREATE TABLE identity.khuyen_mai (
      ma_khuyen_mai varchar(50) PRIMARY KEY, so_luong_da_dung int NOT NULL DEFAULT 0)`);
    await db.query(`CREATE TABLE identity.khuyen_mai_su_dung (
      id serial PRIMARY KEY, ma_khuyen_mai varchar(50) NOT NULL,
      ma_nguoi_dung varchar NOT NULL, ma_don_hang varchar,
      so_tien_giam numeric(15,2) NOT NULL DEFAULT 0,
      ngay_su_dung timestamptz NOT NULL DEFAULT NOW())`);
    await db.query(`CREATE TABLE identity.nguoi_dung (
      ma_nguoi_dung varchar PRIMARY KEY, diem_loyalty int NOT NULL DEFAULT 0,
      diem_kha_dung int NOT NULL DEFAULT 0, tong_chi_tieu numeric NOT NULL DEFAULT 0,
      chi_tieu_thang_nay numeric NOT NULL DEFAULT 0, thang_chi_tieu_gan_nhat varchar)`);
    const migration = readFileSync(join(__dirname, '../../../migrations/20260928_promotion_usage_idempotency.sql'), 'utf8');
    await db.query(migration);
    await db.query(readFileSync(join(__dirname, '../../../migrations/20260929_loyalty_order_award.sql'), 'utf8'));
    service = Object.create(UserService.prototype) as UserService;
    (service as any).dataSource = db;
    (service as any).promotionUsageRepo = db.getRepository(PromotionUsage);
    (service as any).DEFAULT_TIER_CONFIG = [
      { ma_hang: 'MEMBER', ten_hang: 'Thành viên', diem_toi_thieu: 0, chi_tieu_toi_thieu_thang: 0, he_so_diem: 1 },
      { ma_hang: 'SILVER', ten_hang: 'Bạc', diem_toi_thieu: 1000, chi_tieu_toi_thieu_thang: 100000, he_so_diem: 1.2 },
    ];
  }, 30000);

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.end();
    }
  }, 30000);

  it('records concurrent duplicate promotion confirmation and counter once', async () => {
    await db.query(`INSERT INTO identity.khuyen_mai VALUES ('PROMO', 0)`);
    const payload = { ma_khuyen_mai: 'PROMO', user_id: 'u1', ma_don_hang: 'o1', so_tien_giam: 5000 };
    const results = await Promise.all(Array.from({ length: 8 }, () => service.xacNhanSuDungKhuyenMai(payload)));
    expect(results.filter((row) => !row.already_processed)).toHaveLength(1);
    expect((await db.query(`SELECT so_luong_da_dung FROM identity.khuyen_mai WHERE ma_khuyen_mai='PROMO'`))[0].so_luong_da_dung).toBe(1);
    expect((await db.query(`SELECT count(*)::int AS n FROM identity.khuyen_mai_su_dung`))[0].n).toBe(1);
  });

  it('deduplicates a PUBLIC voucher absent from Identity promotion definitions', async () => {
    const payload = { ma_khuyen_mai: 'PUBLIC', user_id: 'u1', ma_don_hang: 'o2', so_tien_giam: 5000 };
    const first = await service.xacNhanSuDungKhuyenMai(payload);
    const second = await service.xacNhanSuDungKhuyenMai(payload);
    expect(first.already_processed).toBe(false);
    expect(second.already_processed).toBe(true);
    expect((await db.query(`SELECT count(*)::int AS n FROM identity.external_voucher_usage`))[0].n).toBe(1);
    expect((await service.layLuotDungUser('PUBLIC', 'u1')).luot_da_dung).toBe(1);
  });

  it('awards loyalty once for concurrent duplicate order deliveries', async () => {
    await db.query(`INSERT INTO identity.nguoi_dung (ma_nguoi_dung) VALUES ('u-loyalty')`);
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      service.congDiemLoyaltyChoDonHang('u-loyalty', 10, 'order-loyalty-1')));
    expect(results.filter((row) => !row.already_processed)).toHaveLength(1);
    expect((await db.query(`SELECT diem_loyalty, diem_kha_dung FROM identity.nguoi_dung WHERE ma_nguoi_dung='u-loyalty'`))[0])
      .toMatchObject({ diem_loyalty: 10, diem_kha_dung: 10 });
    expect((await db.query(`SELECT count(*)::int AS n FROM identity.loyalty_order_award`))[0].n).toBe(1);
    await expect(service.congDiemLoyaltyChoDonHang('u-loyalty', 11, 'order-loyalty-1')).rejects.toThrow();
  });
});
