import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { PromotionUsage } from './promotion-usage.entity';

const userSchema = process.env.DB_SCHEMA || 'identity';

/**
 * loai_khuyen_mai:
 *   PERCENT    — giảm theo %  (gia_tri = số %, vd 15 = 15%)
 *   FIXED      — giảm số tiền cố định (gia_tri = VNĐ, vd 20000)
 *   FREE_ITEM  — tặng kèm sản phẩm (gia_tri không dùng, ten_san_pham_tang được điền)
 */
@Entity({ name: 'khuyen_mai', schema: userSchema })
export class Promotion {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  ma_khuyen_mai: string;           // mã code dùng khi áp dụng  (VD: SUMMER10)

  @Column({ type: 'varchar', length: 200 })
  ten_khuyen_mai: string;           // tên hiển thị  (VD: Giảm 10% hè 2025)

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;             // mô tả chi tiết

  @Column({ type: 'varchar', length: 20 })
  loai_khuyen_mai: string;          // PERCENT | FIXED | FREE_ITEM

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  gia_tri: number;                  // giá trị % hoặc số tiền giảm

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  gia_tri_don_toi_thieu: number;    // giá trị đơn hàng tối thiểu để áp dụng (0 = không yêu cầu)

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  giam_toi_da: number | null;       // với loại PERCENT, giảm tối đa bao nhiêu tiền (null = không giới hạn)

  @Column({ type: 'int', default: 0 })
  so_luong_toi_da: number;          // tổng lượt sử dụng tối đa (0 = không giới hạn)

  @Column({ type: 'int', default: 0 })
  so_luong_da_dung: number;         // đã sử dụng bao nhiêu lượt

  @Column({ type: 'int', default: 1 })
  gioi_han_moi_nguoi: number;       // mỗi người dùng được dùng tối đa N lần

  @Column({ type: 'timestamptz', nullable: true })
  ngay_bat_dau: Date | null;        // ngày bắt đầu hiệu lực (null = ngay lập tức)

  @Column({ type: 'timestamptz', nullable: true })
  ngay_ket_thuc: Date | null;       // ngày hết hạn (null = vô thời hạn)

  @Column({ type: 'varchar', default: 'ACTIVE' })
  trang_thai: string;               // ACTIVE | INACTIVE | EXPIRED

  @Column({ type: 'boolean', default: true })
  hien_thi_cho_khach: boolean;      // có hiển thị trên trang khách hàng không

  @Column({ type: 'varchar', nullable: true })
  ten_san_pham_tang: string | null; // dành cho FREE_ITEM

  @Column({ type: 'varchar', nullable: true })
  hinh_anh: string | null;          // URL ảnh banner khuyến mãi

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;

  @OneToMany(() => PromotionUsage, (usage) => usage.khuyen_mai)
  lich_su_su_dung: PromotionUsage[];
}
