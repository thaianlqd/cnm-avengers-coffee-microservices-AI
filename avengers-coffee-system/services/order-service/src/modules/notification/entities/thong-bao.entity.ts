import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type NotificationType = 'ORDER' | 'PAYMENT' | 'PROMOTION' | 'SYSTEM';

@Entity({ name: 'thong_bao' })
export class ThongBao {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  ma_nguoi_dung: string;

  @Column({ type: 'varchar', length: 120 })
  tieu_de: string;

  @Column({ type: 'text' })
  noi_dung: string;

  @Column({ type: 'varchar', length: 20, default: 'SYSTEM' })
  loai: NotificationType;

  @Column({ type: 'boolean', default: false })
  da_doc: boolean;

  @Column({ type: 'jsonb', nullable: true })
  du_lieu: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;
}
