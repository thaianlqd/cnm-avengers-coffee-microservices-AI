import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'bien_ban_vi_pham', schema: 'franchise' })
export class BienBanViPham {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  kiosk_id: string;

  @Column({ type: 'varchar', length: 100 })
  loai_vi_pham: string; // vd: GIAN_LAN_NGUYEN_LIEU

  @Column({ type: 'varchar', length: 50 })
  hinh_phat: 'TIEN_PHAT' | 'CANH_CAO';

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  so_tien_phat: number;

  @Column({ type: 'varchar', length: 50, default: 'CHUA_NOP' })
  trang_thai: 'CHUA_NOP' | 'DA_NOP' | 'KHONG_AP_DUNG';

  @Column({ type: 'text', nullable: true })
  ly_do: string | null;

  @Column({ type: 'uuid' })
  nguoi_lap_id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
