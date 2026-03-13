import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from '../entities/review.entity';

const identitySchema = process.env.IDENTITY_DB_SCHEMA || 'identity';

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
        user.ho_ten || user.email || null,
      ]),
    );

    return reviews.map((review) => ({
      ...review,
      ten_nguoi_dung: userMap.get(review.ma_nguoi_dung) || null,
    }));
  }

  // Tạo review mới
  async taoReview(payload: {
    maSanPham: string;
    maNguoiDung: string;
    soSao: number;
    binhLuan?: string;
    maDonHang?: string;
  }) {
    const { maSanPham, maNguoiDung, soSao, binhLuan, maDonHang } = payload;

    if (soSao < 1 || soSao > 5) {
      throw new BadRequestException('soSao phai trong khoang 1 den 5');
    }

    // Kiểm tra xem user đã review sản phẩm này chưa
    const existing = await this.reviewRepo.findOne({
      where: {
        ma_san_pham: maSanPham,
        ma_nguoi_dung: maNguoiDung,
      },
    });

    if (existing) {
      // Update nếu đã tồn tại
      existing.so_sao = soSao;
      existing.binh_luan = binhLuan || null;
      existing.ma_don_hang = maDonHang || null;
      const updated = await this.reviewRepo.save(existing);
      return { message: 'Cap nhat danh gia thanh cong', item: updated };
    }

    // Tạo mới
    const review = this.reviewRepo.create({
      ma_san_pham: maSanPham,
      ma_nguoi_dung: maNguoiDung,
      so_sao: soSao,
      binh_luan: binhLuan || null,
      ma_don_hang: maDonHang || null,
    });

    const saved = await this.reviewRepo.save(review);
    return { message: 'Tao danh gia thanh cong', item: saved };
  }

  // Lấy tất cả reviews của một sản phẩm
  async layDanhGiaSanPham(maSanPham: string) {
    const reviews = await this.reviewRepo.find({
      where: { ma_san_pham: maSanPham },
      order: { ngay_tao: 'DESC' },
    });

    const enrichedReviews = await this.ganTenNguoiDungChoReviews(reviews);

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
    });

    return review || null;
  }

  // Lấy toàn bộ lịch sử review của một user
  async layLichSuReviewNguoiDung(maNguoiDung: string) {
    const reviews = await this.reviewRepo.find({
      where: { ma_nguoi_dung: maNguoiDung },
      order: { ngay_cap_nhat: 'DESC' },
    });

    const enrichedReviews = await this.ganTenNguoiDungChoReviews(reviews);

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

  // Cập nhật review
  async capNhatReview(
    reviewId: number,
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

    if (payload.soSao !== undefined) {
      review.so_sao = payload.soSao;
    }
    if (payload.binhLuan !== undefined) {
      review.binh_luan = payload.binhLuan || null;
    }

    const updated = await this.reviewRepo.save(review);
    return { message: 'Cap nhat danh gia thanh cong', item: updated };
  }

  // Xóa review
  async xoaReview(reviewId: number) {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });

    if (!review) {
      throw new NotFoundException('Review khong ton tai');
    }

    await this.reviewRepo.remove(review);
    return { message: 'Xoa danh gia thanh cong' };
  }
}
