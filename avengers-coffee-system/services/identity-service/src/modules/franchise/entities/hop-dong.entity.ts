import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'hop_dong_nhuong_quyen', schema: 'franchise' })
export class HopDongNhuongQuyen {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  kiosk_id: string;

  @Column({ type: 'varchar', length: 20 })
  goi_kiosk: string;

  @Column({ type: 'date' })
  ngay_ky: string;

  @Column({ type: 'date' })
  ngay_het_han: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 7.0 })
  ty_le_royalty_phan_tram: number;

  @Column({ type: 'int', default: 0 })
  so_combo_khoi_diem: number;

  @Column({ type: 'varchar', length: 20, default: 'HIEU_LUC' })
  trang_thai: 'HIEU_LUC' | 'HET_HAN' | 'DA_HUY';

  @Column({ type: 'date', nullable: true })
  ngay_khai_truong: string | null;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @Column({ type: 'uuid' })
  nguoi_tao_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
