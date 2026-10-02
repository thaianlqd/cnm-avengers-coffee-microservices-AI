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

  @Column({ type: 'varchar', nullable: true })
  ten_voucher: string | null;

  // 'PUBLIC' (mã công khai) | 'TEMPLATE' (template dùng cho chương trình nội bộ)
  @Column({ type: 'varchar', default: 'PUBLIC' })
  loai_phan_phoi: string;

  // Chuỗi ngữ cảnh sử dụng cách nhau dấu phẩy: TIER_UP, LUCKY_WHEEL, BIRTHDAY, FREESHIP
  @Column({ type: 'varchar', nullable: true })
  ngu_canh_su_dung: string | null;

  // Số ngày hiệu lực sau khi cấp mã cho khách (dành cho TEMPLATE)
  @Column({ type: 'int', default: 30, nullable: true })
  so_ngay_hieu_luc: number | null;

  // Giới hạn mỗi người sử dụng bao nhiêu lần (dành cho PUBLIC)
  @Column({ type: 'int', default: 1, nullable: true })
  gioi_han_moi_nguoi: number | null;

  // Tên sản phẩm tặng kèm (khi loai = FREE_ITEM)
  @Column({ type: 'varchar', nullable: true })
  ten_san_pham_tang: string | null;

  // Ngày bắt đầu hiệu lực
  @Column({ type: 'timestamp', nullable: true })
  ngay_bat_dau: Date | null;

  // Hiển thị cho khách hàng trên trang khuyến mãi công khai
  @Column({ type: 'boolean', default: true })
  hien_thi_cho_khach: boolean;

  // URL hình ảnh banner
  @Column({ type: 'varchar', nullable: true })
  hinh_anh: string | null;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}
