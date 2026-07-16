import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SanPham } from './san-pham.entity';
import { ThuocTinh } from './thuoc-tinh.entity';

const menuSchema = process.env.DB_SCHEMA || 'menu';

@Entity({ name: 'bien_the_san_pham', schema: menuSchema })
export class BienTheSanPham {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ma_san_pham: number;

  @ManyToOne(() => SanPham, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ma_san_pham' })
  sanPham: SanPham;

  @Column()
  ma_thuoc_tinh: number;

  @ManyToOne(() => ThuocTinh, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ma_thuoc_tinh' })
  thuocTinh: ThuocTinh;

  @Column()
  gia_tri: string; // e.g. "S", "Trân châu đen"

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  phu_thu: number; // e.g. 0, 5000, 10000
}
