import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'khao_sat_bieu_mau', schema: orderSchema })
export class SurveyForm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  tieu_de: string;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  cau_hoi: Array<{
    id: string;
    tieu_de: string;
    loai: 'rating' | 'text' | 'choice' | 'paragraph' | 'checkbox' | 'dropdown' | 'date' | 'time';
    bat_buoc: boolean;
    lua_chon?: string[];
  }>;

  @Column({ type: 'boolean', default: false })
  trang_thai: boolean;

  @Column({ type: 'varchar', nullable: true })
  nguoi_tao: string | null;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}
