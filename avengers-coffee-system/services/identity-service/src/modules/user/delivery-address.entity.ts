import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

const userSchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'dia_chi_giao_hang', schema: userSchema })
export class DeliveryAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'uuid' })
  ma_nguoi_dung: string;

  @ManyToOne(() => User, (user) => user.danh_sach_dia_chi, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ma_nguoi_dung', referencedColumnName: 'ma_nguoi_dung' })
  nguoi_dung: User;

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