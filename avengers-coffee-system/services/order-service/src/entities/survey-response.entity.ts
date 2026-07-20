import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'khao_sat_phan_hoi', schema: orderSchema })
export class SurveyResponse {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  ma_bieu_mau: number;

  @Column({ type: 'varchar', nullable: true })
  ma_nguoi_dung: string | null;

  @Column({ type: 'varchar', nullable: true })
  ten_nguoi_dung: string | null;

  @Column({ type: 'varchar', nullable: true })
  so_dien_thoai: string | null;

  @Column({ type: 'varchar', nullable: true })
  ma_don_hang: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tra_loi: Array<{
    cau_hoi_id: string;
    cau_hoi_tieu_de: string;
    cau_tra_loi: string | number;
  }>;

  @CreateDateColumn()
  ngay_tao: Date;
}
