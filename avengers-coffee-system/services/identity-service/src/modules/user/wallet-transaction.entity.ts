import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

const userSchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'vi_giao_dich', schema: userSchema })
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  ma_giao_dich: string;

  @Column({ type: 'uuid' })
  ma_nguoi_dung: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  so_tien: number; // >0 là nạp, <0 là trừ

  @Column({ type: 'varchar' })
  loai_giao_dich: string; // VD: NAP_TIEN, MUA_COMBO, TRA_CONG_NO, TRA_ROYALTY

  @Column({ type: 'varchar', nullable: true })
  mo_ta: string;

  @CreateDateColumn()
  ngay_tao: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ma_nguoi_dung' })
  nguoi_dung: User;
}
