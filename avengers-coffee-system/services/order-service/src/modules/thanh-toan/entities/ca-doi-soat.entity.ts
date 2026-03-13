import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'ca_doi_soat', schema: orderSchema })
export class CaDoiSoat {
  @PrimaryGeneratedColumn('uuid')
  ma_ca: string;

  @Column({ type: 'timestamptz' })
  thoi_gian_bat_dau: Date;

  @Column({ type: 'timestamptz' })
  thoi_gian_ket_thuc: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  tien_dau_ca: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  tien_cuoi_ca: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  tien_mat_he_thong: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  doanh_thu_he_thong: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  tien_mat_ky_vong: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  chenh_lech: number;

  @Column({ type: 'int', default: 0 })
  tong_don: number;

  @Column({ type: 'int', default: 0 })
  tong_don_tien_mat: number;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @Column({ type: 'varchar', nullable: true })
  ten_nhan_vien: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  du_lieu_tom_tat: {
    non_cash_revenue?: number;
  };

  @CreateDateColumn()
  ngay_tao: Date;
}
