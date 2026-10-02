import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'ca_doi_soat', schema: orderSchema })
export class CaDoiSoat {
  @PrimaryGeneratedColumn('uuid')
  ma_ca: string;

  @Column({ type: 'varchar', default: 'MAC_DINH_CHI' })
  co_so_ma: string;

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

  @Column({ type: 'varchar', default: 'PENDING' })
  trang_thai_phe_duyet: 'PENDING' | 'APPROVED' | 'REJECTED';

  @Column({ type: 'varchar', nullable: true })
  manager_duyet: string | null;

  @Column({ type: 'text', nullable: true })
  ghi_chu_phe_duyet: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  thoi_gian_phe_duyet: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  du_lieu_tom_tat: {
    shift_date?: string;
    non_cash_revenue?: number;
    cash_in_gross?: number;
    cash_change_out?: number;
    cash_net?: number;
    online_revenue?: number;
    in_store_revenue?: number;
  };

  @CreateDateColumn()
  ngay_tao: Date;
}
