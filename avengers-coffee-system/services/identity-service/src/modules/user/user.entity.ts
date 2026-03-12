import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

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

  @Column({ type: 'int', default: 0 })
  diem_loyalty: number;

  @CreateDateColumn()
  ngay_tao: Date;
}