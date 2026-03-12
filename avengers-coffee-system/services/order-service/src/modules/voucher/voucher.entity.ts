import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'voucher', schema: orderSchema })
export class Voucher {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  ma_voucher: string;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;

  // 'PERCENT' giảm theo %, 'AMOUNT' giảm số tiền cố định
  @Column({ type: 'varchar', default: 'AMOUNT' })
  loai: string;

  // PERCENT: số % (ví dụ: 10 = 10%). AMOUNT: số tiền giảm cố định
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  gia_tri: number;

  // Số tiền giảm tối đa (chỉ dùng khi loai = PERCENT)
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  giam_toi_da: number | null;

  // Giá trị đơn hàng tối thiểu để được áp dụng voucher
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  don_hang_toi_thieu: number;

  // Tổng lượt dùng tối đa (null = không giới hạn)
  @Column({ type: 'int', nullable: true })
  tong_luot_dung: number | null;

  // Số lượt đã sử dụng
  @Column({ type: 'int', default: 0 })
  luot_da_dung: number;

  // Hạn sử dụng (null = không có hạn)
  @Column({ type: 'timestamp', nullable: true })
  han_su_dung: Date | null;

  // 'ACTIVE' | 'INACTIVE'
  @Column({ type: 'varchar', default: 'ACTIVE' })
  trang_thai: string;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}
