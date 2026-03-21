import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { SanPham } from './san-pham.entity';

const menuSchema = process.env.DB_SCHEMA || 'menu';

@Entity({ name: 'danh_muc', schema: menuSchema })
export class DanhMuc {
  @PrimaryGeneratedColumn()
  ma_danh_muc: number;

  @Column()
  ten_danh_muc: string;

  @Column({ type: 'varchar', nullable: true })
  hinh_anh_icon: string | null;

  @OneToMany(() => SanPham, (sp) => sp.danhMuc)
  danhSachsSanPham: SanPham[];
}