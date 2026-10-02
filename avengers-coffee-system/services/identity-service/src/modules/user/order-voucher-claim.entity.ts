import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

const identitySchema = process.env.DB_SCHEMA || 'identity';

@Entity({ name: 'order_voucher_claim', schema: identitySchema })
@Index(['ma_khuyen_mai', 'ma_nguoi_dung'])
export class OrderVoucherClaim {
  @PrimaryColumn({ type: 'uuid' })
  ma_don_hang: string;

  @Column({ type: 'varchar', length: 50 })
  ma_khuyen_mai: string;

  @Column({ type: 'varchar' })
  ma_nguoi_dung: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 0 })
  so_tien_giam: number;

  @CreateDateColumn()
  ngay_su_dung: Date;
}
