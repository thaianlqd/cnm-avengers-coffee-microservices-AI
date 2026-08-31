import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'audit_log', schema: 'franchise' })
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  admin_id: string | null;

  @Column({ type: 'varchar', length: 255 })
  hanh_dong: string;

  @Column({ type: 'text', nullable: true })
  chi_tiet: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  thoi_gian: Date;
}
