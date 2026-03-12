import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'gio_hang', schema: orderSchema })
export class CartItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ma_nguoi_dung: string; // Lấy từ identity-service

  @Column()
  ma_san_pham: number;

  @Column()
  ten_san_pham: string;

  @Column({ type: 'decimal' })
  gia_ban: number;

  @Column()
  hinh_anh_url: string;

  @Column({ name: 'kich_co', default: 'Nhỏ' })
  size: string;

  @Column({ default: 1 })
  so_luong: number;
}