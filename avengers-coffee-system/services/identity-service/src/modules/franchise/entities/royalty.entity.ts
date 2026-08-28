import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'royalty_hang_thang', schema: 'franchise' })
export class RoyaltyHangThang {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  kiosk_id: string;

  @Column({ type: 'varchar', length: 7 })
  thang: string; // format: 2026-08

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  doanh_thu_thuc_te: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  ty_le_royalty: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  so_tien_royalty: number;

  @Column({ type: 'varchar', length: 20, default: 'CHO_XAC_NHAN' })
  trang_thai: 'CHO_XAC_NHAN' | 'DA_XAC_NHAN' | 'DA_THANH_TOAN';

  @Column({ type: 'timestamptz', nullable: true })
  ngay_xac_nhan: Date | null;

  @Column({ type: 'uuid', nullable: true })
  nguoi_xac_nhan_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  ngay_thanh_toan: Date | null;

  @Column({ type: 'text', nullable: true })
  ghi_chu_ke_toan: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
