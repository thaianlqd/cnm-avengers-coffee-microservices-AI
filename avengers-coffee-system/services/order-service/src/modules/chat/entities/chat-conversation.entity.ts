import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'chat_conversation', schema: orderSchema })
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  ma_hoi_thoai: string;

  @Column({ type: 'varchar' })
  ma_khach_hang: string;

  @Column({ type: 'varchar', nullable: true })
  ten_khach_hang: string | null;

  @Column({ type: 'varchar', nullable: true })
  ma_nhan_su_phu_trach: string | null;

  @Column({ type: 'varchar', nullable: true })
  ten_nhan_su_phu_trach: string | null;

  @Column({ type: 'varchar', nullable: true })
  vai_tro_nhan_su_phu_trach: 'STAFF' | 'MANAGER' | null;

  @Column({ type: 'varchar', default: 'OPEN' })
  trang_thai: 'OPEN' | 'CLOSED';

  @Column({ type: 'text', nullable: true })
  tin_nhan_cuoi: string | null;

  @Column({ type: 'varchar', nullable: true })
  vai_tro_nguoi_gui_cuoi: 'CUSTOMER' | 'STAFF' | 'MANAGER' | null;

  @Column({ type: 'int', default: 0 })
  so_tin_nhan_chua_doc_khach: number;

  @Column({ type: 'int', default: 0 })
  so_tin_nhan_chua_doc_nhan_su: number;

  @CreateDateColumn()
  ngay_tao: Date;

  @UpdateDateColumn()
  ngay_cap_nhat: Date;
}