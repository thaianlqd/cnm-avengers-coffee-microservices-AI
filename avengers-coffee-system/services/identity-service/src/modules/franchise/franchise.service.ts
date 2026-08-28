import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ComboNguyenLieu } from './entities/combo-nguyen-lieu.entity';
import { HoSoDangKy } from './entities/ho-so-dang-ky.entity';
import { Kiosk } from './entities/kiosk.entity';
import { HopDongNhuongQuyen } from './entities/hop-dong.entity';
import { DonMuaCombo } from './entities/don-mua-combo.entity';
import { CongNo } from './entities/cong-no.entity';
import { RoyaltyHangThang } from './entities/royalty.entity';
import { KetQuaDoiSoat } from './entities/doi-soat.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import nodemailer from 'nodemailer';

@Injectable()
export class FranchiseService {
  constructor(
    @InjectRepository(ComboNguyenLieu)
    private comboRepo: Repository<ComboNguyenLieu>,

    @InjectRepository(HoSoDangKy)
    private hoSoRepo: Repository<HoSoDangKy>,

    @InjectRepository(Kiosk)
    private kioskRepo: Repository<Kiosk>,

    @InjectRepository(HopDongNhuongQuyen)
    private hopDongRepo: Repository<HopDongNhuongQuyen>,

    @InjectRepository(DonMuaCombo)
    private donMuaComboRepo: Repository<DonMuaCombo>,

    @InjectRepository(CongNo)
    private congNoRepo: Repository<CongNo>,

    @InjectRepository(RoyaltyHangThang)
    private royaltyRepo: Repository<RoyaltyHangThang>,

    @InjectRepository(KetQuaDoiSoat)
    private doiSoatRepo: Repository<KetQuaDoiSoat>,

    private dataSource: DataSource,
  ) {}

  // ─────────────────────────────────────────────
  // Email helper
  // ─────────────────────────────────────────────

  private async getMailTransporter() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    if (host && user && pass) {
      const port = Number(process.env.SMTP_PORT || 587);
      return {
        isDemo: false,
        transporter: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
      };
    }
    
    // Fallback Ethereal
    const testAccount = await nodemailer.createTestAccount();
    return {
      isDemo: true,
      transporter: nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      })
    };
  }

  private async sendMail(to: string, subject: string, html: string) {
    try {
      const { transporter, isDemo } = await this.getMailTransporter();
      const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@avengerscoffee.vn').trim();
      
      const info = await transporter.sendMail({ from, to, subject, html });
      
      if (isDemo) {
        console.log(`[franchise-mail][ETHEREAL] Gửi demo thành công đến: ${to}`);
        console.log(`[franchise-mail][ETHEREAL] => XEM EMAIL TẠI ĐÂY: ${nodemailer.getTestMessageUrl(info)}`);
      } else {
        console.log(`[franchise-mail][REAL] Gửi mail thành công đến: ${to}`);
      }
    } catch (e) {
      console.error('[franchise-mail] Lỗi gửi email:', e.message);
    }
  }

  private mailAutoReply(hoSo: any): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
        <div style="background:linear-gradient(135deg,#b22830,#8B2635);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:26px;">☕ Avengers Coffee</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">Hệ thống nhượng quyền</p>
        </div>
        <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
          <h2 style="color:#b22830;margin:0 0 16px;">Chúng tôi đã nhận hồ sơ của bạn!</h2>
          <p style="margin:0 0 12px;">Xin chào <strong>${hoSo.ho_ten}</strong>,</p>
          <p style="margin:0 0 16px;line-height:1.7;color:#4b5563;">Cảm ơn bạn đã quan tâm đến cơ hội nhượng quyền <strong>Avengers Coffee</strong>. Hồ sơ đăng ký của bạn đã được tiếp nhận thành công.</p>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:20px;margin:0 0 20px;">
            <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:10px;">📋 Thông tin hồ sơ đã đăng ký:</div>
            <table style="width:100%;font-size:14px;">
              <tr><td style="color:#6b7280;padding:4px 0;">Họ tên:</td><td style="font-weight:600;">${hoSo.ho_ten}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Email:</td><td style="font-weight:600;">${hoSo.email}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Điện thoại:</td><td style="font-weight:600;">${hoSo.so_dien_thoai}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Khu vực:</td><td style="font-weight:600;">${hoSo.thanh_pho || 'Chưa xác định'}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0;">Gói đăng ký:</td><td style="font-weight:600;">${hoSo.goi_kiosk}</td></tr>
            </table>
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px;margin-bottom:20px;">
            <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:8px;">⏭️ Bước tiếp theo:</div>
            <ol style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:2;">
              <li>Đội ngũ tư vấn sẽ liên hệ với bạn trong vòng <strong>24 giờ làm việc</strong></li>
              <li>Chuẩn bị thông tin về mặt bằng và vốn đầu tư để tư vấn chính xác hơn</li>
              <li>Sau khi ký hợp đồng, tài khoản hệ thống sẽ được cấp tự động qua email</li>
            </ol>
          </div>
          <p style="color:#6b7280;font-size:13px;">Mọi thắc mắc vui lòng liên hệ: <a href="mailto:ankudo1234@gmail.com" style="color:#b22830;">ankudo1234@gmail.com</a> | Hotline: 1800 6936</p>
        </div>
        <div style="background:#f9fafb;padding:16px;text-align:center;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;font-size:12px;color:#9ca3af;">
          © 2026 Avengers Coffee. Tất cả quyền được bảo lưu.
        </div>
      </div>`;
  }

  private mailCredentials(hoTen: string, username: string, password: string, maKiosk: string): string {
    const loginUrl = String(process.env.WEB_ADMIN_URL || 'http://127.0.0.1:5174').trim();
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
        <div style="background:linear-gradient(135deg,#b22830,#8B2635);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:26px;">☕ Avengers Coffee</h1>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">Hồ sơ nhượng quyền đã được phê duyệt!</p>
        </div>
        <div style="padding:32px;background:#fff;border:1px solid #e5e7eb;border-top:none;">
          <h2 style="color:#16a34a;margin:0 0 16px;">🎉 Chúc mừng ${hoTen}!</h2>
          <p style="margin:0 0 16px;line-height:1.7;color:#4b5563;">Hồ sơ nhượng quyền của bạn đã được <strong>phê duyệt chính thức</strong>. Dưới đây là thông tin tài khoản để truy cập hệ thống quản lý Kiosk:</p>
          <div style="background:#fef9c3;border:2px solid #fbbf24;border-radius:12px;padding:24px;margin:0 0 24px;">
            <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:14px;">🔑 Thông tin đăng nhập:</div>
            <table style="width:100%;">
              <tr><td style="color:#6b7280;font-size:14px;padding:6px 0;">Tên đăng nhập:</td><td style="font-size:18px;font-weight:900;color:#1f2937;font-family:monospace;">${username}</td></tr>
              <tr><td style="color:#6b7280;font-size:14px;padding:6px 0;">Mật khẩu mặc định:</td><td style="font-size:18px;font-weight:900;color:#b22830;font-family:monospace;">${password}</td></tr>
              <tr><td style="color:#6b7280;font-size:14px;padding:6px 0;">Mã Kiosk:</td><td style="font-size:16px;font-weight:700;color:#1f2937;">${maKiosk}</td></tr>
            </table>
          </div>
          <a href="${loginUrl}" style="display:block;text-align:center;background:linear-gradient(135deg,#b22830,#d94040);color:#fff;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:20px;">
            🚀 Đăng nhập hệ thống ngay
          </a>
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px;margin-bottom:20px;">
            <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:6px;">⚠️ Lưu ý bảo mật:</div>
            <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">Hệ thống sẽ yêu cầu bạn <strong>đổi mật khẩu</strong> ngay lần đăng nhập đầu tiên. Vui lòng không chia sẻ thông tin đăng nhập với bất kỳ ai.</p>
          </div>
        </div>
        <div style="background:#f9fafb;padding:16px;text-align:center;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;font-size:12px;color:#9ca3af;">
          © 2026 Avengers Coffee. Hỗ trợ: ankudo1234@gmail.com | 1800 6936
        </div>
      </div>`;
  }

  // ─────────────────────────────────────────────
  // UC-B01: Hồ sơ đăng ký
  // ─────────────────────────────────────────────

  async dangKyHoSo(body: any) {
    const hoSo = this.hoSoRepo.create({
      ho_ten: body.ho_ten,
      email: body.email,
      so_dien_thoai: body.so_dien_thoai,
      dia_chi_mat_bang: body.dia_chi_mat_bang,
      quan_huyen: body.quan_huyen || null,
      thanh_pho: body.thanh_pho || null,
      dien_tich_m2: body.dien_tich_m2 || null,
      goi_kiosk: body.goi_kiosk,
      ghi_chu: body.ghi_chu || null,
      trang_thai: 'CHO_XEM_XET',
    });
    await this.hoSoRepo.save(hoSo);
    // Auto-reply email (fire-and-forget)
    this.sendMail(
      hoSo.email,
      '[Avengers Coffee] Xác nhận hồ sơ nhượng quyền đã được tiếp nhận',
      this.mailAutoReply(hoSo),
    ).catch(e => console.error('[franchise-mail] auto-reply error:', e.message));
    return { success: true, message: 'Hồ sơ đăng ký đã được tiếp nhận. Email xác nhận đã gửi về ' + hoSo.email + '. Chúng tôi sẽ liên hệ trong 2-3 ngày làm việc.', data: hoSo };
  }

  async layDanhSachHoSo(trang_thai?: string) {
    const query = this.hoSoRepo.createQueryBuilder('h').orderBy('h.ngay_tao', 'DESC');
    if (trang_thai) query.where('h.trang_thai = :trang_thai', { trang_thai });
    return query.getMany();
  }

  async duyetHoSo(id: string, adminId: string) {
    const hoSo = await this.hoSoRepo.findOne({ where: { id } });
    if (!hoSo) throw new NotFoundException('Không tìm thấy hồ sơ');
    if (hoSo.trang_thai !== 'CHO_XEM_XET') throw new BadRequestException('Hồ sơ không ở trạng thái chờ xem xét');
    // Kiểm tra xem người dùng đã tồn tại chưa
    const existingUsers = await this.dataSource.query(
      `SELECT ma_nguoi_dung, ten_dang_nhap FROM identity.nguoi_dung WHERE email = $1 OR so_dien_thoai = $2 LIMIT 1`,
      [hoSo.email, hoSo.so_dien_thoai]
    );

    let franchiseeId;
    let username = `franchise_${Date.now()}`;
    const defaultPassword = '123456';
    const hashedPwd = require('crypto').createHash('sha256').update(defaultPassword).digest('hex');
    let isNewUser = true;

    if (existingUsers && existingUsers.length > 0) {
      franchiseeId = existingUsers[0].ma_nguoi_dung;
      username = existingUsers[0].ten_dang_nhap;
      isNewUser = false;
      // Reset mật khẩu về 123456 và nâng cấp role thành FRANCHISEE
      await this.dataSource.query(
        `UPDATE identity.nguoi_dung SET mat_khau_hash = $1, require_password_change = true, vai_tro = 'FRANCHISEE' WHERE ma_nguoi_dung = $2`,
        [hashedPwd, franchiseeId]
      );
    } else {
      try {
        const insertResult = await this.dataSource.query(
          `INSERT INTO identity.nguoi_dung (ten_dang_nhap, mat_khau_hash, ho_ten, email, so_dien_thoai, vai_tro, trang_thai, require_password_change)
           VALUES ($1, $2, $3, $4, $5, 'FRANCHISEE', 'ACTIVE', true) RETURNING ma_nguoi_dung`,
          [username, hashedPwd, hoSo.ho_ten, hoSo.email, hoSo.so_dien_thoai]
        );
        franchiseeId = insertResult[0]?.ma_nguoi_dung;
      } catch (error) {
        if (error.code === '23505') {
          throw new BadRequestException('Lỗi hệ thống: Xung đột dữ liệu email/SĐT.');
        }
        throw error;
      }
    }

    if (!franchiseeId) throw new Error('Không tạo/lấy được tài khoản FRANCHISEE');

    // Tạo Kiosk tự động
    const kioskCount = await this.kioskRepo.count();
    const maKiosk = `KSK-${String(kioskCount + 1).padStart(3, '0')}`;
    const newKiosk = await this.kioskRepo.save(this.kioskRepo.create({
      ma_kiosk: maKiosk,
      ten_kiosk: `Kiosk Avengers ${hoSo.thanh_pho || 'Mới'}`,
      dia_chi: hoSo.dia_chi_mat_bang,
      quan_huyen: hoSo.quan_huyen,
      thanh_pho: hoSo.thanh_pho,
      loai_kiosk: hoSo.goi_kiosk,
      ho_so_id: id,
      franchisee_id: franchiseeId,
      trang_thai: 'CHO_KY_HOP_DONG',
    }));

    // Tạo Công nợ khởi tạo (Phí nhượng quyền - chỉ bao gồm Tài sản & Setup)
    // Phần Combo nguyên liệu đầu kỳ đối tác sẽ tự đặt hàng ở tab "Đặt Combo"
    let soTienKhoiTao = 0;
    if (hoSo.goi_kiosk === 'XE_LUU_DONG') { soTienKhoiTao = 16500000; }
    else if (hoSo.goi_kiosk === 'KIOSK_CO_DINH') { soTienKhoiTao = 44500000; }
    else if (hoSo.goi_kiosk === 'CONTAINER_CAFE') { soTienKhoiTao = 67500000; }

    const hanThanhToan = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (soTienKhoiTao > 0) {
      await this.congNoRepo.save(this.congNoRepo.create({
        kiosk_id: newKiosk.id,
        loai_phat_sinh: 'KHOI_TAO',
        so_tien: soTienKhoiTao,
        han_thanh_toan: hanThanhToan,
        trang_thai: 'CON_NO',
        ghi_chu: 'Phí nhượng quyền ban đầu (Tài sản & Setup)',
      }));
    }

    hoSo.franchisee_user_id = franchiseeId;
    hoSo.trang_thai = 'DA_DUYET';
    hoSo.nguoi_xu_ly_id = adminId;
    await this.hoSoRepo.save(hoSo);

    // Gửi email credentials cho franchisee (fire-and-forget)
    this.sendMail(
      hoSo.email,
      '[☕ Avengers Coffee] Hồ sơ nhượng quyền được phê duyệt - Thông tin tài khoản',
      this.mailCredentials(hoSo.ho_ten, username, defaultPassword, maKiosk),
    ).catch(e => console.error('[franchise-mail] credentials email error:', e.message));

    return {
      success: true,
      message: `Đã duyệt hồ sơ! Tài khoản: ${username} / Mật khẩu: 123456. Kiosk ${maKiosk} đã được tạo. Email credentials đã gửi đến ${hoSo.email}.`,
      data: { hoSo, username, maKiosk },
    };
  }

  async tuChoiHoSo(id: string, adminId: string, ly_do: string) {
    const hoSo = await this.hoSoRepo.findOne({ where: { id } });
    if (!hoSo) throw new NotFoundException('Không tìm thấy hồ sơ');
    if (hoSo.trang_thai !== 'CHO_XEM_XET') throw new BadRequestException('Hồ sơ không ở trạng thái chờ xem xét');
    hoSo.trang_thai = 'TU_CHOI';
    hoSo.ly_do_tu_choi = ly_do;
    hoSo.nguoi_xu_ly_id = adminId;
    await this.hoSoRepo.save(hoSo);
    return { success: true, message: 'Đã từ chối hồ sơ.', data: hoSo };
  }

  // ─────────────────────────────────────────────
  // UC-B02: Kiosk & Hợp đồng
  // ─────────────────────────────────────────────

  async layDanhSachKiosk() {
    const kiosks = await this.kioskRepo.find({ order: { ngay_tao: 'DESC' } });
    // Enrich với thông tin hợp đồng
    const result = await Promise.all(kiosks.map(async (k) => {
      const hopDong = await this.hopDongRepo.findOne({ where: { kiosk_id: k.id }, order: { ngay_tao: 'DESC' } });
      const congNoCount = await this.congNoRepo.count({ where: { kiosk_id: k.id, trang_thai: 'CON_NO' } });
      return { ...k, hop_dong: hopDong, so_cong_no_chua_thanh_toan: congNoCount };
    }));
    return result;
  }

  async layKioskCuaToi(franchiseeId: string) {
    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId }, order: { ngay_tao: 'DESC' } });
    return Promise.all(kiosks.map(async (k) => {
      const hopDong = await this.hopDongRepo.findOne({ where: { kiosk_id: k.id, trang_thai: 'HIEU_LUC' }, order: { ngay_tao: 'DESC' } });
      const congNo = await this.congNoRepo.find({ where: { kiosk_id: k.id, trang_thai: 'CON_NO' } });
      const tongCongNo = congNo.reduce((sum, c) => sum + Number(c.so_tien), 0);
      return { ...k, hop_dong: hopDong, tong_cong_no: tongCongNo };
    }));
  }

  async taoHopDong(kioskId: string, body: any, adminId: string) {
    const kiosk = await this.kioskRepo.findOne({ where: { id: kioskId } });
    if (!kiosk) throw new NotFoundException('Không tìm thấy kiosk');
    if (kiosk.trang_thai !== 'CHO_KY_HOP_DONG') throw new BadRequestException('Kiosk không ở trạng thái chờ ký hợp đồng');

    const hopDong = await this.hopDongRepo.save(this.hopDongRepo.create({
      kiosk_id: kioskId,
      goi_kiosk: kiosk.loai_kiosk,
      ngay_ky: body.ngay_ky,
      ngay_het_han: body.ngay_het_han,
      ty_le_royalty_phan_tram: body.ty_le_royalty_phan_tram ?? 7.0,
      so_combo_khoi_diem: body.so_combo_khoi_diem ?? 0,
      trang_thai: 'HIEU_LUC',
      nguoi_tao_id: adminId,
    }));

    // Cộng combo khởi điểm vào kiosk
    kiosk.so_combo_hien_tai = (kiosk.so_combo_hien_tai || 0) + (body.so_combo_khoi_diem || 0);
    kiosk.trang_thai = 'DANG_THIET_LAP';
    await this.kioskRepo.save(kiosk);

    return { success: true, message: 'Hợp đồng đã được tạo. Kiosk đang trong giai đoạn thiết lập.', data: hopDong };
  }

  async xacNhanKhaiTruong(kioskId: string) {
    const kiosk = await this.kioskRepo.findOne({ where: { id: kioskId } });
    if (!kiosk) throw new NotFoundException('Không tìm thấy kiosk');
    if (kiosk.trang_thai !== 'DANG_THIET_LAP') throw new BadRequestException('Kiosk không ở trạng thái đang thiết lập');
    kiosk.trang_thai = 'DANG_HOAT_DONG';
    await this.kioskRepo.save(kiosk);

    const hopDong = await this.hopDongRepo.findOne({ where: { kiosk_id: kioskId, trang_thai: 'HIEU_LUC' } });
    if (hopDong) {
      hopDong.ngay_khai_truong = new Date().toISOString().split('T')[0];
      await this.hopDongRepo.save(hopDong);
    }
    return { success: true, message: 'Kiosk đã khai trương và chính thức hoạt động!', data: kiosk };
  }

  // ─────────────────────────────────────────────
  // UC-B03: Đơn mua combo
  // ─────────────────────────────────────────────

  async layDanhSachCombo() {
    return this.comboRepo.find({ where: { trang_thai: 'ACTIVE' }, order: { gia_ban: 'ASC' } });
  }

  async datMuaCombo(franchiseeId: string, body: any) {
    // Tìm kiosk của franchisee
    const kiosk = await this.kioskRepo.findOne({ where: { id: body.kiosk_id, franchisee_id: franchiseeId } });
    if (!kiosk) throw new NotFoundException('Không tìm thấy kiosk hoặc bạn không có quyền');
    if (kiosk.trang_thai === 'NGUNG_HOAT_DONG') throw new BadRequestException('Kiosk đã ngừng hoạt động, không thể đặt combo');

    const combo = await this.comboRepo.findOne({ where: { id: body.combo_id } });
    if (!combo) throw new NotFoundException('Không tìm thấy combo');

    const soLuong = body.so_luong || 1;
    const tongTien = Number(combo.gia_ban) * soLuong;

    const don = await this.donMuaComboRepo.save(this.donMuaComboRepo.create({
      kiosk_id: kiosk.id,
      combo_id: combo.id,
      so_luong: soLuong,
      don_gia: combo.gia_ban,
      tong_tien: tongTien,
      trang_thai: 'DA_DAT',
      phuong_thuc_thanh_toan: body.phuong_thuc_thanh_toan || 'CONG_NO',
      thanh_toan_ngay: false,
    }));

    if (don.phuong_thuc_thanh_toan === 'VNPAY') {
      const vnpayUrl = this.taoVnPayUrl(don.id, don.tong_tien, body.ipAddr || '127.0.0.1');
      return { success: true, message: `Đang chuyển hướng sang VNPAY...`, vnpay_url: vnpayUrl, data: don };
    }

    if (don.phuong_thuc_thanh_toan === 'VI_DIEN_TU') {
      // Giả lập thanh toán Ví điện tử thành công ngay lập tức
      don.trang_thai = 'DA_DAT';
      don.thanh_toan_ngay = true;
      await this.donMuaComboRepo.save(don);
      return { success: true, message: `Thanh toán qua Ví điện tử thành công. Đã trừ ${tongTien.toLocaleString()}đ.`, data: don };
    }

    return { success: true, message: `Đã đặt ${soLuong} ${combo.ten_combo}. Admin sẽ xác nhận giao hàng sớm.`, data: don };
  }

  taoVnPayUrl(maDonHang: string, soTien: number, ipAddr: string = '127.0.0.1') {
    const tmnCode = process.env.VNPAY_TMN_CODE || 'MEBLXEDU';
    const secretKey = process.env.VNPAY_HASH_SECRET || 'T718SPDGIGQSKGM98VCSNAF70M9X93MC';
    const vnpUrl = process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const returnUrl = (process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001') + '/franchise/vnpay/return';

    const date = new Date();
    // Chỉnh giờ về UTC+7 theo chuẩn VNPay
    date.setHours(date.getHours() + 7);
    const createDate = date.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    
    const vnpParams: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: maDonHang,
      vnp_OrderInfo: 'Thanh toan combo ' + maDonHang,
      vnp_OrderType: 'other',
      vnp_Amount: String(Math.floor(soTien) * 100),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate,
    };

    const sortedKeys = Object.keys(vnpParams).sort();
    const sortedParams: string[] = [];
    for (const key of sortedKeys) {
      sortedParams.push(`${key}=${encodeURIComponent(vnpParams[key])}`);
    }
    const signData = sortedParams.join('&');
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    
    return `${vnpUrl}?${signData}&vnp_SecureHash=${signed}`;
  }

  async ketQuaVnpay(query: Record<string, string>) {
    const secretKey = process.env.VNPAY_HASH_SECRET || 'T718SPDGIGQSKGM98VCSNAF70M9X93MC';
    const vnp_SecureHash = query['vnp_SecureHash'];
    delete query['vnp_SecureHash'];
    delete query['vnp_SecureHashType'];

    const sortedKeys = Object.keys(query).sort();
    const sortedParams: string[] = [];
    for (const key of sortedKeys) {
      sortedParams.push(`${key}=${encodeURIComponent(query[key])}`);
    }
    const signData = sortedParams.join('&');
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    const maDonHang = query['vnp_TxnRef'];
    const don = await this.donMuaComboRepo.findOne({ where: { id: maDonHang } });
    if (!don) return { success: false, isValid: false };

    if (signed === vnp_SecureHash) {
      const isSuccess = query['vnp_ResponseCode'] === '00';
      if (isSuccess) {
        don.thanh_toan_ngay = true;
        await this.donMuaComboRepo.save(don);
      }
      return { success: isSuccess, isValid: true };
    }
    return { success: false, isValid: false };
  }

  async layDanhSachDonMuaCombo(trang_thai?: string, kiosk_id?: string) {
    const query = this.donMuaComboRepo.createQueryBuilder('d').orderBy('d.ngay_tao', 'DESC');
    if (trang_thai) query.andWhere('d.trang_thai = :trang_thai', { trang_thai });
    if (kiosk_id) query.andWhere('d.kiosk_id = :kiosk_id', { kiosk_id });
    const dons = await query.getMany();
    return Promise.all(dons.map(async (d) => {
      const combo = await this.comboRepo.findOne({ where: { id: d.combo_id } });
      const kiosk = await this.kioskRepo.findOne({ where: { id: d.kiosk_id } });
      return { ...d, combo, kiosk };
    }));
  }

  async layDonMuaComboCuaToi(franchiseeId: string) {
    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId } });
    const kioskIds = kiosks.map(k => k.id);
    if (!kioskIds.length) return [];
    const dons = await this.donMuaComboRepo.createQueryBuilder('d')
      .where('d.kiosk_id IN (:...ids)', { ids: kioskIds })
      .orderBy('d.ngay_tao', 'DESC').getMany();
    return Promise.all(dons.map(async (d) => {
      const combo = await this.comboRepo.findOne({ where: { id: d.combo_id } });
      return { ...d, combo };
    }));
  }

  async xacNhanDaGiaoCombo(donId: string, adminId: string, ghi_chu?: string) {
    const don = await this.donMuaComboRepo.findOne({ where: { id: donId } });
    if (!don) throw new NotFoundException('Không tìm thấy đơn');
    if (don.trang_thai !== 'DA_DAT') throw new BadRequestException('Đơn không ở trạng thái đã đặt');

    don.trang_thai = 'DA_GIAO';
    don.ngay_giao = new Date();
    don.nguoi_xu_ly_id = adminId;
    don.ghi_chu_admin = ghi_chu || null;
    await this.donMuaComboRepo.save(don);

    // Cộng combo vào kho kiosk
    await this.kioskRepo.increment({ id: don.kiosk_id }, 'so_combo_hien_tai', don.so_luong);

    // Nếu chưa thanh toán ngay → tạo công nợ
    if (!don.thanh_toan_ngay && don.phuong_thuc_thanh_toan === 'CONG_NO') {
      const hanThanhToan = new Date();
      hanThanhToan.setDate(hanThanhToan.getDate() + 14); // 14 ngày
      await this.congNoRepo.save(this.congNoRepo.create({
        kiosk_id: don.kiosk_id,
        don_mua_combo_id: don.id,
        loai_phat_sinh: 'NGUYEN_LIEU',
        so_tien: don.tong_tien,
        han_thanh_toan: hanThanhToan.toISOString().split('T')[0],
        trang_thai: 'CON_NO',
      }));
    }

    return { success: true, message: 'Đã xác nhận giao combo và cộng vào kho kiosk.', data: don };
  }

  async tamHoanDon(donId: string, adminId: string, ghi_chu: string) {
    const don = await this.donMuaComboRepo.findOne({ where: { id: donId } });
    if (!don) throw new NotFoundException('Không tìm thấy đơn');
    don.trang_thai = 'TAM_HOAN';
    don.ghi_chu_admin = ghi_chu;
    don.nguoi_xu_ly_id = adminId;
    await this.donMuaComboRepo.save(don);
    return { success: true, message: 'Đơn đã tạm hoãn do kho không đủ hàng.', data: don };
  }

  // ─────────────────────────────────────────────
  // UC-B04: Công nợ
  // ─────────────────────────────────────────────

  async layDanhSachCongNo(trang_thai?: string, kiosk_id?: string) {
    // Cập nhật trạng thái quá hạn tự động
    await this.dataSource.query(`
      UPDATE franchise.cong_no SET trang_thai = 'QUA_HAN', ngay_cap_nhat = NOW()
      WHERE trang_thai = 'CON_NO' AND han_thanh_toan < CURRENT_DATE
    `);
    const query = this.congNoRepo.createQueryBuilder('c').orderBy('c.ngay_tao', 'DESC');
    if (trang_thai) query.where('c.trang_thai = :trang_thai', { trang_thai });
    if (kiosk_id) query.andWhere('c.kiosk_id = :kiosk_id', { kiosk_id });
    const congNos = await query.getMany();
    return Promise.all(congNos.map(async (c) => {
      const kiosk = await this.kioskRepo.findOne({ where: { id: c.kiosk_id } });
      return { ...c, kiosk };
    }));
  }

  async layDanhSachCongNoCuaToi(franchiseeId: string) {
    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId } });
    const ids = kiosks.map(k => k.id);
    if (!ids.length) return [];
    const congNos = await this.congNoRepo.createQueryBuilder('c').where('c.kiosk_id IN (:...ids)', { ids }).orderBy('c.ngay_tao', 'DESC').getMany();
    return Promise.all(congNos.map(async (c) => {
      const kiosk = kiosks.find(k => k.id === c.kiosk_id);
      return { ...c, kiosk };
    }));
  }

  async xacNhanThanhToanCongNo(id: string, accountantId: string, ghi_chu?: string) {
    const congNo = await this.congNoRepo.findOne({ where: { id } });
    if (!congNo) throw new NotFoundException('Không tìm thấy công nợ');
    if (congNo.trang_thai === 'DA_THANH_TOAN') throw new BadRequestException('Công nợ này đã được thanh toán');
    congNo.trang_thai = 'DA_THANH_TOAN';
    congNo.ngay_xac_nhan_thanh_toan = new Date();
    congNo.nguoi_xac_nhan_id = accountantId;
    congNo.ghi_chu = ghi_chu || null;
    await this.congNoRepo.save(congNo);
    return { success: true, message: 'Đã xác nhận thanh toán công nợ thành công.', data: congNo };
  }

  async thanhToanViCongNo(id: string, franchiseeId: string) {
    const congNo = await this.congNoRepo.findOne({ where: { id } });
    if (!congNo) throw new NotFoundException('Không tìm thấy công nợ');
    const kiosk = await this.kioskRepo.findOne({ where: { id: congNo.kiosk_id, franchisee_id: franchiseeId } });
    if (!kiosk) throw new BadRequestException('Không có quyền thanh toán công nợ này');
    if (congNo.trang_thai === 'DA_THANH_TOAN') throw new BadRequestException('Công nợ này đã được thanh toán');
    
    congNo.trang_thai = 'DA_THANH_TOAN';
    congNo.ngay_xac_nhan_thanh_toan = new Date();
    congNo.nguoi_xac_nhan_id = franchiseeId; // Tự thanh toán qua ví
    congNo.ghi_chu = (congNo.ghi_chu || '') + ' [Thanh toán qua ví điện tử]';
    await this.congNoRepo.save(congNo);
    return { success: true, message: 'Thanh toán thành công.', data: congNo };
  }

  // ─────────────────────────────────────────────
  // UC-B05: Royalty hàng tháng
  // ─────────────────────────────────────────────

  async layDanhSachRoyalty(thang?: string, kiosk_id?: string) {
    const query = this.royaltyRepo.createQueryBuilder('r').orderBy('r.thang', 'DESC');
    if (thang) query.where('r.thang = :thang', { thang });
    if (kiosk_id) query.andWhere('r.kiosk_id = :kiosk_id', { kiosk_id });
    const royalties = await query.getMany();
    return Promise.all(royalties.map(async (r) => {
      const kiosk = await this.kioskRepo.findOne({ where: { id: r.kiosk_id } });
      return { ...r, kiosk };
    }));
  }

  async layRoyaltyCuaToi(franchiseeId: string) {
    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId } });
    const ids = kiosks.map(k => k.id);
    if (!ids.length) return [];
    return this.royaltyRepo.createQueryBuilder('r').where('r.kiosk_id IN (:...ids)', { ids }).orderBy('r.thang', 'DESC').getMany();
  }

  async tinhRoyaltyThang(adminId: string, thang?: string) {
    // Tháng mặc định là tháng trước
    const now = new Date();
    if (!thang) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      thang = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    const kiosks = await this.kioskRepo.find({ where: { trang_thai: 'DANG_HOAT_DONG' } });
    const results: any[] = [];

    for (const kiosk of kiosks) {
      const hopDong = await this.hopDongRepo.findOne({ where: { kiosk_id: kiosk.id, trang_thai: 'HIEU_LUC' } });
      if (!hopDong) continue;

      // Lấy doanh thu tháng từ bảng orders (đơn HOAN_THANH trong tháng, của chi nhánh kiosk)
      // Ở đây dùng dữ liệu từ royalty seed nếu có sẵn, tính từ orders.don_hang nếu có kết nối
      const startDate = `${thang}-01`;
      const endDate = `${thang}-31`;

      const [doanhThuRows] = await this.dataSource.query(`
        SELECT COALESCE(SUM(tong_tien_sau_giam), 0) as doanh_thu
        FROM orders.don_hang
        WHERE trang_thai = 'HOAN_THANH'
          AND ma_chi_nhanh = $1
          AND ngay_tao BETWEEN $2 AND $3
      `, [kiosk.ma_kiosk, startDate, endDate]).catch(() => [{ doanh_thu: 0 }]);

      const doanhThu = Number(doanhThuRows?.doanh_thu || 0);
      const tyLeRoyalty = Number(hopDong.ty_le_royalty_phan_tram);
      const soTienRoyalty = doanhThu * tyLeRoyalty / 100;

      // Upsert royalty record
      const existing = await this.royaltyRepo.findOne({ where: { kiosk_id: kiosk.id, thang } });
      if (existing && existing.trang_thai !== 'CHO_XAC_NHAN') continue; // Không ghi đè đã xác nhận

      if (existing) {
        existing.doanh_thu_thuc_te = doanhThu;
        existing.so_tien_royalty = soTienRoyalty;
        await this.royaltyRepo.save(existing);
        results.push(existing);
      } else {
        const royalty = await this.royaltyRepo.save(this.royaltyRepo.create({
          kiosk_id: kiosk.id,
          thang,
          doanh_thu_thuc_te: doanhThu,
          ty_le_royalty: tyLeRoyalty,
          so_tien_royalty: soTienRoyalty,
          trang_thai: 'CHO_XAC_NHAN',
        }));
        results.push(royalty);
      }
    }
    return { success: true, message: `Đã tính royalty cho tháng ${thang} - ${results.length} kiosk.`, data: results };
  }

  async xacNhanRoyalty(id: string, accountantId: string, ghi_chu?: string) {
    const royalty = await this.royaltyRepo.findOne({ where: { id } });
    if (!royalty) throw new NotFoundException('Không tìm thấy bảng kê royalty');
    if (royalty.trang_thai !== 'CHO_XAC_NHAN') throw new BadRequestException('Bảng kê không ở trạng thái chờ xác nhận');
    royalty.trang_thai = 'DA_XAC_NHAN';
    royalty.ngay_xac_nhan = new Date();
    royalty.nguoi_xac_nhan_id = accountantId;
    royalty.ghi_chu_ke_toan = ghi_chu || null;
    await this.royaltyRepo.save(royalty);

    // Tạo công nợ royalty
    await this.congNoRepo.save(this.congNoRepo.create({
      kiosk_id: royalty.kiosk_id,
      royalty_id: royalty.id,
      loai_phat_sinh: 'ROYALTY',
      so_tien: royalty.so_tien_royalty,
      han_thanh_toan: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0],
      trang_thai: 'CON_NO',
    }));

    return { success: true, message: 'Đã xác nhận bảng kê royalty và tạo công nợ.', data: royalty };
  }

  async ghiNhanThanhToanRoyalty(id: string, accountantId: string) {
    const royalty = await this.royaltyRepo.findOne({ where: { id } });
    if (!royalty) throw new NotFoundException('Không tìm thấy bảng kê royalty');
    if (royalty.trang_thai !== 'DA_XAC_NHAN') throw new BadRequestException('Cần xác nhận bảng kê trước');
    royalty.trang_thai = 'DA_THANH_TOAN';
    royalty.ngay_thanh_toan = new Date();
    royalty.nguoi_xac_nhan_id = accountantId;
    await this.royaltyRepo.save(royalty);
    // Cập nhật công nợ royalty tương ứng
    await this.congNoRepo.createQueryBuilder().update(CongNo)
      .set({ trang_thai: 'DA_THANH_TOAN', ngay_xac_nhan_thanh_toan: new Date(), nguoi_xac_nhan_id: accountantId })
      .where('royalty_id = :id', { id }).execute();
    return { success: true, message: 'Đã ghi nhận thanh toán royalty thành công.', data: royalty };
  }

  // ─────────────────────────────────────────────
  // UC-B06: Đối soát gian lận
  // ─────────────────────────────────────────────

  async layKetQuaDoiSoat(kiosk_id?: string) {
    const query = this.doiSoatRepo.createQueryBuilder('d').orderBy('d.ky_doi_soat', 'DESC');
    if (kiosk_id) query.where('d.kiosk_id = :kiosk_id', { kiosk_id });
    const results = await query.getMany();
    return Promise.all(results.map(async (d) => {
      const kiosk = await this.kioskRepo.findOne({ where: { id: d.kiosk_id } });
      return { ...d, kiosk };
    }));
  }

  async chayDoiSoat(adminId: string, ky?: string) {
    const now = new Date();
    if (!ky) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      ky = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    const kiosks = await this.kioskRepo.find({ where: { trang_thai: 'DANG_HOAT_DONG' } });
    const results: any[] = [];

    for (const kiosk of kiosks) {
      // Tổng số combo đã mua trong kỳ (đã giao)
      const combosGiao = await this.donMuaComboRepo.createQueryBuilder('d')
        .where('d.kiosk_id = :id AND d.trang_thai = :ts', { id: kiosk.id, ts: 'DA_GIAO' })
        .andWhere(`to_char(d.ngay_giao, 'YYYY-MM') = :ky`, { ky })
        .getMany();

      const tongCombo = combosGiao.reduce((s, d) => s + d.so_luong, 0);
      
      // Doanh thu kỳ vọng trung bình mỗi combo
      let dtKyVongMoiCombo = 0;
      for (const don of combosGiao) {
        const combo = await this.comboRepo.findOne({ where: { id: don.combo_id } });
        if (combo) dtKyVongMoiCombo += Number(combo.doanh_thu_uoc_tinh_moi_combo) * don.so_luong;
      }
      const kyVong = tongCombo > 0 ? dtKyVongMoiCombo : 0;
      const kyVongMoiCombo = tongCombo > 0 ? dtKyVongMoiCombo / tongCombo : 0;

      // Doanh thu thực tế từ royalty
      const royalty = await this.royaltyRepo.findOne({ where: { kiosk_id: kiosk.id, thang: ky } });
      const thucTe = royalty ? Number(royalty.doanh_thu_thuc_te) : 0;

      // Tính chênh lệch
      let chenhLech = 0;
      if (kyVong > 0) chenhLech = ((thucTe - kyVong) / kyVong) * 100;

      // Xác định mức cảnh báo
      let mucCanhBao: 'XANH' | 'VANG' | 'DO' = 'XANH';
      if (chenhLech < -40) mucCanhBao = 'DO';
      else if (chenhLech < -15) mucCanhBao = 'VANG';

      // Đếm số kỳ liên tiếp bị cảnh báo
      const kyTruoc = await this.doiSoatRepo.findOne({
        where: { kiosk_id: kiosk.id },
        order: { ky_doi_soat: 'DESC' },
      });
      const soKyLienTiep = (mucCanhBao !== 'XANH' && kyTruoc && kyTruoc.muc_canh_bao !== 'XANH')
        ? (kyTruoc.so_ky_lien_tiep_canh_bao + 1)
        : (mucCanhBao !== 'XANH' ? 1 : 0);

      // Upsert kết quả
      const existing = await this.doiSoatRepo.findOne({ where: { kiosk_id: kiosk.id, ky_doi_soat: ky } });
      const doiSoatData = {
        kiosk_id: kiosk.id,
        ky_doi_soat: ky,
        tong_combo_da_mua: tongCombo,
        doanh_thu_ky_vong_moi_combo: kyVongMoiCombo,
        doanh_thu_ky_vong: kyVong,
        doanh_thu_thuc_te: thucTe,
        chenh_lech_phan_tram: chenhLech,
        muc_canh_bao: mucCanhBao,
        so_ky_lien_tiep_canh_bao: soKyLienTiep,
        ngay_doi_soat: new Date(),
        nguoi_doi_soat_id: adminId,
      };

      if (existing) {
        await this.doiSoatRepo.update(existing.id, doiSoatData);
        results.push({ ...existing, ...doiSoatData });
      } else {
        const saved = await this.doiSoatRepo.save(this.doiSoatRepo.create(doiSoatData));
        results.push(saved);
      }
    }

    const soKioskDo = results.filter(r => r.muc_canh_bao === 'DO').length;
    const soKioskVang = results.filter(r => r.muc_canh_bao === 'VANG').length;
    return {
      success: true,
      message: `Đối soát kỳ ${ky}: ${results.length} kiosk | 🟢 ${results.length - soKioskDo - soKioskVang} | 🟡 ${soKioskVang} | 🔴 ${soKioskDo}`,
      data: results,
    };
  }

  // UC: Cập nhật trạng thái Kiosk (Admin thủ công)
  async capNhatTrangThaiKiosk(id: string, trang_thai: any) {
    const kiosk = await this.kioskRepo.findOne({ where: { id } });
    if (!kiosk) throw new NotFoundException('Không tìm thấy kiosk');
    kiosk.trang_thai = trang_thai;
    await this.kioskRepo.save(kiosk);
    return { success: true, message: `Đã cập nhật trạng thái Kiosk thành ${trang_thai}` };
  }

  // UC: Xử lý nợ quá hạn tự động (Cron Job / Manual trigger)
  async xuLyNoQuaHan() {
    const congNos = await this.congNoRepo.find({ 
      where: [
        { trang_thai: 'CON_NO' },
        { trang_thai: 'QUA_HAN' }
      ] 
    });

    let totalPhat = 0;
    let totalKhoa = 0;
    let totalTamDung = 0;
    const now = new Date();
    
    for (const cn of congNos) {
      if (!cn.han_thanh_toan) continue;
      const han = new Date(cn.han_thanh_toan);
      if (han >= now) continue;

      const diffTime = now.getTime() - han.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      // Đánh dấu là QUÁ HẠN
      if (cn.trang_thai === 'CON_NO') {
        cn.trang_thai = 'QUA_HAN';
        await this.congNoRepo.save(cn);
      }

      // Ngày 4+: Tính tiền phạt (Ở đây demo update số tiền + ghi chú)
      if (diffDays >= 4) {
        // Phạt 0.1%/ngày
        // Để demo đơn giản tránh sinh vô hạn record, ta ghi nhận số tiền phạt trực tiếp hoặc ghi chú
        cn.ghi_chu = `Quá hạn ${diffDays} ngày. Đã áp dụng phạt trễ hạn.`;
        await this.congNoRepo.save(cn);
        totalPhat++;
      }

      // Ngày 8+: Khóa Portal (Vô hiệu hóa user)
      if (diffDays >= 8) {
        const kiosk = await this.kioskRepo.findOne({ where: { id: cn.kiosk_id } });
        if (kiosk) {
          await this.dataSource.query('UPDATE identity.users SET is_active = false WHERE id = $1', [kiosk.franchisee_id]);
          totalKhoa++;
        }
      }

      // Ngày 15+: Tạm dừng Kiosk
      if (diffDays >= 15) {
        const kiosk = await this.kioskRepo.findOne({ where: { id: cn.kiosk_id } });
        if (kiosk && kiosk.trang_thai !== 'TAM_DUNG' && kiosk.trang_thai !== 'NGUNG_HOAT_DONG') {
          kiosk.trang_thai = 'TAM_DUNG';
          await this.kioskRepo.save(kiosk);
          totalTamDung++;
        }
      }
    }
    
    return { 
      success: true, 
      message: `Quét nợ xong: Đánh dấu/phạt ${totalPhat} khoản, Khóa ${totalKhoa} tài khoản, Tạm dừng ${totalTamDung} Kiosk` 
    };
  }
}

