import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const inventorySchema = process.env.DB_SCHEMA || 'inventory';

@Entity({ name: 'ton_kho_san_pham', schema: inventorySchema })
export class InventoryItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true })
  ma_san_pham: number;

  @Column({ type: 'int', default: 0 })
  so_luong_ton: number;

  @Column({ type: 'int', default: 0 })
  muc_canh_bao: number;

  @Column({ type: 'boolean', default: true })
  dang_kinh_doanh: boolean;

  @UpdateDateColumn()
  cap_nhat_luc: Date;
}
