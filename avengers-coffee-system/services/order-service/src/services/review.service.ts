import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DonHang } from '../modules/thanh-toan/entities/don-hang.entity';
import { BranchReview } from '../entities/branch-review.entity';
import { assertRating, duplicateReview, isPublicReview, lockReviewOrder } from './review-policy';
import { Review } from '../entities/review.entity';

const identitySchema = process.env.IDENTITY_DB_SCHEMA || 'identity';
const orderSchema = process.env.DB_SCHEMA || 'orders';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private reviewRepo: Repository<Review>,
  ) {}

  private async ganTenNguoiDungChoReviews(reviews: Review[]) {
    if (!reviews.length) {
      return [];
    }

    const userIds = Array.from(
      new Set(reviews.map((review) => review.ma_nguoi_dung).filter(Boolean)),
    );

    if (!userIds.length) {
      return reviews;
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validUuidUserIds = userIds.filter((id) => uuidRegex.test(id));

    if (!validUuidUserIds.length) {
      return reviews;
    }

    const users = await this.reviewRepo.manager.query(
      `SELECT ma_nguoi_dung, ho_ten, email
       FROM "${identitySchema}"."nguoi_dung"
       WHERE ma_nguoi_dung = ANY($1::uuid[])`,
      [validUuidUserIds],
    );

    const userMap = new Map(
      users.map((user: { ma_nguoi_dung: string; ho_ten?: string; email?: string }) => [
        user.ma_nguoi_dung,
        user.ho_ten || null,
      ]),
    );

    return reviews.map((review) => ({
      ...review,
      ten_nguoi_dung: userMap.get(review.ma_nguoi_dung) || null,
    }));
  }

  private async ganThongTinSanPhamChoReviews(reviews: Review[]) {
    if (!reviews.length) {
      return [];
    }

    const orderIds = Array.from(
      new Set(reviews.map((review) => review.ma_don_hang).filter(Boolean)),
    );

    if (!orderIds.length) {
      return reviews.map((review) => ({
        ...review,
        ten_san_pham: null,
        hinh_anh_san_pham: null,
      }));
    }

    const productRows = await this.reviewRepo.manager.query(
      `SELECT ct.ma_don_hang,
              CAST(ct.ma_san_pham AS text) AS ma_san_pham,
              MAX(ct.ten_san_pham) AS ten_san_pham,
              MAX(ct.hinh_anh_url) AS hinh_anh_san_pham
       FROM "${orderSchema}"."chi_tiet_don_hang" ct
       WHERE ct.ma_don_hang = ANY($1::uuid[])
       GROUP BY ct.ma_don_hang, CAST(ct.ma_san_pham AS text)`,
      [orderIds],
    );

    type ProductInfo = {
      ten_san_pham: string | null;
      hinh_anh_san_pham: string | null;
    };

    const productMap = new Map<string, ProductInfo>(
      productRows.map(
        (row: {
          ma_don_hang: string;
          ma_san_pham: string;
          ten_san_pham?: string;
          hinh_anh_san_pham?: string;
        }) => [
          `${row.ma_don_hang}:${row.ma_san_pham}`,
          {
            ten_san_pham: row.ten_san_pham || null,
            hinh_anh_san_pham: row.hinh_anh_san_pham || null,
          },
        ],
      ),
    );

    return reviews.map((review) => {
      const key = review.ma_don_hang ? `${review.ma_don_hang}:${String(review.ma_san_pham)}` : '';
      const productInfo = key ? productMap.get(key) : null;
      return {
        ...review,
        ten_san_pham: productInfo?.ten_san_pham || null,
        hinh_anh_san_pham: productInfo?.hinh_anh_san_pham || null,
      };
    });
  }

  async taoReview(payload: {
    maSanPham: string;
    maNguoiDung: string;
    soSao: number;
    binhLuan?: string;
    maDonHang?: string;
    maKiosk?: string;
  }) {
    assertRating(payload.soSao);
    return this.reviewRepo.manager.transaction(async (manager) => {
      const order = await lockReviewOrder(manager, payload.maDonHang, payload.maNguoiDung);
      if (payload.maKiosk && order.co_so_ma !== payload.maKiosk) {
        throw new BadRequestException('Chi nhánh không khớp với đơn hàng');
      }
      const [purchased] = await manager.query(
        `SELECT id FROM "${orderSchema}"."chi_tiet_don_hang"
         WHERE ma_don_hang = $1 AND CAST(ma_san_pham AS text) = $2 LIMIT 1`,
        [order.ma_don_hang, payload.maSanPham],
      );
      if (!purchased) throw new BadRequestException('Chỉ được đánh giá món đã mua trong đơn hàng');
      const repo = manager.getRepository(Review);
      if (await repo.findOne({ where: {
        ma_san_pham: payload.maSanPham, ma_nguoi_dung: payload.maNguoiDung, ma_don_hang: order.ma_don_hang,
      } }) || await manager.getRepository(BranchReview).findOne({ where: { ma_don_hang: order.ma_don_hang } })) {
        throw duplicateReview();
      }
      const item = await repo.save(repo.create({
        ma_san_pham: payload.maSanPham,
        ma_nguoi_dung: payload.maNguoiDung,
        so_sao: payload.soSao,
        binh_luan: payload.binhLuan?.trim().slice(0, 2000) || null,
        ma_don_hang: order.ma_don_hang,
      }));
      return { message: 'Gửi đánh giá thành công', item: { ...item, ma_chi_nhanh: order.co_so_ma } };
    });
  }

  // Lấy tất cả reviews của một sản phẩm, hỗ trợ lọc theo kiosk
  async layDanhGiaSanPham(maSanPham: string, maKiosk?: string) {
    const query = this.reviewRepo.createQueryBuilder('review')
      .innerJoin(DonHang, 'dh', 'dh.ma_don_hang = review.ma_don_hang AND dh.ma_nguoi_dung = review.ma_nguoi_dung::text')
      .where('review.ma_san_pham = :product', { product: maSanPham })
      .andWhere('dh.trang_thai_don_hang = :completed', { completed: 'HOAN_THANH' })
      .orderBy('review.ngay_tao', 'DESC');
    if (maKiosk?.trim()) query.andWhere('dh.co_so_ma = :branch', { branch: maKiosk.trim() });
    const rows = await query.getMany();
    const reviews = (await this.ganTenNguoiDungChoReviews(rows)).filter(isPublicReview);
    const orderIds = [...new Set(reviews.map((review) => review.ma_don_hang).filter(Boolean))];
    const branches = orderIds.length ? await this.reviewRepo.manager.query(
      `SELECT ma_don_hang, co_so_ma FROM "${orderSchema}"."don_hang" WHERE ma_don_hang = ANY($1::uuid[])`, [orderIds],
    ) : [];
    const enrichedReviews = reviews.map((review) => ({
      ...review, ma_chi_nhanh: branches.find((order) => order.ma_don_hang === review.ma_don_hang)?.co_so_ma || null,
    }));

    const tongReview = reviews.length;
    const diemTrungBinh =
      tongReview > 0
        ? Math.round(
            (reviews.reduce((sum, r) => sum + r.so_sao, 0) / tongReview) * 10,
          ) / 10
        : 0;

    return {
      items: enrichedReviews,
      tongReview,
      diemTrungBinh,
    };
  }

  // Lấy review của user cho một sản phẩm
  async layReviewCuaUser(maSanPham: string, maNguoiDung: string) {
    const review = await this.reviewRepo.findOne({
      where: {
        ma_san_pham: maSanPham,
        ma_nguoi_dung: maNguoiDung,
      },
      order: { ngay_cap_nhat: 'DESC' },
    });

    return review || null;
  }

  // Lấy toàn bộ lịch sử review của một user
  async layLichSuReviewNguoiDung(maNguoiDung: string) {
    const reviews = await this.reviewRepo.find({
      where: { ma_nguoi_dung: maNguoiDung },
      order: { ngay_cap_nhat: 'DESC' },
    });

    const enrichedReviews = (await this.ganTenNguoiDungChoReviews(reviews)).filter(isPublicReview);

    const tongReview = enrichedReviews.length;
    const diemTrungBinh =
      tongReview > 0
        ? Math.round(
            (enrichedReviews.reduce((sum, r) => sum + r.so_sao, 0) / tongReview) * 10,
          ) / 10
        : 0;

    return {
      items: enrichedReviews,
      tongReview,
      diemTrungBinh,
    };
  }

  // Cập nhật review
  async capNhatReview(
    reviewId: number,
    userId: string,
    payload: {
      soSao?: number;
      binhLuan?: string;
    },
  ) {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review khong ton tai');
    }

    if (review.ma_nguoi_dung !== userId) throw new ForbiddenException('Bạn chỉ được cập nhật đánh giá của mình');
    if (payload.soSao !== undefined) {
      assertRating(payload.soSao);
      review.so_sao = payload.soSao;
    }
    if (payload.binhLuan !== undefined) {
      review.binh_luan = payload.binhLuan || null;
    }

    const updated = await this.reviewRepo.save(review);
    return { message: 'Cap nhat danh gia thanh cong', item: updated };
  }

  async layDanhSachReviewChoManager(input: { keyword?: string; limit?: number }) {
    const query = this.reviewRepo
      .createQueryBuilder('review')
      .orderBy('review.ngay_cap_nhat', 'DESC')
      .take(Math.max(1, Math.min(Number(input.limit || 100), 200)));

    if (input.keyword?.trim()) {
      const keyword = `%${input.keyword.trim()}%`;
      query.andWhere(
        '(review.ma_san_pham ILIKE :keyword OR review.ma_nguoi_dung::text ILIKE :keyword OR review.binh_luan ILIKE :keyword OR review.phan_hoi_quan_ly ILIKE :keyword)',
        { keyword },
      );
    }

    const rows = await query.getMany();
    const withProduct = await this.ganThongTinSanPhamChoReviews(rows);
    const enriched = await this.ganTenNguoiDungChoReviews(withProduct as Review[]);

    return {
      total: enriched.length,
      items: enriched,
    };
  }

  async phanHoiReview(
    reviewId: number,
    payload: {
      phanHoi: string;
      nguoiPhanHoi?: string;
    },
  ) {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review khong ton tai');
    }

    const reply = String(payload.phanHoi || '').trim();
    if (!reply) {
      throw new BadRequestException('Noi dung phan hoi khong duoc de trong');
    }

    review.phan_hoi_quan_ly = reply;
    review.nguoi_phan_hoi = payload.nguoiPhanHoi?.trim() || null;
    review.thoi_gian_phan_hoi = new Date();

    const updated = await this.reviewRepo.save(review);
    return { message: 'Phan hoi danh gia thanh cong', item: updated };
  }

  async xoaPhanHoiReview(reviewId: number) {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review khong ton tai');
    }

    review.phan_hoi_quan_ly = null;
    review.nguoi_phan_hoi = null;
    review.thoi_gian_phan_hoi = null;

    const updated = await this.reviewRepo.save(review);
    return { message: 'Xoa phan hoi thanh cong', item: updated };
  }

  // Xóa review
  async xoaReview(reviewId: number, userId: string) {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review khong ton tai');
    }

    if (review.ma_nguoi_dung !== userId) throw new ForbiddenException('Bạn chỉ được xóa đánh giá của mình');
    await this.reviewRepo.remove(review);
    return { message: 'Xoa danh gia thanh cong' };
  }
}
