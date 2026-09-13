import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'smtp_config', schema: orderSchema })
export class SmtpConfig {
  @PrimaryColumn({ type: 'varchar', default: 'DEFAULT' })
  id: string;

  @Column({ type: 'varchar', default: 'smtp.gmail.com' })
  host: string;

  @Column({ type: 'int', default: 587 })
  port: number;

  @Column({ type: 'boolean', default: false })
  secure: boolean;

  @Column({ type: 'varchar', nullable: true })
  auth_user: string | null;

  @Column({ type: 'varchar', nullable: true })
  auth_pass: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'support@avengers.coffee' })
  from_email: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'Avengers Coffee' })
  from_name: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
