import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'ho_so_dang_ky', schema: 'franchise' })
export class HoSoDangKy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  ho_ten: string;

  @Column({ type: 'varchar', length: 200 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  so_dien_thoai: string;

  @Column({ type: 'text' })
  dia_chi_mat_bang: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  quan_huyen: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  thanh_pho: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  dien_tich_m2: number | null;

  @Column({ type: 'varchar', length: 20 })
  goi_kiosk: 'XE_LUU_DONG' | 'KIOSK_CO_DINH' | 'CONTAINER_CAFE';

  @Column({ type: 'simple-array', nullable: true })
  hinh_anh_urls: string[] | null;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @Column({ type: 'varchar', length: 30, default: 'CHO_XEM_XET' })
  trang_thai: 'CHO_XEM_XET' | 'CHO_DAT_COC' | 'DA_DUYET' | 'TU_CHOI' | 'DA_HUY';

  @Column({ type: 'text', nullable: true })
  ly_do_tu_choi: string | null;

  @Column({ type: 'uuid', nullable: true })
  franchisee_user_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  nguoi_xu_ly_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
