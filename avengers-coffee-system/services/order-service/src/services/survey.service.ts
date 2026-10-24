import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { SurveyForm } from '../entities/survey-form.entity';
import { SurveyResponse } from '../entities/survey-response.entity';
import { secretWithDevDefault } from '../config/runtime-secrets';

@Injectable()
export class SurveyService {
  private readonly IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL || 'http://identity-service:3001';
  private readonly INTERNAL_SERVICE_TOKEN = secretWithDevDefault('INTERNAL_SERVICE_TOKEN', 'test-only-internal-service-token');

  constructor(
    @InjectRepository(SurveyForm)
    private readonly formRepo: Repository<SurveyForm>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepo: Repository<SurveyResponse>,
    private readonly dataSource: DataSource,
  ) {}

  // ═══════════════════════════════════════════════════════
  //  SURVEY FORM METHODS
  // ═══════════════════════════════════════════════════════

  async taoBieuMau(payload: { tieu_de: string; mo_ta?: string; cau_hoi: any[] }, username: string, branchCode: string | null = null) {
    if (!payload.tieu_de?.trim()) {
      throw new BadRequestException('Tieu de khao sat la bat buoc');
    }
    const form = new SurveyForm();
    form.tieu_de = payload.tieu_de.trim();
    form.mo_ta = payload.mo_ta?.trim() || null;
    form.cau_hoi = Array.isArray(payload.cau_hoi) ? payload.cau_hoi : [];
    form.trang_thai = false;
    form.nguoi_tao = username;
    form.co_so_ma = branchCode;

    const saved = await this.formRepo.save(form);
    return { message: 'Tao bieu mau khao sat thanh cong', item: saved };
  }

  async layDanhSachBieuMau(branchCode: string | null = null) {
    const list = await this.formRepo.find({ where: { co_so_ma: branchCode ?? IsNull() }, order: { ngay_tao: 'DESC' } });
    return { total: list.length, items: list };
  }

  async layBieuMauActive() {
    const form = await this.formRepo.findOne({ where: { trang_thai: true, co_so_ma: IsNull() } });
    if (!form) {
      throw new NotFoundException('Khong co khao sat nao dang hoat dong');
    }
    return form;
  }

  async kickHoatBieuMau(id: number, branchCode: string | null = null) {
    const form = await this.formRepo.findOne({ where: { id, co_so_ma: branchCode ?? IsNull() } });
    if (!form) {
      throw new NotFoundException('Khong tim thay bieu mau khao sat');
    }

    // Deactivate all forms that are currently active
    await this.formRepo.update({ trang_thai: true, co_so_ma: branchCode ?? IsNull() }, { trang_thai: false });

    // Activate selected form
    form.trang_thai = true;
    await this.formRepo.save(form);

    return { message: 'Kich hoat bieu mau khao sat thanh cong', active_id: id };
  }

  async suaBieuMau(id: number, payload: { tieu_de?: string; mo_ta?: string; cau_hoi?: any[]; trang_thai?: boolean }, branchCode: string | null = null) {
    const form = await this.formRepo.findOne({ where: { id, co_so_ma: branchCode ?? IsNull() } });
    if (!form) {
      throw new NotFoundException('Khong tim thay bieu mau khao sat');
    }

    if (payload.tieu_de !== undefined) form.tieu_de = payload.tieu_de.trim();
    if (payload.mo_ta !== undefined) form.mo_ta = payload.mo_ta?.trim() || null;
    if (payload.cau_hoi !== undefined) form.cau_hoi = Array.isArray(payload.cau_hoi) ? payload.cau_hoi : [];
    if (payload.trang_thai !== undefined) {
      if (payload.trang_thai === true) {
        await this.formRepo.update({ trang_thai: true, co_so_ma: branchCode ?? IsNull() }, { trang_thai: false });
      }
      form.trang_thai = payload.trang_thai;
    }

    const saved = await this.formRepo.save(form);
    return { message: 'Cap nhat bieu mau thanh cong', item: saved };
  }

  async xoaBieuMau(id: number, branchCode: string | null = null) {
    const form = await this.formRepo.findOne({ where: { id, co_so_ma: branchCode ?? IsNull() } });
    if (!form) {
      throw new NotFoundException('Khong tim thay bieu mau khao sat');
    }

    try {
      await this.responseRepo.delete({ ma_bieu_mau: id });
    } catch {}

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

    if (!form.trang_thai) throw new BadRequestException('Khảo sát này chưa mở hoặc đã kết thúc.');
    const answers = Array.isArray(payload.tra_loi) ? payload.tra_loi : [];
    for (const q of form.cau_hoi || []) {
      const answer = answers.find(a => a.cau_hoi_id === q.id || a.cau_hoi_tieu_de === q.tieu_de)?.cau_tra_loi;
      if (q.bat_buoc && (answer === undefined || answer === null || answer === '' || (Array.isArray(answer) && !answer.length))) throw new BadRequestException(`Vui lòng trả lời: ${q.tieu_de}`);
      if (q.loai === 'rating' && answer !== undefined && (!Number.isInteger(Number(answer)) || Number(answer) < 1 || Number(answer) > 5)) throw new BadRequestException('Điểm đánh giá phải từ 1 đến 5.');
    }
    let coSoMa: string | null = form.co_so_ma || null;
    if (payload.ma_don_hang?.trim()) {
      try {
        const rows = await this.dataSource.query(
          'SELECT co_so_ma FROM orders.don_hang WHERE ma_don_hang = $1',
          [payload.ma_don_hang.trim()]
        );
        if (rows && rows.length > 0) {
          if (form.co_so_ma && form.co_so_ma !== rows[0].co_so_ma) throw new BadRequestException('Đơn hàng không thuộc chi nhánh của khảo sát.');
          coSoMa = form.co_so_ma || rows[0].co_so_ma;
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        console.error('Error looking up co_so_ma for survey response:', err);
      }
    }

    // Save response
    const response = new SurveyResponse();
    response.ma_bieu_mau = payload.ma_bieu_mau;
    response.ma_nguoi_dung = userId || null;
    response.ten_nguoi_dung = payload.ten_nguoi_dung?.trim() || null;
    response.so_dien_thoai = payload.so_dien_thoai?.trim() || null;
    response.ma_don_hang = payload.ma_don_hang?.trim() || null;
    response.co_so_ma = coSoMa;
    response.tra_loi = Array.isArray(payload.tra_loi) ? payload.tra_loi : [];

    const savedResponse = await this.responseRepo.save(response);

    // If logged in customer, issue a 20% discount voucher immediately
    if (userId && !form.co_so_ma) {
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
      message: form.co_so_ma ? 'Cảm ơn bạn! Chi nhánh đã nhận được phản hồi.' : 'Gửi khảo sát thành công!',
      item: savedResponse,
    };
  }

  async phatVoucherSauHoanThanh(maDonHang: string) {
    // Legacy stub - no-op when immediate voucher issuance is enabled
    return;
  }

  async huyVoucherPending(maDonHang: string) {
    // Legacy stub - no-op when immediate voucher issuance is enabled
    return;
  }

  async layDanhSachPhanHoi(branchCode: string | null = null) {
    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    const orderSchema = process.env.DB_SCHEMA || 'orders';

    if (branchCode) {
      conditions.push(`f.co_so_ma = $${paramIdx++}`);
      params.push(branchCode);
    }

    if (!branchCode) conditions.push('f.co_so_ma IS NULL');
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // JOIN with survey_form to get ten_form (survey title)
    const rows = await this.responseRepo.manager.query(
      `SELECT r.*, f.tieu_de AS ten_form
       FROM "${orderSchema}"."khao_sat_phan_hoi" r
       LEFT JOIN "${orderSchema}"."khao_sat_bieu_mau" f ON f.id = r.ma_bieu_mau
       ${whereClause}
       ORDER BY r.ngay_tao DESC`,
      params,
    );

    return { total: rows.length, items: rows };
  }


  async layBieuMauCongKhai(id: number) {
    const form = await this.formRepo.findOne({ where: { id, trang_thai: true } });
    if (!form) throw new NotFoundException('Khảo sát chưa mở hoặc đã kết thúc.');
    return { id: form.id, tieu_de: form.tieu_de, mo_ta: form.mo_ta, cau_hoi: form.cau_hoi, co_so_ma: form.co_so_ma };
  }

  async checkStatus(userId: string) {
    const cleanUserId = String(userId || '').trim();
    if (!cleanUserId || cleanUserId === 'anonymous') {
      return { completed: false };
    }

    const activeForm = await this.formRepo.findOne({ where: { trang_thai: true, co_so_ma: IsNull() } });
    if (!activeForm) {
      return { completed: true }; // No active survey form -> assume completed to avoid showing popup
    }

    const response = await this.responseRepo.findOne({
      where: { ma_bieu_mau: activeForm.id, ma_nguoi_dung: cleanUserId },
    });

    return { completed: !!response };
  }
}
