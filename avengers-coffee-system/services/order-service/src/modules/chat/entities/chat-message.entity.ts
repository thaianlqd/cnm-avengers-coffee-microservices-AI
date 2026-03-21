import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ChatConversation } from './chat-conversation.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'chat_message', schema: orderSchema })
export class ChatMessage {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'uuid' })
  ma_hoi_thoai: string;

  @ManyToOne(() => ChatConversation, (conversation) => conversation.tin_nhan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ma_hoi_thoai', referencedColumnName: 'ma_hoi_thoai' })
  hoi_thoai: ChatConversation;

  @Column({ type: 'varchar' })
  ma_nguoi_gui: string;

  @Column({ type: 'varchar', nullable: true })
  ten_nguoi_gui: string | null;

  @Column({ type: 'varchar' })
  vai_tro_nguoi_gui: 'CUSTOMER' | 'STAFF' | 'MANAGER';

  @Column({ type: 'text' })
  noi_dung: string;

  @CreateDateColumn()
  ngay_tao: Date;
}