import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChiTietDonHang } from './chi-tiet-don-hang.entity';
import { GiaoDichThanhToan } from './giao-dich-thanh-toan.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'don_hang', schema: orderSchema })
export class DonHang {
  @PrimaryGeneratedColumn('uuid')
  ma_don_hang: string;

  @Column({ type: 'varchar' })
  ma_nguoi_dung: string;

  @Column({ type: 'varchar', default: 'MAC_DINH_CHI' })
  co_so_ma: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  tong_tien: number;

  @Column({ type: 'varchar' })
  dia_chi_giao_hang: string;

  @Column({ type: 'varchar', nullable: true })
  khung_gio_giao: string | null;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @Column({ type: 'varchar', nullable: true })
  loai_don_hang: string | null;

  @Column({ type: 'varchar', nullable: true })
  ma_ban: string | null;

  @Column({ type: 'varchar', nullable: true })
  ten_khach_hang: string | null;

  @Column({ type: 'varchar', nullable: true })
  ten_thu_ngan: string | null;

  @Column({ type: 'varchar' })
  phuong_thuc_thanh_toan: string;

  @Column({ type: 'varchar', default: 'CHO_THANH_TOAN' })
  trang_thai_thanh_toan: string;

  @Column({ type: 'varchar', default: 'MOI_TAO' })
  trang_thai_don_hang: string;

  @Column({ type: 'varchar', nullable: true })
  ma_voucher: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: 0 })
  so_tien_giam: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  tien_khach_dua: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: 0 })
  tien_thoi: number | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  lich_su_trang_thai: Array<{
    loai: 'ORDER' | 'PAYMENT';
    trang_thai: string;
    thoi_gian: string;
    ghi_chu?: string;
  }>;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;

  @OneToMany(() => ChiTietDonHang, (chiTiet) => chiTiet.don_hang)
  chi_tiet: ChiTietDonHang[];

  @OneToMany(() => GiaoDichThanhToan, (giaoDich) => giaoDich.don_hang)
  giao_dich_thanh_toan: GiaoDichThanhToan[];
}
