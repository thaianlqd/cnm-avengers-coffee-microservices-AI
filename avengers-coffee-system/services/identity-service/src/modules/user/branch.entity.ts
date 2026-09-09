import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const userSchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'chi_nhanh', schema: userSchema })
export class Branch {
  @PrimaryColumn({ type: 'varchar' })
  ma_chi_nhanh: string;

  @Column({ type: 'varchar', unique: true })
  ten_chi_nhanh: string;

  @Column({ type: 'text', nullable: true })
  dia_chi: string | null;

  @Column({ type: 'varchar', nullable: true })
  thanh_pho: string | null;

  @Column({ type: 'varchar', nullable: true })
  so_dien_thoai: string | null;

  @Column({ type: 'text', nullable: true })
  hinh_anh_url: string | null;

  @Column({ type: 'varchar', nullable: true })
  gio_mo_cua: string | null;

  @Column({ type: 'varchar', nullable: true })
  gio_dong_cua: string | null;

  @Column({ type: 'text', nullable: true })
  map_url: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  trang_thai: string;

  @Column({ type: 'varchar', length: 30, default: 'CHI_NHANH_CHINH' })
  loai_diem_ban: 'CHI_NHANH_CHINH' | 'KIOSK_VE_TINH' | 'XE_NUOC_FRUIT';

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  vi_do: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  kinh_do: number | null;

  @Column({ type: 'uuid', nullable: true })
  khu_vuc_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  chi_nhanh_me_ma: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  loai_vi_tri: 'TRUNG_TAM_TM' | 'VIA_HE' | 'CONG_TRUONG' | 'TOA_VAN_PHONG' | 'KHU_DAN_CU' | null;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}
