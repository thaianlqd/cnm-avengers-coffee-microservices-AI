import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'kiosk', schema: 'franchise' })
export class Kiosk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  ma_kiosk: string;

  @Column({ type: 'varchar', length: 200 })
  ten_kiosk: string;

  @Column({ type: 'text' })
  dia_chi: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  quan_huyen: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  thanh_pho: string | null;

  @Column({ type: 'varchar', length: 20 })
  loai_kiosk: 'XE_LUU_DONG' | 'KIOSK_CO_DINH' | 'CONTAINER_CAFE';

  @Column({ type: 'uuid', nullable: true })
  ho_so_id: string | null;

  @Column({ type: 'uuid' })
  franchisee_id: string;

  @Column({ type: 'int', default: 0 })
  so_combo_hien_tai: number;

  @Column({ type: 'varchar', length: 30, default: 'CHO_KY_HOP_DONG' })
  trang_thai: 'CHO_KY_HOP_DONG' | 'DANG_THIET_LAP' | 'DANG_HOAT_DONG' | 'TAM_DUNG' | 'NGUNG_HOAT_DONG';

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
