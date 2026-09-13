import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const userSchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'khu_vuc', schema: userSchema })
export class KhuVuc {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  ma_khu_vuc: string;

  @Column({ type: 'varchar', length: 200 })
  ten_khu_vuc: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  thanh_pho: string | null;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nguoi_quan_ly_ma: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  trang_thai: 'ACTIVE' | 'INACTIVE';

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
