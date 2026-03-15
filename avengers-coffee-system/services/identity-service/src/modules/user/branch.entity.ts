import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const userSchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'chi_nhanh', schema: userSchema })
export class Branch {
  @PrimaryColumn({ type: 'varchar' })
  ma_chi_nhanh: string;

  @Column({ type: 'varchar', unique: true })
  ten_chi_nhanh: string;

  @Column({ type: 'text', nullable: true })
  dia_chi: string | null;

  @Column({ type: 'varchar', nullable: true })
  so_dien_thoai: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  trang_thai: string;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}
