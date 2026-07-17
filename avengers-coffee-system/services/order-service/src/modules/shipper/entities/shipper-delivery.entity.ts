import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { Shipper } from './shipper.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'shipper_delivery', schema: orderSchema })
export class ShipperDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ma_don_hang: string;

  @Column({ type: 'uuid' })
  shipper_id: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: 'PENDING' | 'CONFIRMED' | 'PICKING_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

  @Column({ type: 'text', nullable: true })
  delivery_note: string | null;

  @Column({ type: 'varchar', nullable: true })
  delivery_address: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  pickup_latitude: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  pickup_longitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  delivery_latitude: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  delivery_longitude: number | null;

  @Column({ type: 'integer', nullable: true })
  estimated_time_minutes: number | null;

  @Column({ type: 'timestamp', nullable: true })
  picked_up_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  delivered_at: Date | null;

  @Column({ type: 'text', nullable: true })
  proof_image_url: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  delivery_fee: number | null;

  @CreateDateColumn()
  assigned_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Shipper, (shipper) => shipper.deliveries, { onDelete: 'SET NULL' })
  shipper: Shipper | null;
}
