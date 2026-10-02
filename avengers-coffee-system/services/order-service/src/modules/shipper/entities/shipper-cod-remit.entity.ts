import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

export type CodRemitStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

@Entity({ name: 'shipper_cod_remit', schema: orderSchema })
export class ShipperCodRemit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  shipper_id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shipper_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  branch_code: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: CodRemitStatus;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'uuid', nullable: true })
  confirmed_by: string;

  @Column({ type: 'timestamp', nullable: true })
  confirmed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
