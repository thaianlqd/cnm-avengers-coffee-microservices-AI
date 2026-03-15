import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'ca_lam_viec_nhan_vien', schema: orderSchema })
export class CaLamViecNhanVien {
  @PrimaryGeneratedColumn('uuid')
  ma_ca_lam_viec: string;

  @Column({ type: 'varchar', default: 'MAC_DINH_CHI' })
  co_so_ma: string;

  @Column({ type: 'varchar' })
  staff_username: string;

  @Column({ type: 'varchar' })
  staff_name: string;

  @Column({ type: 'date' })
  ngay_lam_viec: string;

  @Column({ type: 'varchar' })
  ma_khung_ca: string;

  @Column({ type: 'varchar' })
  ten_ca: string;

  @Column({ type: 'varchar' })
  gio_bat_dau: string;

  @Column({ type: 'varchar' })
  gio_ket_thuc: string;

  @Column({ type: 'varchar', default: 'ASSIGNED' })
  trang_thai_cham_cong: 'ASSIGNED' | 'PRESENT' | 'ABSENT';

  @Column({ type: 'timestamptz', nullable: true })
  check_in_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  check_out_at: Date | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'varchar', nullable: true })
  manager_username: string | null;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}