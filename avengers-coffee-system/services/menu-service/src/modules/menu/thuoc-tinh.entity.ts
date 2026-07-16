import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { BienTheSanPham } from './bien-the-san-pham.entity';

const menuSchema = process.env.DB_SCHEMA || 'menu';

@Entity({ name: 'thuoc_tinh', schema: menuSchema })
export class ThuocTinh {
  @PrimaryGeneratedColumn()
  ma_thuoc_tinh: number;

  @Column({ unique: true })
  ten_thuoc_tinh: string;

  @OneToMany(() => BienTheSanPham, (bt) => bt.thuocTinh)
  bienThes: BienTheSanPham[];
}
