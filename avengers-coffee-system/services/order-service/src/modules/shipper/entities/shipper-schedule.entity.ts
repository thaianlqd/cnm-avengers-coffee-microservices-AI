import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Shipper } from './shipper.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'shipper_schedule', schema: orderSchema })
export class ShipperSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  shipper_id: string;

  @Column({ type: 'date' })
  work_date: Date;

  @Column({ type: 'varchar' })
  shift_name: string; // e.g. 'MORNING', 'AFTERNOON', 'EVENING'

  @Column({ type: 'timestamp', nullable: true })
  check_in_time: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  check_out_time: Date | null;

  @Column({ type: 'varchar', default: 'SCHEDULED' })
  status: 'SCHEDULED' | 'WORKING' | 'COMPLETED' | 'ABSENT';

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Shipper)
  shipper: Shipper;
}
