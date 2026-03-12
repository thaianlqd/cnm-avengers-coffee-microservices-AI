import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DonHang } from './don-hang.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'chi_tiet_don_hang', schema: orderSchema })
export class ChiTietDonHang {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  ma_don_hang: string;

  @ManyToOne(() => DonHang, (donHang) => donHang.chi_tiet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ma_don_hang' })
  don_hang: DonHang;

  @Column({ type: 'int' })
  ma_san_pham: number;

  @Column({ type: 'varchar' })
  ten_san_pham: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  gia_ban: number;

  @Column({ type: 'int', default: 1 })
  so_luong: number;

  @Column({ type: 'varchar', nullable: true })
  kich_co: string | null;

  @Column({ type: 'varchar', nullable: true })
  hinh_anh_url: string | null;
}
