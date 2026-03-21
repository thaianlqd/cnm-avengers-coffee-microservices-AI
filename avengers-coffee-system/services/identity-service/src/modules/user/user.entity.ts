import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, OneToMany } from 'typeorm';
import { DeliveryAddress } from './delivery-address.entity';

const userSchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'nguoi_dung', schema: userSchema })
export class User {
  @PrimaryGeneratedColumn('uuid')
  ma_nguoi_dung: string;

  @Column({ unique: true })
  ten_dang_nhap: string;

  @Column()
  mat_khau_hash: string;

  @Column()
  ho_ten: string;

  // SỬA Ở ĐÂY: Khai báo rõ type là 'varchar'
  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  // SỬA Ở ĐÂY: Khai báo rõ type là 'varchar'
  @Column({ type: 'varchar', unique: true, nullable: true })
  so_dien_thoai: string | null;

  // SỬA Ở ĐÂY: Khai báo rõ type là 'varchar'
  @Column({ type: 'varchar', nullable: true })
  avatar_url: string | null;

  @Column({ default: 'ACTIVE' })
  trang_thai: string;

  @Column({ type: 'varchar', default: 'CUSTOMER' })
  vai_tro: string;

  @Column({ type: 'varchar', nullable: true })
  co_so_ma: string | null;

  @Column({ type: 'varchar', nullable: true })
  co_so_ten: string | null;

  @Column({ type: 'int', default: 0 })
  diem_loyalty: number;

  @Column({ type: 'varchar', nullable: true })
  reset_password_code_hash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reset_password_code_expires_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reset_password_requested_at: Date | null;

  @Column({ type: 'int', default: 0 })
  reset_password_attempts: number;

  @CreateDateColumn()
  ngay_tao: Date;

  @OneToMany(() => DeliveryAddress, (address) => address.nguoi_dung)
  danh_sach_dia_chi: DeliveryAddress[];
}