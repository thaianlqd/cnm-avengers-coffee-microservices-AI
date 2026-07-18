import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

/**
 * DeliveryTracking - Bảng riêng theo dõi thông tin giao hàng mở rộng.
 * Liên kết với don_hang qua ma_don_hang.
 * Không đụng vào bảng shipper_delivery gốc.
 */
@Entity({ name: 'delivery_tracking', schema: orderSchema })
export class DeliveryTracking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ma_don_hang: string;

  /**
   * Chế độ giao hàng:
   * - GIAO_TAN_NOI: Giao hàng tận nơi (cần shipper)
   * - LAY_TAI_QUAN: Khách đến lấy tại quán
   * - DUNG_TAI_CHO: Dùng tại chỗ (tại quán)
   */
  @Column({ type: 'varchar', default: 'GIAO_TAN_NOI' })
  delivery_mode: 'GIAO_TAN_NOI' | 'LAY_TAI_QUAN' | 'DUNG_TAI_CHO';

  /**
   * Phương thức giao hàng (chỉ áp dụng khi delivery_mode = GIAO_TAN_NOI):
   * - INTERNAL: Shipper nội bộ Avengers Coffee
   * - LALAMOVE: Giao qua Lalamove
   */
  @Column({ type: 'varchar', nullable: true })
  delivery_method: 'INTERNAL' | 'LALAMOVE' | null;

  /** Mã đơn Lalamove (nếu dùng Lalamove) */
  @Column({ type: 'varchar', nullable: true })
  lalamove_order_id: string | null;

  /** Link theo dõi Lalamove cho khách */
  @Column({ type: 'text', nullable: true })
  lalamove_share_link: string | null;

  /** Trạng thái Lalamove (nếu dùng) */
  @Column({ type: 'varchar', nullable: true })
  lalamove_status: string | null;

  /** Mã chi nhánh cửa hàng */
  @Column({ type: 'varchar', nullable: true })
  branch_code: string | null;

  /** Số bàn (nếu dùng tại chỗ) */
  @Column({ type: 'varchar', nullable: true })
  table_number: string | null;

  /** Thời gian lấy (nếu lấy tại quán) */
  @Column({ type: 'timestamp', nullable: true })
  pickup_time: Date | null;

  /** Tên khách hàng */
  @Column({ type: 'varchar', nullable: true })
  customer_name: string | null;

  /** SĐT khách hàng */
  @Column({ type: 'varchar', nullable: true })
  customer_phone: string | null;

  /** Mã tra cứu ngắn cho khách vãng lai (VD: AC-A1B2C) */
  @Column({ type: 'varchar', nullable: true, unique: true })
  tracking_code: string | null;

  /** ID shipper_delivery record (nếu có shipper nội bộ) */
  @Column({ type: 'uuid', nullable: true })
  shipper_delivery_id: string | null;

  /** Địa chỉ giao hàng */
  @Column({ type: 'text', nullable: true })
  delivery_address: string | null;

  /** Vĩ độ cửa hàng */
  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  store_latitude: number | null;

  /** Kinh độ cửa hàng */
  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  store_longitude: number | null;

  /** Vĩ độ điểm giao */
  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  destination_latitude: number | null;

  /** Kinh độ điểm giao */
  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  destination_longitude: number | null;

  /** Phí giao hàng (nếu có) */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: 0 })
  delivery_fee: number | null;

  /** Thời gian ước tính giao (phút) */
  @Column({ type: 'integer', nullable: true })
  estimated_minutes: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
