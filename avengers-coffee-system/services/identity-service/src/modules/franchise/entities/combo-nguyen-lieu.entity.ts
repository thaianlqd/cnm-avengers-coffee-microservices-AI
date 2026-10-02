import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'combo_nguyen_lieu', schema: 'franchise' })
export class ComboNguyenLieu {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  ten_combo: string;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  gia_ban: number;

  @Column({ type: 'int', default: 50 })
  so_ly_pha_che_uoc_tinh: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  doanh_thu_uoc_tinh_moi_combo: number;

  @Column({ type: 'varchar', length: 50, default: 'combo' })
  don_vi_tinh: string;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  trang_thai: string;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
