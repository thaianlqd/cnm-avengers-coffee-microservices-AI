import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'thu_chi', schema: 'franchise' })
export class ThuChi {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  kiosk_id: string | null;

  @Column({ type: 'varchar', length: 10, default: 'THU' })
  loai_phieu: 'THU' | 'CHI';

  @Column({ type: 'varchar', length: 50, default: 'KHAC' })
  danh_muc: 'DAT_COC' | 'NHUONG_QUYEN' | 'NGUYEN_LIEU' | 'ROYALTY' | 'HOAN_COC' | 'CHI_PHI_VAN_HANH' | 'TIEN_PHAT' | 'KHAC';

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  so_tien: number;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @Column({ type: 'uuid', nullable: true })
  nguoi_thuc_hien_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
