import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DonHang } from '../modules/thanh-toan/entities/don-hang.entity';
import { Review } from '../entities/review.entity';
import { assertRating, duplicateReview, isPublicReview, lockReviewOrder } from './review-policy';

const orderSchema = process.env.DB_SCHEMA || 'orders';
const identitySchema = process.env.IDENTITY_DB_SCHEMA || 'identity';
import { BranchReview } from '../entities/branch-review.entity';

export class CreateBranchReviewDto {
  ma_chi_nhanh: string;
  ten_chi_nhanh?: string;
  ma_nguoi_dung?: string;
  ten_nguoi_dung?: string;
  so_dien_thoai?: string;
  ma_don_hang?: string;
  diem_tong_quan: number;
  danh_gia_dich_vu?: number;
  danh_gia_shipper?: number;
  danh_gia_mon?: Array<{ ma_san_pham: string; so_sao: number; binh_luan?: string }>;
  tieu_chi?: {
    phuc_vu?: number;
    ve_sinh?: number;
    toc_do?: number;
    chat_luong_mon?: number;
  };
  nhan_xet?: string;
  hinh_anh_urls?: string[];
  // Nhượng quyền: có thể đánh giá kiosk thay vì chi nhánh thưỜng
  ma_kiosk?: string;
}

@Injectable()
export class BranchReviewService {
  constructor(
    @InjectRepository(BranchReview)
    private readonly branchReviewRepo: Repository<BranchReview>,
  ) {}

  async taoDanhGia(dto: CreateBranchReviewDto, userId: string): Promise<BranchReview> {
    const rating = dto.danh_gia_dich_vu ?? dto.diem_tong_quan;
    assertRating(rating);
    for (const value of Object.values(dto.tieu_chi || {})) assertRating(value);
    if (dto.danh_gia_shipper !== undefined) assertRating(dto.danh_gia_shipper);
    if (dto.danh_gia_mon !== undefined && !Array.isArray(dto.danh_gia_mon)) {
      throw new BadRequestException('Danh sách đánh giá món không hợp lệ');
    }
    const products = dto.danh_gia_mon || [];
    const ids = products.map((item) => String(item.ma_san_pham));
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Mỗi món chỉ được đánh giá một lần');
    products.forEach((item) => assertRating(item.so_sao));

    return this.branchReviewRepo.manager.transaction(async (manager) => {
      const order = await lockReviewOrder(manager, dto.ma_don_hang, userId);
      if ((dto.ma_chi_nhanh && dto.ma_chi_nhanh !== order.co_so_ma) ||
          (dto.ma_kiosk && dto.ma_kiosk !== order.co_so_ma)) {
        throw new BadRequestException('Chi nhánh đánh giá phải là chi nhánh xử lý đơn hàng');
      }
      const branchRepo = manager.getRepository(BranchReview);
      const productRepo = manager.getRepository(Review);
      if (await branchRepo.findOne({ where: { ma_don_hang: order.ma_don_hang } })) throw duplicateReview();

      const purchased = await manager.query(
        `SELECT DISTINCT CAST(ma_san_pham AS text) AS ma_san_pham
         FROM "${orderSchema}"."chi_tiet_don_hang" WHERE ma_don_hang = $1`, [order.ma_don_hang],
      );
      if (ids.some((id) => !purchased.some((item) => item.ma_san_pham === id))) {
        throw new BadRequestException('Chỉ được đánh giá món trong đơn hàng đã chọn');
      }
      const [customer] = await manager.query(
        `SELECT ho_ten FROM "${identitySchema}"."nguoi_dung" WHERE ma_nguoi_dung::text = $1`, [userId],
      );
      let shipperId: string | undefined;
      if (dto.danh_gia_shipper !== undefined) {
        const [delivery] = await manager.query(
          `SELECT shipper_id FROM "${orderSchema}"."shipper_delivery"
           WHERE ma_don_hang = $1 AND status = 'DELIVERED' ORDER BY delivered_at DESC NULLS LAST LIMIT 1`,
          [order.ma_don_hang],
        );
        if (!delivery) throw new BadRequestException('Đơn hàng chưa có tài xế giao thành công để đánh giá');
        shipperId = delivery.shipper_id;
      }
      for (const item of products) {
        const existing = await productRepo.findOne({ where: { ma_don_hang: order.ma_don_hang, ma_san_pham: String(item.ma_san_pham), ma_nguoi_dung: userId } });
        // Older clients may already have reviewed individual items. Preserve
        // those ratings when finalizing the service review for the same order.
        if (!existing) await productRepo.save(productRepo.create({
          ma_don_hang: order.ma_don_hang,
          ma_nguoi_dung: userId,
          ma_san_pham: String(item.ma_san_pham),
          so_sao: item.so_sao,
          binh_luan: item.binh_luan?.trim().slice(0, 2000) || null,
        }));
      }
      let branchName: string = dto.ten_chi_nhanh || '';
      try {
        const [branchRow] = await manager.query(
          `SELECT ten_co_so FROM "master_data"."co_so" WHERE co_so_ma = $1 LIMIT 1`,
          [order.co_so_ma],
        );
        if (branchRow?.ten_co_so) {
          branchName = branchRow.ten_co_so;
        } else {
          const [kioskRow] = await manager.query(
            `SELECT ten_kiosk FROM "franchise"."kiosk" WHERE ma_kiosk = $1 LIMIT 1`,
            [order.co_so_ma],
          );
          if (kioskRow?.ten_kiosk) branchName = kioskRow.ten_kiosk;
        }
      } catch {}

      return branchRepo.save(branchRepo.create({
        ma_chi_nhanh: order.co_so_ma,
        ten_chi_nhanh: branchName || order.co_so_ma,
        ma_nguoi_dung: userId,
        ten_nguoi_dung: customer?.ho_ten || 'Khách hàng',
        so_dien_thoai: null,
        ma_don_hang: order.ma_don_hang,
        diem_tong_quan: rating,
        tieu_chi: {
          phuc_vu: rating,
          ve_sinh: rating,
          toc_do: rating,
          chat_luong_mon: products.length ? Number((products.reduce((sum, item) => sum + item.so_sao, 0) / products.length).toFixed(1)) : rating,
          ...dto.tieu_chi,
          ...(shipperId ? { ma_shipper: shipperId, danh_gia_shipper: dto.danh_gia_shipper } : {}),
        },
        nhan_xet: dto.nhan_xet?.trim().slice(0, 2000) || null,
        hinh_anh_urls: [],
        trang_thai: 'APPROVED',
      }));
    });
  }

  async layNguCanhDanhGia(orderId: string, userId: string) {
    return this.branchReviewRepo.manager.transaction(async (manager) => {
      const order = await lockReviewOrder(manager, orderId, userId);
      const [delivery] = await manager.query(
        `SELECT shipper_id FROM "${orderSchema}"."shipper_delivery" WHERE ma_don_hang = $1 AND status = 'DELIVERED' LIMIT 1`, [orderId],
      );
      const products = await manager.query(
        `SELECT CAST(ct.ma_san_pham AS text) AS ma_san_pham, MAX(ct.ten_san_pham) AS ten_san_pham,
                MAX(r.so_sao) AS so_sao
         FROM "${orderSchema}"."chi_tiet_don_hang" ct
         LEFT JOIN "${orderSchema}"."danh_gia_san_pham" r ON r.ma_don_hang = ct.ma_don_hang AND r.ma_san_pham = CAST(ct.ma_san_pham AS text)
         WHERE ct.ma_don_hang = $1 GROUP BY ct.ma_san_pham`, [orderId],
      );
      const existing = await manager.getRepository(BranchReview).findOne({ where: { ma_don_hang: orderId } });

      let branchName = order.co_so_ma;
      let branchAddress = '';
      try {
        const [branchRow] = await manager.query(
          `SELECT ten_co_so, tinh_thanh FROM "master_data"."co_so" WHERE co_so_ma = $1 LIMIT 1`,
          [order.co_so_ma],
        );
        if (branchRow) {
          branchName = branchRow.ten_co_so || branchName;
          branchAddress = branchRow.tinh_thanh || '';
        } else {
          const [kioskRow] = await manager.query(
            `SELECT ten_kiosk, dia_chi FROM "franchise"."kiosk" WHERE ma_kiosk = $1 LIMIT 1`,
            [order.co_so_ma],
          );
          if (kioskRow) {
            branchName = kioskRow.ten_kiosk || branchName;
            branchAddress = kioskRow.dia_chi || '';
          }
        }
      } catch {}

      return {
        ma_chi_nhanh: order.co_so_ma,
        ten_chi_nhanh: branchName,
        dia_chi_chi_nhanh: branchAddress,
        loai_don_hang: order.loai_don_hang,
        hasShipper: !!delivery,
        reviewed: !!existing,
        products,
      };
    });
  }

  private publicQuery() {
    return this.branchReviewRepo.createQueryBuilder('review')
      .innerJoin(DonHang, 'dh', 'dh.ma_don_hang::text = review.ma_don_hang AND dh.co_so_ma = review.ma_chi_nhanh AND dh.ma_nguoi_dung = review.ma_nguoi_dung')
      .where('review.trang_thai = :status', { status: 'APPROVED' })
      .andWhere('dh.trang_thai_don_hang = :completed', { completed: 'HOAN_THANH' });
  }

  async layDanhGiaCuaToi(userId: string) {
    const rows = await this.branchReviewRepo.find({ where: { ma_nguoi_dung: userId } });
    return { orderIds: rows.map((row) => row.ma_don_hang).filter(Boolean) };
  }

  async layDanhSachDanhGiaChiNhanh(ma_chi_nhanh: string) {
    const reviews = await this.publicQuery().andWhere('review.ma_chi_nhanh = :branch', { branch: ma_chi_nhanh }).orderBy('review.ngay_tao', 'DESC').getMany();

    const formattedReviews = reviews.filter(isPublicReview).map((r) => {
      const displayName = r.ten_nguoi_dung || 'Khách hàng';
      return {
        ...r,
        ten_nguoi_dung: displayName,
      };
    });

    const totalCount = formattedReviews.length;
    if (totalCount === 0) {
      return {
        ma_chi_nhanh,
        diem_trung_binh: 0,
        tong_luot_danh_gia: 0,
        tieu_chi_trung_binh: {
          phuc_vu: 0,
          ve_sinh: 0,
          toc_do: 0,
          chat_luong_mon: 0,
        },
        rating_breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        items: [],
      };
    }

    const sumScore = formattedReviews.reduce((acc, curr) => acc + curr.diem_tong_quan, 0);
    const avgScore = Number((sumScore / totalCount).toFixed(1));

    let sumPhucVu = 0;
    let sumVeSinh = 0;
    let sumTocDo = 0;
    let sumChatLuong = 0;
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    formattedReviews.forEach((r) => {
      if (r.diem_tong_quan >= 1 && r.diem_tong_quan <= 5) {
        breakdown[r.diem_tong_quan as keyof typeof breakdown]++;
      }
      if (r.tieu_chi) {
        sumPhucVu += r.tieu_chi.phuc_vu || r.diem_tong_quan;
        sumVeSinh += r.tieu_chi.ve_sinh || r.diem_tong_quan;
        sumTocDo += r.tieu_chi.toc_do || r.diem_tong_quan;
        sumChatLuong += r.tieu_chi.chat_luong_mon || r.diem_tong_quan;
      } else {
        sumPhucVu += r.diem_tong_quan;
        sumVeSinh += r.diem_tong_quan;
        sumTocDo += r.diem_tong_quan;
        sumChatLuong += r.diem_tong_quan;
      }
    });

    return {
      ma_chi_nhanh,
      diem_trung_binh: avgScore,
      tong_luot_danh_gia: totalCount,
      tieu_chi_trung_binh: {
        phuc_vu: Number((sumPhucVu / totalCount).toFixed(1)),
        ve_sinh: Number((sumVeSinh / totalCount).toFixed(1)),
        toc_do: Number((sumTocDo / totalCount).toFixed(1)),
        chat_luong_mon: Number((sumChatLuong / totalCount).toFixed(1)),
      },
      rating_breakdown: breakdown,
      items: formattedReviews,
    };
  }

  async layThongKeTatCaChiNhanh() {
    const reviews = await this.publicQuery().getMany();

    const branchMap = new Map<string, BranchReview[]>();
    reviews.filter(isPublicReview).forEach((r) => {
      const list = branchMap.get(r.ma_chi_nhanh) || [];
      list.push(r);
      branchMap.set(r.ma_chi_nhanh, list);
    });

    const result = Array.from(branchMap.entries()).map(([ma_chi_nhanh, items]) => {
      const totalCount = items.length;
      const avgScore = Number(
        (items.reduce((sum, item) => sum + item.diem_tong_quan, 0) / totalCount).toFixed(1),
      );
      const name = items[0]?.ten_chi_nhanh || ma_chi_nhanh;

      let sumPhucVu = 0, sumVeSinh = 0, sumTocDo = 0, sumChatLuong = 0;
      items.forEach((item) => {
        sumPhucVu += item.tieu_chi?.phuc_vu || item.diem_tong_quan;
        sumVeSinh += item.tieu_chi?.ve_sinh || item.diem_tong_quan;
        sumTocDo += item.tieu_chi?.toc_do || item.diem_tong_quan;
        sumChatLuong += item.tieu_chi?.chat_luong_mon || item.diem_tong_quan;
      });

      return {
        ma_chi_nhanh,
        ten_chi_nhanh: name,
        diem_trung_binh: avgScore,
        tong_luot_danh_gia: totalCount,
        tieu_chi_trung_binh: {
          phuc_vu: Number((sumPhucVu / totalCount).toFixed(1)),
          ve_sinh: Number((sumVeSinh / totalCount).toFixed(1)),
          toc_do: Number((sumTocDo / totalCount).toFixed(1)),
          chat_luong_mon: Number((sumChatLuong / totalCount).toFixed(1)),
        },
      };
    });

    return result;
  }

  async checkDaDanhGia(orderId?: string, userId?: string) {
    if (!orderId && !userId) return false;
    const query = this.branchReviewRepo.createQueryBuilder('review');
    if (orderId) {
      query.andWhere('review.ma_don_hang = :orderId', { orderId });
    }
    if (userId) {
      query.andWhere('review.ma_nguoi_dung = :userId', { userId });
    }
    const count = await query.getCount();
    return count > 0;
  }

  async xoaDanhGia(id: number) {
    const review = await this.branchReviewRepo.findOne({ where: { id } });
    if (!review) {
      throw new BadRequestException('Không tìm thấy đánh giá');
    }
    await this.branchReviewRepo.remove(review);
    return { success: true, message: 'Xóa đánh giá thành công' };
  }
}
