import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'yeu_thich_san_pham', schema: orderSchema })
@Unique('uq_favorite_user_product', ['ma_nguoi_dung', 'ma_san_pham'])
export class FavoriteItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  ma_nguoi_dung: string;

  @Column({ type: 'varchar', length: 64 })
  ma_san_pham: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ten_san_pham: string | null;

  @Column({ type: 'numeric', nullable: true })
  gia_ban: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  hinh_anh_url: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  danh_muc: string | null;

  @CreateDateColumn()
  ngay_tao: Date;
}
