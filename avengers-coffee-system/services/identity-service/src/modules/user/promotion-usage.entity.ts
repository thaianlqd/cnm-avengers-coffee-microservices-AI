import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Promotion } from './promotion.entity';

const userSchema = process.env.DB_SCHEMA || 'identity';

/** Ghi nhận mỗi lần một user dùng một mã khuyến mãi */
@Entity({ name: 'khuyen_mai_su_dung', schema: userSchema })
@Index(['ma_khuyen_mai', 'ma_nguoi_dung'])
export class PromotionUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  ma_khuyen_mai: string;

  @ManyToOne(() => Promotion, (promotion) => promotion.lich_su_su_dung, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ma_khuyen_mai', referencedColumnName: 'ma_khuyen_mai' })
  khuyen_mai: Promotion;

  @Column({ type: 'varchar' })
  ma_nguoi_dung: string;

  @Column({ type: 'varchar', nullable: true })
  ma_don_hang: string | null;       // đơn hàng đã áp dụng (nếu có)

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  so_tien_giam: number;             // số tiền thực tế đã giảm

  @CreateDateColumn()
  ngay_su_dung: Date;
}
