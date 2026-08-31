import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'cong_no', schema: 'franchise' })
export class CongNo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  kiosk_id: string;

  @Column({ type: 'uuid', nullable: true })
  don_mua_combo_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  royalty_id: string | null;

  @Column({ type: 'varchar', length: 20, default: 'NGUYEN_LIEU' })
  loai_phat_sinh: 'NGUYEN_LIEU' | 'ROYALTY' | 'KHOI_TAO' | 'PHAT_TRE_HAN';

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  so_tien: number;

  @Column({ type: 'date', nullable: true })
  han_thanh_toan: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  phi_phat_tre_han: number;

  @Column({ type: 'varchar', length: 20, default: 'CON_NO' })
  trang_thai: 'CON_NO' | 'DA_THANH_TOAN' | 'QUA_HAN';

  @Column({ type: 'timestamptz', nullable: true })
  ngay_xac_nhan_thanh_toan: Date | null;

  @Column({ type: 'uuid', nullable: true })
  nguoi_xac_nhan_id: string | null;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
