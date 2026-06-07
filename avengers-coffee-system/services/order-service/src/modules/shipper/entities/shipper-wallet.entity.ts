import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Shipper } from './shipper.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'shipper_wallet', schema: orderSchema })
export class ShipperWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  shipper_id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  cod_holding: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  pending_commission: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => Shipper)
  @JoinColumn()
  shipper: Shipper;
}
