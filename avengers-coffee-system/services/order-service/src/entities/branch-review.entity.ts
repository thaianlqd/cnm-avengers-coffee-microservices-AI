import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'danh_gia_chi_nhanh', schema: orderSchema })
export class BranchReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  ma_chi_nhanh: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ten_chi_nhanh: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ma_nguoi_dung: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ten_nguoi_dung: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  so_dien_thoai: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ma_don_hang: string | null;

  @Column({ type: 'int' })
  diem_tong_quan: number; // 1 to 5

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  tieu_chi: {
    phuc_vu?: number;
    ve_sinh?: number;
    toc_do?: number;
    chat_luong_mon?: number;
  };

  @Column({ type: 'text', nullable: true })
  nhan_xet: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  hinh_anh_urls: string[];

  @Column({ type: 'varchar', length: 20, default: 'APPROVED' })
  trang_thai: string; // APPROVED | HIDDEN

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}
