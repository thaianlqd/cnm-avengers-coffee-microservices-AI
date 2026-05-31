import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ShipperDelivery } from './shipper-delivery.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'shipper', schema: orderSchema })
export class Shipper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ type: 'varchar' })
  full_name: string;

  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', default: 'ACTIVE' })
  status: 'ACTIVE' | 'INACTIVE' | 'ON_BREAK';

  @Column({ type: 'varchar', nullable: true })
  branch_code: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  current_latitude: number | null;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  current_longitude: number | null;

  @Column({ type: 'integer', default: 0 })
  total_deliveries: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 4.5 })
  rating: number;

  @Column({ type: 'text', nullable: true })
  avatar_url: string | null;

  @Column({ type: 'varchar', nullable: true })
  vehicle_type: string | null; // 'MOTORBIKE', 'CAR', 'BICYCLE'

  @Column({ type: 'varchar', nullable: true })
  vehicle_plate: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ShipperDelivery, (delivery) => delivery.shipper)
  deliveries: ShipperDelivery[];
}
