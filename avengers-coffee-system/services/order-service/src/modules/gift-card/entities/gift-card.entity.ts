import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'gift_cards', schema: orderSchema })
export class GiftCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  value: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  current_balance: number;

  @Column({ type: 'uuid' })
  sender_id: string;

  @Column({ type: 'varchar', length: 255 })
  sender_name: string;

  @Column({ type: 'varchar', length: 255 })
  receiver_email: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  receiver_phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receiver_name: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'varchar', length: 50, default: 'default' })
  theme: string;

  @Column({ type: 'enum', enum: ['ACTIVE', 'CLAIMED', 'REDEEMED', 'EXPIRED'], default: 'ACTIVE' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  redeemed_by: string; // customer_id of the person who redeemed it

  @Column({ type: 'timestamp', nullable: true })
  redeemed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
