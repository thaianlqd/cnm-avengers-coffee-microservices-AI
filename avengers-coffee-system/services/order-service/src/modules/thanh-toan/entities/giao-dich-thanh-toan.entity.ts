import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { DonHang } from './don-hang.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'giao_dich_thanh_toan', schema: orderSchema })
@Unique(['ma_tham_chieu'])
export class GiaoDichThanhToan {
  @PrimaryGeneratedColumn()
  ma_giao_dich: number;

  @Column({ type: 'uuid' })
  ma_don_hang: string;

  @ManyToOne(() => DonHang, (donHang) => donHang.giao_dich_thanh_toan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ma_don_hang' })
  don_hang: DonHang;

  @Column({ type: 'varchar' })
  cong_thanh_toan: string;

  @Column({ type: 'varchar' })
  ma_tham_chieu: string;

  @Column({ type: 'varchar', nullable: true })
  ma_giao_dich_cong: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  so_tien: number;

  @Column({ type: 'varchar', default: 'KHOI_TAO' })
  trang_thai: string;

  @Column({ type: 'text', nullable: true })
  du_lieu_tho: string | null;

  @CreateDateColumn()
  ngay_tao: Date;
}
