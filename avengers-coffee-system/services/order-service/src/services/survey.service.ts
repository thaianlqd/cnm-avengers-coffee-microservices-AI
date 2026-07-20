import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SurveyForm } from '../entities/survey-form.entity';
import { SurveyResponse } from '../entities/survey-response.entity';

@Injectable()
export class SurveyService {
  private readonly IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3001';
  private readonly INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'avengers-internal-token';

  constructor(
    @InjectRepository(SurveyForm)
    private readonly formRepo: Repository<SurveyForm>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepo: Repository<SurveyResponse>,
  ) {}

  // ═══════════════════════════════════════════════════════
  //  SURVEY FORM METHODS
  // ═══════════════════════════════════════════════════════

  async taoBieuMau(payload: { tieu_de: string; mo_ta?: string; cau_hoi: any[] }, username: string) {
    if (!payload.tieu_de?.trim()) {
      throw new BadRequestException('Tieu de khao sat la bat buoc');
    }
    const form = new SurveyForm();
    form.tieu_de = payload.tieu_de.trim();
    form.mo_ta = payload.mo_ta?.trim() || null;
    form.cau_hoi = Array.isArray(payload.cau_hoi) ? payload.cau_hoi : [];
    form.trang_thai = false;
    form.nguoi_tao = username;

    const saved = await this.formRepo.save(form);
    return { message: 'Tao bieu mau khao sat thanh cong', item: saved };
  }

  async layDanhSachBieuMau() {
    const list = await this.formRepo.find({ order: { ngay_tao: 'DESC' } });
    return { total: list.length, items: list };
  }

  async layBieuMauActive() {
    const form = await this.formRepo.findOne({ where: { trang_thai: true } });
    if (!form) {
      throw new NotFoundException('Khong co khao sat nao dang hoat dong');
    }
    return form;
  }

  async kickHoatBieuMau(id: number) {
    const form = await this.formRepo.findOne({ where: { id } });
    if (!form) {
      throw new NotFoundException('Khong tim thay bieu mau khao sat');
    }

    // Deactivate all forms that are currently active
    await this.formRepo.update({ trang_thai: true }, { trang_thai: false });

    // Activate selected form
    form.trang_thai = true;
    await this.formRepo.save(form);

    return { message: 'Kich hoat bieu mau khao sat thanh cong', active_id: id };
  }

  async suaBieuMau(id: number, payload: { tieu_de?: string; mo_ta?: string; cau_hoi?: any[]; trang_thai?: boolean }) {
    const form = await this.formRepo.findOne({ where: { id } });
    if (!form) {
      throw new NotFoundException('Khong tim thay bieu mau khao sat');
    }

    if (payload.tieu_de !== undefined) form.tieu_de = payload.tieu_de.trim();
    if (payload.mo_ta !== undefined) form.mo_ta = payload.mo_ta?.trim() || null;
    if (payload.cau_hoi !== undefined) form.cau_hoi = Array.isArray(payload.cau_hoi) ? payload.cau_hoi : [];
    if (payload.trang_thai !== undefined) {
      if (payload.trang_thai === true) {
        await this.formRepo.update({ trang_thai: true }, { trang_thai: false });
      }
      form.trang_thai = payload.trang_thai;
    }

    const saved = await this.formRepo.save(form);
    return { message: 'Cap nhat bieu mau thanh cong', item: saved };
  }

  async xoaBieuMau(id: number) {
    const form = await this.formRepo.findOne({ where: { id } });
    if (!form) {
      throw new NotFoundException('Khong tim thay bieu mau khao sat');
    }

    await this.formRepo.delete(id);
    return { message: 'Xoa bieu mau khao sat thanh cong', id };
  }

  // ═══════════════════════════════════════════════════════
  //  SURVEY RESPONSE METHODS
  // ═══════════════════════════════════════════════════════

  async guiPhanHoi(payload: {
    ma_bieu_mau: number;
    ma_nguoi_dung?: string;
    ten_nguoi_dung?: string;
    so_dien_thoai?: string;
    ma_don_hang?: string;
    tra_loi: any[];
  }) {
    if (!payload.ma_bieu_mau) {
      throw new BadRequestException('ma_bieu_mau la bat buoc');
    }

    const form = await this.formRepo.findOne({ where: { id: payload.ma_bieu_mau } });
    if (!form) {
      throw new NotFoundException('Bieu mau khao sat khong ton tai');
    }

    const userId = payload.ma_nguoi_dung?.trim();
    if (userId) {
      // Check if this registered user has already completed this survey form
      const existed = await this.responseRepo.findOne({
        where: { ma_bieu_mau: payload.ma_bieu_mau, ma_nguoi_dung: userId },
      });
      if (existed) {
        throw new BadRequestException('Tài khoản này đã làm khảo sát này rồi. Để đảm bảo công bằng, mỗi tài khoản chỉ được nhận voucher khảo sát 1 lần.');
      }
    }

    // Save response
    const response = new SurveyResponse();
    response.ma_bieu_mau = payload.ma_bieu_mau;
    response.ma_nguoi_dung = userId || null;
    response.ten_nguoi_dung = payload.ten_nguoi_dung?.trim() || null;
    response.so_dien_thoai = payload.so_dien_thoai?.trim() || null;
    response.ma_don_hang = payload.ma_don_hang?.trim() || null;
    response.tra_loi = Array.isArray(payload.tra_loi) ? payload.tra_loi : [];

    const savedResponse = await this.responseRepo.save(response);

    // If logged in customer, issue a 20% discount voucher
    if (userId) {
      try {
        const identityResponse = await fetch(`${this.IDENTITY_SERVICE_URL}/promotions/internal/phat-hanh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-token': this.INTERNAL_SERVICE_TOKEN,
          },
          body: JSON.stringify({ user_id: userId }),
        });

        const identityPayload: any = await identityResponse.json().catch(() => ({}));
        if (!identityResponse.ok) {
          console.error('[SurveyService] failed to issue voucher:', identityPayload?.message);
          return {
            success: true,
            message: 'Gui khao sat thanh cong, nhung khong the cap voucher luc nay.',
            item: savedResponse,
          };
        }

        return {
          success: true,
          message: 'Gui khao sat thanh cong. Ban da nhan duoc voucher 20%!',
          voucher_code: identityPayload.item?.ma_khuyen_mai,
          voucher_expiry: identityPayload.item?.ngay_ket_thuc,
          item: savedResponse,
        };
      } catch (err) {
        console.error('[SurveyService] Error requesting voucher:', err);
        return {
          success: true,
          message: 'Gui khao sat thanh cong. Co loi luc phat hanh voucher.',
          item: savedResponse,
        };
      }
    }

    return {
      success: true,
      message: 'Gui khao sat thanh cong! Dang nhap tai khoan de duoc nhan voucher 20% cho lan sau.',
      item: savedResponse,
    };
  }

  async layDanhSachPhanHoi() {
    const list = await this.responseRepo.find({ order: { ngay_tao: 'DESC' } });
    return { total: list.length, items: list };
  }

  async checkStatus(userId: string) {
    const cleanUserId = String(userId || '').trim();
    if (!cleanUserId || cleanUserId === 'anonymous') {
      return { completed: false };
    }

    const activeForm = await this.formRepo.findOne({ where: { trang_thai: true } });
    if (!activeForm) {
      return { completed: true }; // No active survey form -> assume completed to avoid showing popup
    }

    const response = await this.responseRepo.findOne({
      where: { ma_bieu_mau: activeForm.id, ma_nguoi_dung: cleanUserId },
    });

    return { completed: !!response };
  }
}
