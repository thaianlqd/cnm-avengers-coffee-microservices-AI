import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { DanhMuc } from './danh-muc.entity';

const menuSchema = process.env.DB_SCHEMA || 'menu';

@Entity({ name: 'san_pham', schema: menuSchema })
export class SanPham {
  @PrimaryGeneratedColumn()
  ma_san_pham: number;

  @Column()
  ten_san_pham: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  gia_ban: number;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;

  @Column({ type: 'varchar', nullable: true })
  hinh_anh_url: string | null;

  @Column({ default: true })
  trang_thai: boolean;

  @ManyToOne(() => DanhMuc, (dm) => dm.danhSachsSanPham)
  @JoinColumn({ name: 'ma_danh_muc' })
  danhMuc: DanhMuc;
}