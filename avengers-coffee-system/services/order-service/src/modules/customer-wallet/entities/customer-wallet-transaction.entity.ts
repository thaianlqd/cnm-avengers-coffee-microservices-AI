import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'customer_wallet_transaction', schema: orderSchema })
export class CustomerWalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 50 })
  type: 'TOP_UP' | 'PAYMENT' | 'REFUND';

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  status: 'PENDING' | 'SUCCESS' | 'FAILED';

  @Column({ type: 'varchar', nullable: true })
  reference_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}
