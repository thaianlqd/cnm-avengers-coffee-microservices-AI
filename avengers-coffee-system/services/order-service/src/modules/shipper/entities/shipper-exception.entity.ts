import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Shipper } from './shipper.entity';
import { ShipperDelivery } from './shipper-delivery.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'shipper_exception', schema: orderSchema })
export class ShipperException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  shipper_id: string;

  @Column({ type: 'uuid' })
  delivery_id: string;

  @Column({ type: 'varchar' })
  exception_type: 'CUSTOMER_UNREACHABLE' | 'WRONG_ADDRESS' | 'ITEM_DAMAGED' | 'VEHICLE_ISSUE' | 'OTHER';

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  image_url: string | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: 'PENDING' | 'APPROVED' | 'REJECTED';

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Shipper)
  shipper: Shipper;

  @ManyToOne(() => ShipperDelivery)
  delivery: ShipperDelivery;
}
