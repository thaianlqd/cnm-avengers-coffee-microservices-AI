import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'don_mua_combo', schema: 'franchise' })
export class DonMuaCombo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  kiosk_id: string;

  @Column({ type: 'uuid' })
  combo_id: string;

  @Column({ type: 'int', default: 1 })
  so_luong: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  don_gia: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  tong_tien: number;

  @Column({ type: 'varchar', length: 20, default: 'DA_DAT' })
  trang_thai: 'DA_DAT' | 'DA_GIAO' | 'TAM_HOAN';

  @Column({ type: 'varchar', length: 30, default: 'CONG_NO' })
  phuong_thuc_thanh_toan: 'VNPAY' | 'CHUYEN_KHOAN' | 'CONG_NO' | 'VI_DIEN_TU';

  @Column({ type: 'boolean', default: false })
  thanh_toan_ngay: boolean;

  @Column({ type: 'text', nullable: true })
  ghi_chu_admin: string | null;

  @Column({ type: 'uuid', nullable: true })
  nguoi_xu_ly_id: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  ngay_dat: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ngay_giao: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
