import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const inventorySchema = process.env.DB_SCHEMA || 'inventory';

@Entity({ name: 'kiosk_combo_delivery', schema: inventorySchema })
export class KioskComboDelivery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  ma_chi_nhanh_me: string;

  @Column({ type: 'varchar' })
  ma_kiosk: string;

  @Column({ type: 'varchar' })
  ten_combo: string;

  @Column({ type: 'text', nullable: true })
  mo_ta: string | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  trang_thai: string; // 'PENDING' | 'RECEIVED'

  @CreateDateColumn()
  thoi_gian_giao: Date;

  @Column({ type: 'timestamp', nullable: true })
  thoi_gian_nhan: Date | null;

  @Column({ type: 'varchar', nullable: true })
  nguoi_nhan: string | null;
}
