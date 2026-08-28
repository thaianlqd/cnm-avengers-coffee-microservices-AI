import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ket_qua_doi_soat', schema: 'franchise' })
export class KetQuaDoiSoat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  kiosk_id: string;

  @Column({ type: 'varchar', length: 7 })
  ky_doi_soat: string; // format: 2026-08

  @Column({ type: 'int', default: 0 })
  tong_combo_da_mua: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  doanh_thu_ky_vong_moi_combo: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  doanh_thu_ky_vong: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  doanh_thu_thuc_te: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  chenh_lech_phan_tram: number;

  @Column({ type: 'varchar', length: 10, default: 'XANH' })
  muc_canh_bao: 'XANH' | 'VANG' | 'DO';

  @Column({ type: 'int', default: 0 })
  so_ky_lien_tiep_canh_bao: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  ngay_doi_soat: Date;

  @Column({ type: 'uuid', nullable: true })
  nguoi_doi_soat_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;
}
