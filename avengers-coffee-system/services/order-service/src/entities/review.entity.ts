import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'danh_gia_san_pham', schema: orderSchema })
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  ma_san_pham: string;

  @Column({ type: 'uuid' })
  ma_nguoi_dung: string;

  @Column({ type: 'int' })
  so_sao: number; // 1-5

  @Column({ type: 'text', nullable: true })
  binh_luan: string | null;

  @Column({ type: 'uuid', nullable: true })
  ma_don_hang: string | null;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}
