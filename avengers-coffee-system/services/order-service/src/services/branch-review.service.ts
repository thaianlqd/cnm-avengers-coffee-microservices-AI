import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchReview } from '../entities/branch-review.entity';

export class CreateBranchReviewDto {
  ma_chi_nhanh: string;
  ten_chi_nhanh?: string;
  ma_nguoi_dung?: string;
  ten_nguoi_dung?: string;
  so_dien_thoai?: string;
  ma_don_hang?: string;
  diem_tong_quan: number;
  tieu_chi?: {
    phuc_vu?: number;
    ve_sinh?: number;
    toc_do?: number;
    chat_luong_mon?: number;
  };
  nhan_xet?: string;
  hinh_anh_urls?: string[];
}

@Injectable()
export class BranchReviewService {
  constructor(
    @InjectRepository(BranchReview)
    private readonly branchReviewRepo: Repository<BranchReview>,
  ) {}

  async taoDanhGia(dto: CreateBranchReviewDto): Promise<BranchReview> {
    if (!dto.ma_chi_nhanh) {
      throw new BadRequestException('Mã chi nhánh không được để trống');
    }
    if (!dto.diem_tong_quan || dto.diem_tong_quan < 1 || dto.diem_tong_quan > 5) {
      throw new BadRequestException('Điểm tổng quan phải từ 1 đến 5 sao');
    }

    // Check if this order was already reviewed
    if (dto.ma_don_hang) {
      const existed = await this.branchReviewRepo.findOne({
        where: { ma_don_hang: dto.ma_don_hang },
      });
      if (existed) {
        throw new BadRequestException('Đơn hàng này đã được đánh giá chi nhánh trước đó');
      }
    }

    const guestCode = Math.floor(1000 + Math.random() * 9000);
    const resolvedName = (dto.ten_nguoi_dung && dto.ten_nguoi_dung.trim() !== '' && dto.ten_nguoi_dung !== 'Khách hàng')
      ? dto.ten_nguoi_dung.trim()
      : `Khách vãng lai #${guestCode}`;

    const review = this.branchReviewRepo.create({
      ma_chi_nhanh: dto.ma_chi_nhanh,
      ten_chi_nhanh: dto.ten_chi_nhanh || null,
      ma_nguoi_dung: dto.ma_nguoi_dung || null,
      ten_nguoi_dung: resolvedName,
      so_dien_thoai: dto.so_dien_thoai || null,
      ma_don_hang: dto.ma_don_hang || null,
      diem_tong_quan: dto.diem_tong_quan,
      tieu_chi: dto.tieu_chi || {
        phuc_vu: dto.diem_tong_quan,
        ve_sinh: dto.diem_tong_quan,
        toc_do: dto.diem_tong_quan,
        chat_luong_mon: dto.diem_tong_quan,
      },
      nhan_xet: dto.nhan_xet || null,
      hinh_anh_urls: dto.hinh_anh_urls || [],
      trang_thai: 'APPROVED',
    });

    return this.branchReviewRepo.save(review);
  }

  async layDanhSachDanhGiaChiNhanh(ma_chi_nhanh: string) {
    const reviews = await this.branchReviewRepo.find({
      where: { ma_chi_nhanh, trang_thai: 'APPROVED' },
      order: { ngay_tao: 'DESC' },
    });

    const formattedReviews = reviews.map((r) => {
      let displayName = r.ten_nguoi_dung;
      if (!displayName || displayName === 'Khách hàng') {
        const guestNum = 1000 + ((r.id || 1) * 137) % 9000;
        displayName = `Khách vãng lai #${guestNum}`;
      }
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
    const reviews = await this.branchReviewRepo.find({
      where: { trang_thai: 'APPROVED' },
    });

    const branchMap = new Map<string, BranchReview[]>();
    reviews.forEach((r) => {
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

  async checkDaDanhGia(ma_don_hang?: string, ma_nguoi_dung?: string) {
    if (ma_don_hang) {
      const review = await this.branchReviewRepo.findOne({ where: { ma_don_hang } });
      return { da_danh_gia: !!review, review };
    }
    return { da_danh_gia: false, review: null };
  }
}
