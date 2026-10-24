import { AfterLoad, BeforeInsert, BeforeUpdate, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const orderSchema = process.env.DB_SCHEMA || 'orders';

@Entity({ name: 'kiosk_shift_session', schema: orderSchema })
export class KioskShiftSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  co_so_ma: string;

  @Column({ type: 'varchar', length: 24, default: 'FRANCHISE_KIOSK' })
  session_scope: 'FRANCHISE_KIOSK' | 'STORE_BRANCH';

  @Column({ type: 'varchar', length: 100, nullable: true })
  staff_username: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  staff_name: string | null;

  @Column({ type: 'varchar', length: 30, default: 'OPEN' })
  trang_thai: 'OPEN' | 'CLOSE_PENDING' | 'CLOSED' | 'FORCE_CLOSED' | 'CLOSE_REJECTED';

  @Column({ type: 'timestamptz' })
  thoi_gian_mo_ca: Date;

  @Column({ type: 'timestamptz', nullable: true })
  thoi_gian_dong_ca: Date | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  tien_dau_ca: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  tien_cuoi_ca: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  tien_mat_he_thong: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  doanh_thu_he_thong: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  tien_mat_ky_vong: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  chenh_lech: number | null;

  @Column({ type: 'int', default: 0 })
  tong_don_hang: number;

  @Column({ type: 'int', default: 0 })
  tong_don_tien_mat: number;

  @Column({ type: 'text', nullable: true })
  ghi_chu: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  dong_ca_boi: string | null;

  close_requested_at: Date | null;

  close_requested_by: string | null;

  close_approved_by: string | null;

  close_approved_at: Date | null;

  close_approval_note: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  du_lieu_chi_tiet: {
    close_review?: { requested_at?: string | null; requested_by?: string | null; approved_at?: string | null; approved_by?: string | null; note?: string | null };
    non_cash_revenue?: number;
    cash_in_gross?: number;
    cash_change_out?: number;
    online_revenue?: number;
    in_store_revenue?: number;
  };

  // Review metadata lives in the existing JSON journal. No extra database columns
  // are required to read active sessions or review a completed session.
  @AfterLoad()
  restoreCloseReview() {
    const review = this.du_lieu_chi_tiet?.close_review;
    this.close_requested_at = review?.requested_at ? new Date(review.requested_at) : null;
    this.close_requested_by = review?.requested_by || null;
    this.close_approved_at = review?.approved_at ? new Date(review.approved_at) : null;
    this.close_approved_by = review?.approved_by || null;
    this.close_approval_note = review?.note || null;
  }

  @BeforeInsert()
  @BeforeUpdate()
  storeCloseReview() {
    if (!this.close_requested_at && !this.close_approved_at && !this.du_lieu_chi_tiet?.close_review) return;
    this.du_lieu_chi_tiet = {
      ...this.du_lieu_chi_tiet,
      close_review: {
        requested_at: this.close_requested_at?.toISOString() || null,
        requested_by: this.close_requested_by || null,
        approved_at: this.close_approved_at?.toISOString() || null,
        approved_by: this.close_approved_by || null,
        note: this.close_approval_note || null,
      },
    };
  }

  @CreateDateColumn({ type: 'timestamptz' })
  ngay_tao: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  ngay_cap_nhat: Date;
}
