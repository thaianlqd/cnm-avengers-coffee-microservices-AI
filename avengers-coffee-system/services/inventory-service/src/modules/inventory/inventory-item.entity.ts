import { Column, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

const inventorySchema = process.env.DB_SCHEMA || 'inventory';

@Entity({ name: 'ton_kho_san_pham', schema: inventorySchema })
@Unique('uq_ton_kho_san_pham_branch_product', ['co_so_ma', 'ma_san_pham'])
export class InventoryItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', default: 'MAC_DINH_CHI' })
  co_so_ma: string;

  @Column({ type: 'int' })
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
