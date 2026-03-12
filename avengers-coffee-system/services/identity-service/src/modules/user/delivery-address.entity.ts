import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const userSchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'dia_chi_giao_hang', schema: userSchema })
export class DeliveryAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  ma_nguoi_dung: string;

  @Column({ type: 'varchar' })
  ten_dia_chi: string;

  @Column({ type: 'text' })
  dia_chi_day_du: string;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @Column({ type: 'boolean', default: false })
  mac_dinh: boolean;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}