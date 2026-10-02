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

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  gia_niem_yet: number | null;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;

  @Column({ type: 'varchar', nullable: true })
  hinh_anh_url: string | null;

  @Column({ default: true })
  trang_thai: boolean;

  @Column({ default: false })
  la_hot: boolean;

  @Column({ default: false })
  la_moi: boolean;

  @Column({ type: 'jsonb', nullable: true })
  sizes: any;

  @Column({ type: 'jsonb', nullable: true })
  luong_da: any;

  @Column({ type: 'jsonb', nullable: true })
  do_ngot: any;

  @Column({ type: 'jsonb', nullable: true })
  loai_sua: any;

  @Column({ type: 'jsonb', nullable: true })
  toppings: any;

  @Column({ type: 'jsonb', nullable: true })
  bien_the: any;

  @ManyToOne(() => DanhMuc, (dm) => dm.danhSachsSanPham)
  @JoinColumn({ name: 'ma_danh_muc' })
  danhMuc: DanhMuc;
}