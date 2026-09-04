import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'kiosk_shift_session', schema: orderSchema })
export class KioskShiftSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  co_so_ma: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  staff_username: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  staff_name: string | null;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  trang_thai: 'OPEN' | 'CLOSED' | 'FORCE_CLOSED';

  @Column({ type: 'timestamptz' })
  thoi_gian_mo_ca: Date;

  @Column({ type: 'timestamptz', nullable: true })
  thoi_gian_dong_ca: Date | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  tien_dau_ca: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  tien_cuoi_ca: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  tien_mat_he_thong: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  doanh_thu_he_thong: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  tien_mat_ky_vong: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  chenh_lech: number | null;

  @Column({ type: 'int', default: 0 })
  tong_don_hang: number;

  @Column({ type: 'int', default: 0 })
  tong_don_tien_mat: number;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  dong_ca_boi: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  du_lieu_chi_tiet: {
    non_cash_revenue?: number;
    cash_in_gross?: number;
    cash_change_out?: number;
    online_revenue?: number;
    in_store_revenue?: number;
  };

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
