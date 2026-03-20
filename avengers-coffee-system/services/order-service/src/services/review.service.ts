import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
        user.ho_ten || user.email || null,
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

  private async kiemTraDieuKienDanhGia(maNguoiDung: string, maSanPham: string, maDonHang?: string) {
    if (!maDonHang) {
      throw new BadRequestException('Chi duoc danh gia san pham sau khi don hang da hoan thanh');
    }

    const ketQua = await this.reviewRepo.manager.query(
      `SELECT dh.ma_don_hang, dh.trang_thai_don_hang
       FROM "${orderSchema}"."don_hang" dh
       INNER JOIN "${orderSchema}"."chi_tiet_don_hang" ct ON ct.ma_don_hang = dh.ma_don_hang
       WHERE dh.ma_don_hang = $1
         AND dh.ma_nguoi_dung = $2
         AND CAST(ct.ma_san_pham AS text) = $3
       LIMIT 1`,
      [maDonHang, maNguoiDung, maSanPham],
    );

    const donHopLe = ketQua?.[0];
    if (!donHopLe) {
      throw new BadRequestException('Ban chi duoc danh gia san pham da mua trong don hang hop le');
    }

    if (String(donHopLe.trang_thai_don_hang || '').toUpperCase() !== 'HOAN_THANH') {
      throw new BadRequestException('Chi duoc danh gia sau khi don hang da giao thanh cong');
    }
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

    await this.kiemTraDieuKienDanhGia(maNguoiDung, maSanPham, maDonHang);

    // Chi update review khi trung ca user + san pham + don hang.
    // Neu user mua lai san pham o don khac, se tao review moi.
    const existing = maDonHang
      ? await this.reviewRepo.findOne({
          where: {
            ma_san_pham: maSanPham,
            ma_nguoi_dung: maNguoiDung,
            ma_don_hang: maDonHang,
          },
        })
      : await this.reviewRepo.findOne({
          where: {
            ma_san_pham: maSanPham,
            ma_nguoi_dung: maNguoiDung,
            ma_don_hang: IsNull(),
          },
        });

    if (existing) {
      // Update nếu đã tồn tại
      existing.so_sao = soSao;
      existing.binh_luan = binhLuan || null;
      existing.ma_don_hang = maDonHang || existing.ma_don_hang || null;
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
