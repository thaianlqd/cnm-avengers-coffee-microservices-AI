import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ComboNguyenLieu } from './entities/combo-nguyen-lieu.entity';
import { HoSoDangKy } from './entities/ho-so-dang-ky.entity';
import { Kiosk } from './entities/kiosk.entity';
import { HopDongNhuongQuyen } from './entities/hop-dong.entity';
import { DonMuaCombo } from './entities/don-mua-combo.entity';
import { CongNo } from './entities/cong-no.entity';
import { RoyaltyHangThang } from './entities/royalty.entity';
import { KetQuaDoiSoat } from './entities/doi-soat.entity';
import { BienBanViPham } from './entities/bien-ban-vi-pham.entity';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '../user/user.entity';
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

    @InjectRepository(BienBanViPham)
    private bienBanRepo: Repository<BienBanViPham>,

    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

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
  // Audit Log Helper
  // ─────────────────────────────────────────────
  private async logAction(adminId: string | null, hanhDong: string, chiTiet: string | null = null) {
    try {
      await this.auditLogRepo.save(this.auditLogRepo.create({
        admin_id: adminId,
        hanh_dong: hanhDong,
        chi_tiet: chiTiet
      }));
    } catch (e) {
      console.error('Lỗi ghi AuditLog:', e);
    }
  }

  async getAuditLogs() {
    return this.auditLogRepo.find({ order: { thoi_gian: 'DESC' }, take: 100 });
  }

  // ─────────────────────────────────────────────
  // UC-ADMIN: Quản lý Hồ sơ Đăng ký (UC-B01)
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

  async traCuuHoSo(soDienThoai: string) {
    if (!soDienThoai) throw new BadRequestException('Vui lòng cung cấp số điện thoại để tra cứu');
    // Tìm các hồ sơ liên quan đến SĐT này (mới nhất lên đầu)
    const hoSoList = await this.hoSoRepo.find({ 
      where: { so_dien_thoai: soDienThoai },
      order: { ngay_tao: 'DESC' }
    });
    
    if (hoSoList.length === 0) {
      throw new NotFoundException('Không tìm thấy hồ sơ nào với số điện thoại này.');
    }
    
    return { success: true, message: 'Lấy dữ liệu thành công', data: hoSoList };
  }

  async yeuCauDatCoc(id: string, adminId: string) {
    const hoSo = await this.hoSoRepo.findOne({ where: { id } });
    if (!hoSo) throw new NotFoundException('Không tìm thấy hồ sơ');
    if (hoSo.trang_thai !== 'CHO_XEM_XET') throw new BadRequestException('Hồ sơ không ở trạng thái chờ xem xét');

    // Kiểm tra độc quyền địa lý
    if (hoSo.quan_huyen && hoSo.thanh_pho) {
      const existing = await this.kioskRepo.count({
        where: {
          quan_huyen: hoSo.quan_huyen,
          thanh_pho: hoSo.thanh_pho,
          trang_thai: In(['DANG_HOAT_DONG', 'DANG_THIET_LAP', 'TAM_DUNG', 'CHO_KY_HOP_DONG'])
        }
      });
      if (existing > 0) {
        throw new BadRequestException(`Vi phạm độc quyền: Khu vực ${hoSo.quan_huyen}, ${hoSo.thanh_pho} đã có Kiosk hoạt động!`);
      }
    }

    hoSo.trang_thai = 'CHO_DAT_COC';
    hoSo.nguoi_xu_ly_id = adminId;
    await this.hoSoRepo.save(hoSo);
    await this.logAction(adminId, 'YEU_CAU_DAT_COC', `Hồ sơ: ${id}`);
    
    // Gửi email yêu cầu đặt cọc
    const bankName = process.env.SEPAY_BANK_CODE || 'MBBank';
    const bankAccount = process.env.SEPAY_ACCOUNT_NO || '025452790502';
    this.sendMail(
      hoSo.email,
      '[Avengers Coffee] Yêu cầu đặt cọc giữ chỗ khu vực',
      `Chào ${hoSo.ho_ten},<br/><br/>
       Hồ sơ của bạn đã qua vòng duyệt sơ bộ. Để hệ thống tiến hành cấp tài khoản và giữ chỗ khu vực (${hoSo.quan_huyen} - ${hoSo.thanh_pho}), vui lòng hoàn tất khoản đặt cọc <b>5.000.000 VNĐ</b>.<br/><br/>
       <b>THÔNG TIN CHUYỂN KHOẢN:</b><br/>
       - Ngân hàng: <b>${bankName}</b><br/>
       - Số tài khoản: <b>${bankAccount}</b><br/>
       - Chủ tài khoản: <b>NGUYEN THAI AN</b><br/>
       - Nội dung chuyển khoản: <b>COC KIOSK ${hoSo.so_dien_thoai}</b><br/><br/>
       Sau khi thanh toán thành công, hệ thống tự động của chúng tôi sẽ xác nhận và gửi email chứa tài khoản quản lý Cổng Nhượng Quyền cho bạn.<br/><br/>
       Trân trọng,<br/>Avengers Coffee`
    ).catch(e => console.error('[franchise-mail] deposit email error:', e.message));

    return { success: true, message: 'Đã yêu cầu khách hàng đặt cọc 5.000.000đ.', data: hoSo };
  }

  async duyetHoSo(id: string, adminId: string) {
    const hoSo = await this.hoSoRepo.findOne({ where: { id } });
    if (!hoSo) throw new NotFoundException('Không tìm thấy hồ sơ');
    if (hoSo.trang_thai !== 'CHO_DAT_COC') throw new BadRequestException('Hồ sơ chưa được yêu cầu đặt cọc');
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
      // Khoản 1: Tiền đặt cọc (5tr)
      await this.congNoRepo.save(this.congNoRepo.create({
        kiosk_id: newKiosk.id,
        loai_phat_sinh: 'KHOI_TAO',
        so_tien: 5000000,
        han_thanh_toan: new Date().toISOString().split('T')[0],
        trang_thai: 'DA_THANH_TOAN',
        ghi_chu: 'Tiền đặt cọc giữ chỗ (Đã thu)',
      }));

      // Khoản 2: Còn lại
      await this.congNoRepo.save(this.congNoRepo.create({
        kiosk_id: newKiosk.id,
        loai_phat_sinh: 'KHOI_TAO',
        so_tien: soTienKhoiTao - 5000000,
        han_thanh_toan: hanThanhToan,
        trang_thai: 'CON_NO',
        ghi_chu: 'Phí nhượng quyền ban đầu (Đã trừ cọc)',
      }));
    }

    hoSo.franchisee_user_id = franchiseeId;
    hoSo.trang_thai = 'DA_DUYET';
    hoSo.nguoi_xu_ly_id = adminId;
    await this.hoSoRepo.save(hoSo);
    await this.logAction(adminId, 'DUYET_HO_SO', `Hồ sơ: ${id}`);

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
    await this.logAction(adminId, 'TU_CHOI_HO_SO', `Hồ sơ: ${id}, Lý do: ${ly_do}`);
    
    // Gửi email thông báo từ chối
    this.sendMail(
      hoSo.email,
      '[Avengers Coffee] Thông báo kết quả xét duyệt hồ sơ nhượng quyền',
      `Chào ${hoSo.ho_ten},\nCảm ơn bạn đã quan tâm đến hệ thống Avengers Coffee.\nRất tiếc, hồ sơ đăng ký nhượng quyền khu vực (${hoSo.quan_huyen} - ${hoSo.thanh_pho}) của bạn chưa phù hợp ở thời điểm hiện tại.\n\nLý do từ chối: ${ly_do}\n\nHy vọng sẽ có cơ hội hợp tác với bạn trong tương lai. Xin cảm ơn!`
    ).catch(e => console.error('[franchise-mail] tu-choi email error:', e.message));

    return { success: true, message: 'Đã từ chối hồ sơ và gửi email thông báo.', data: hoSo };
  }

  async huyHoSoDangKy(id: string) {
    const hoSo = await this.hoSoRepo.findOne({ where: { id } });
    if (!hoSo) throw new NotFoundException('Không tìm thấy hồ sơ');
    
    if (hoSo.trang_thai === 'TU_CHOI' || hoSo.trang_thai === 'DA_HUY') {
      throw new BadRequestException('Hồ sơ này đã bị hủy hoặc từ chối trước đó.');
    }

    let refundAmount = 0;
    let message = 'Bạn đã hủy hồ sơ thành công.';

    // Nếu đã duyệt (đã đóng cọc 5tr)
    if (hoSo.trang_thai === 'DA_DUYET') {
      const msInDay = 24 * 60 * 60 * 1000;
      const daysSinceUpdate = Math.floor((Date.now() - new Date(hoSo.ngay_cap_nhat).getTime()) / msInDay);
      
      // Chính sách hoàn cọc:
      // - Hủy trong 7 ngày: Hoàn 100% (5,000,000)
      // - Hủy từ 7-14 ngày: Hoàn 50% (2,500,000)
      // - Sau 14 ngày: Không hoàn cọc
      if (daysSinceUpdate <= 7) {
        refundAmount = 5000000;
        message = 'Bạn đã hủy hồ sơ thành công. Tiền cọc 5,000,000đ sẽ được hoàn lại 100% trong vòng 3-5 ngày làm việc.';
      } else if (daysSinceUpdate <= 14) {
        refundAmount = 2500000;
        message = `Bạn đã hủy hồ sơ thành công. Do đã quá 7 ngày, bạn được hoàn lại 50% tiền cọc (2,500,000đ).`;
      } else {
        message = 'Bạn đã hủy hồ sơ thành công. Do đã quá 14 ngày, tiền cọc sẽ không được hoàn lại theo quy định.';
      }

      // Đổi trạng thái Kiosk liên quan thành NGUNG_HOAT_DONG hoặc DA_HUY
      const kiosk = await this.kioskRepo.findOne({ where: { ho_so_id: id } });
      if (kiosk) {
        kiosk.trang_thai = 'NGUNG_HOAT_DONG';
        await this.kioskRepo.save(kiosk);
      }
    } else if (hoSo.trang_thai === 'CHO_DAT_COC') {
      message = 'Bạn đã hủy hồ sơ thành công. Hồ sơ chưa thanh toán cọc nên không có khoản hoàn lại.';
    }

    hoSo.trang_thai = 'DA_HUY'; 
    hoSo.ly_do_tu_choi = 'Khách hàng tự hủy đăng ký';
    hoSo.ghi_chu = hoSo.ghi_chu ? hoSo.ghi_chu + `\n[Hệ thống]: Hủy đăng ký. Số tiền hoàn cọc dự kiến: ${refundAmount}đ` : `[Hệ thống]: Số tiền hoàn cọc dự kiến: ${refundAmount}đ`;
    await this.hoSoRepo.save(hoSo);
    
    await this.logAction(null, 'HUY_HO_SO', `Hồ sơ: ${id}, Hoàn cọc: ${refundAmount}`);
    return { success: true, message, data: { ...hoSo, refund_amount: refundAmount } };
  }

  // ─────────────────────────────────────────────
  // UC-B02: Kiosk & Hợp đồng
  // ─────────────────────────────────────────────

  async layDanhSachKioskPublic() {
    return this.kioskRepo.find({
      where: { trang_thai: 'DANG_HOAT_DONG' },
      select: ['id', 'ma_kiosk', 'ten_kiosk', 'dia_chi', 'quan_huyen', 'thanh_pho', 'loai_kiosk', 'ngay_tao'],
      order: { ngay_tao: 'DESC' }
    });
  }

  async layDanhSachKiosk() {
    const kiosks = await this.kioskRepo.find({ order: { ngay_tao: 'DESC' } });
    const result = await Promise.all(kiosks.map(async (k) => {
      const hopDong = await this.hopDongRepo.findOne({ where: { kiosk_id: k.id }, order: { ngay_tao: 'DESC' } });
      const danhSachCongNo = await this.congNoRepo.find({ where: { kiosk_id: k.id } });
      const danhSachDoiSoat = await this.doiSoatRepo.find({ where: { kiosk_id: k.id } });

      let congNoCount = 0;
      let score = 100;

      danhSachCongNo.forEach(cn => {
        if (cn.trang_thai === 'CON_NO') {
          congNoCount++;
          score -= 5;
        }
        if (cn.trang_thai === 'QUA_HAN') score -= 20;
      });

      danhSachDoiSoat.forEach(ds => {
        if (ds.muc_canh_bao === 'VANG') score -= 15;
        if (ds.muc_canh_bao === 'DO') score -= 30;
      });

      if (k.so_combo_hien_tai > 50) score += 10;

      let rank = 'C';
      if (score >= 90) rank = 'S';
      else if (score >= 70) rank = 'A';
      else if (score >= 50) rank = 'B';

      return { 
        ...k, 
        hop_dong: hopDong, 
        so_cong_no_chua_thanh_toan: congNoCount,
        diem_danh_gia: score,
        xep_hang: rank
      };
    }));
    return result;
  }

  async layKioskCuaToi(franchiseeId: string) {
    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId }, order: { ngay_tao: 'DESC' } });
    return Promise.all(kiosks.map(async (k) => {
      const hopDong = await this.hopDongRepo.findOne({ where: { kiosk_id: k.id, trang_thai: 'HIEU_LUC' }, order: { ngay_tao: 'DESC' } });
      const congNo = await this.congNoRepo.find({ 
        where: [
          { kiosk_id: k.id, trang_thai: 'CON_NO' },
          { kiosk_id: k.id, trang_thai: 'QUA_HAN' }
        ] 
      });
      const tongCongNo = congNo.reduce((sum, c) => sum + Number(c.so_tien) + Number(c.phi_phat_tre_han || 0), 0);
      
      // Tính điểm Franchisee
      let score = 100;
      if (congNo.length > 0) score -= (congNo.length * 10);

      const doiSoat = await this.doiSoatRepo.find({ where: { kiosk_id: k.id } });
      doiSoat.forEach(ds => {
        if (ds.muc_canh_bao === 'VANG') score -= 15;
        if (ds.muc_canh_bao === 'DO') score -= 30;
      });

      if (k.so_combo_hien_tai > 50) score += 10;

      let rank = 'C';
      if (score >= 90) rank = 'S';
      else if (score >= 70) rank = 'A';
      else if (score >= 50) rank = 'B';

      return { 
        ...k, 
        hop_dong: hopDong, 
        tong_cong_no: tongCongNo,
        diem_danh_gia: score,
        xep_hang: rank
      };
    }));
  }

  async taoHopDong(kioskId: string, body: any, adminId: string) {
    const kiosk = await this.kioskRepo.findOne({ where: { id: kioskId } });
    if (!kiosk) throw new NotFoundException('Không tìm thấy kiosk');
    if (kiosk.trang_thai !== 'CHO_KY_HOP_DONG') throw new BadRequestException('Kiosk không ở trạng thái chờ ký hợp đồng');

    if (!body.file_hop_dong_url) {
      throw new BadRequestException('Bắt buộc phải đính kèm bản scan Hợp đồng đã ký (PDF/Ảnh) trước khi tạo.');
    }

    const hopDong = await this.hopDongRepo.save(this.hopDongRepo.create({
      kiosk_id: kioskId,
      goi_kiosk: kiosk.loai_kiosk,
      ngay_ky: body.ngay_ky,
      ngay_het_han: body.ngay_het_han,
      ty_le_royalty_phan_tram: body.ty_le_royalty_phan_tram ?? 7.0,
      so_combo_khoi_diem: body.so_combo_khoi_diem ?? 0,
      so_ngay_an_han: body.so_ngay_an_han ?? 3,
      phan_tram_phat_tre_han: body.phan_tram_phat_tre_han ?? 2.0,
      file_hop_dong_url: body.file_hop_dong_url,
      trang_thai: 'HIEU_LUC',
      nguoi_tao_id: adminId,
    }));

    // Cộng combo khởi điểm vào kiosk
    kiosk.so_combo_hien_tai = (kiosk.so_combo_hien_tai || 0) + (body.so_combo_khoi_diem || 0);
    kiosk.trang_thai = 'DANG_THIET_LAP';
    await this.kioskRepo.save(kiosk);

    await this.logAction(adminId, 'TAO_HOP_DONG', `Kiosk: ${kioskId}`);
    return { success: true, message: 'Hợp đồng đã được tạo. Kiosk đang trong giai đoạn thiết lập.', data: hopDong };
  }

  async xacNhanKhaiTruong(kioskId: string, adminId: string) {
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
    await this.logAction(adminId, 'KHAI_TRUONG_KIOSK', `Kiosk: ${kioskId}`);
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

    await this.logAction(adminId, 'GIAO_DON_COMBO', `Đơn: ${donId}`);
    return { success: true, message: 'Đã xác nhận giao combo và cộng vào kho kiosk.', data: don };
  }

  async tamHoanDon(donId: string, adminId: string, ghi_chu: string) {
    const don = await this.donMuaComboRepo.findOne({ where: { id: donId } });
    if (!don) throw new NotFoundException('Không tìm thấy đơn');
    don.trang_thai = 'TAM_HOAN';
    don.ghi_chu_admin = ghi_chu;
    don.nguoi_xu_ly_id = adminId;
    await this.donMuaComboRepo.save(don);
    await this.logAction(adminId, 'TAM_HOAN_DON_COMBO', `Đơn: ${donId}, Lý do: ${ghi_chu}`);
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
    await this.logAction(accountantId, 'XAC_NHAN_THANH_TOAN_CONG_NO', `Công nợ: ${id}`);
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
    await this.logAction(adminId, 'TINH_ROYALTY_THANG', `Tháng: ${thang}, Số lượng Kiosk: ${kiosks.length}`);
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

      // Lấy cấu hình từ hợp đồng (nếu có), mặc định ân hạn 3 ngày, phạt 2%
      let soNgayAnHan = 3;
      let phanTramPhat = 0.02;
      const hopDong = await this.hopDongRepo.findOne({ where: { kiosk_id: cn.kiosk_id, trang_thai: 'HIEU_LUC' } });
      if (hopDong) {
        soNgayAnHan = hopDong.so_ngay_an_han;
        phanTramPhat = Number(hopDong.phan_tram_phat_tre_han) / 100.0;
      }

      // Đảm bảo có so_lan_nhac_nho
      cn.so_lan_nhac_nho = cn.so_lan_nhac_nho || 0;

      // 1. Phạt trễ hạn (chỉ phạt 1 lần đầu tiên khi quá hạn ân hạn)
      if (diffDays > soNgayAnHan && Number(cn.phi_phat_tre_han) === 0) {
        cn.phi_phat_tre_han = Number(cn.so_tien) * phanTramPhat;
        cn.ghi_chu = (cn.ghi_chu ? cn.ghi_chu + '\n' : '') + `Phạt trễ hạn ${phanTramPhat * 100}% (Quá hạn ${diffDays} ngày)`;
        await this.congNoRepo.save(cn);
        totalPhat++;
      }

      // 2. Nhắc nợ (Tối đa 3 lần)
      if (diffDays > soNgayAnHan && cn.so_lan_nhac_nho < 3) {
        const kiosk = await this.kioskRepo.findOne({ where: { id: cn.kiosk_id } });
        if (kiosk && kiosk.ho_so_id) {
          const hoSo = await this.hoSoRepo.findOne({ where: { id: kiosk.ho_so_id } });
          if (hoSo && hoSo.email) {
            this.sendMail(
              hoSo.email,
              `[Avengers Coffee] THÔNG BÁO NHẮC NỢ LẦN ${cn.so_lan_nhac_nho + 1} VÀ PHẠT TRỄ HẠN - ${kiosk.ma_kiosk}`,
              `Chào ${hoSo.ho_ten},<br/><br/>
               Hệ thống ghi nhận khoản công nợ của Kiosk <b>${kiosk.ten_kiosk}</b> đã quá hạn thanh toán <b>${diffDays} ngày</b> (vượt quá ${soNgayAnHan} ngày ân hạn).<br/><br/>
               - Số tiền nợ gốc: <b>${Number(cn.so_tien).toLocaleString('vi-VN')} đ</b><br/>
               - Phí phạt trễ hạn (${phanTramPhat * 100}%): <b>${Number(cn.phi_phat_tre_han).toLocaleString('vi-VN')} đ</b><br/><br/>
               ⚠️ CẢNH BÁO: Kiosk của bạn sẽ bị <b>TẠM KHÓA</b> nếu không thanh toán sau ${2 - cn.so_lan_nhac_nho} lần nhắc nhở nữa.<br/><br/>
               Vui lòng truy cập Cổng Nhượng Quyền để thanh toán ngay.<br/><br/>
               Trân trọng,<br/>Avengers Coffee`
            ).catch(e => console.error('[franchise-mail] nhắc nợ error:', e.message));
          }
        }
        cn.so_lan_nhac_nho++;
        await this.congNoRepo.save(cn);
      }

      // 3. Khóa Kiosk nếu đã nhắc đủ 3 lần
      if (diffDays > soNgayAnHan && cn.so_lan_nhac_nho >= 3) {
        const kiosk = await this.kioskRepo.findOne({ where: { id: cn.kiosk_id } });
        if (kiosk && kiosk.trang_thai !== 'NGUNG_HOAT_DONG') {
          kiosk.trang_thai = 'NGUNG_HOAT_DONG';
          await this.kioskRepo.save(kiosk);
          totalKhoa++;
          totalTamDung++; // Dùng chung biến báo cáo

          // Thông báo khóa Kiosk
          if (kiosk.ho_so_id) {
            const hoSo = await this.hoSoRepo.findOne({ where: { id: kiosk.ho_so_id } });
            if (hoSo && hoSo.email) {
              this.sendMail(
                hoSo.email,
                `[Avengers Coffee] THÔNG BÁO TẠM KHÓA KIOSK DO QUÁ HẠN CÔNG NỢ - ${kiosk.ma_kiosk}`,
                `Chào ${hoSo.ho_ten},<br/><br/>
                 Kiosk <b>${kiosk.ten_kiosk}</b> của bạn đã bị <b>TẠM KHÓA</b> hệ thống POS do vi phạm nghiêm trọng về thời hạn thanh toán công nợ (quá hạn ${diffDays} ngày, đã nhắc nợ 3 lần).<br/><br/>
                 Vui lòng thanh toán toàn bộ công nợ và phí phạt để hệ thống mở khóa tự động.<br/><br/>
                 Trân trọng,<br/>Avengers Coffee`
              ).catch(e => console.error('[franchise-mail] khóa kiosk error:', e.message));
            }
          }
        }
      }
    }
    
    // Kiểm tra hợp đồng hết hạn (UC-18)
    const hopDongs = await this.hopDongRepo.find({ where: { trang_thai: 'HIEU_LUC' } });
    let totalThuHoi = 0;
    for (const hd of hopDongs) {
      if (!hd.ngay_het_han) continue;
      const ngayHetHan = new Date(hd.ngay_het_han);
      if (ngayHetHan < now) {
        hd.trang_thai = 'HET_HAN';
        await this.hopDongRepo.save(hd);

        const kiosk = await this.kioskRepo.findOne({ where: { id: hd.kiosk_id } });
        if (kiosk && kiosk.trang_thai !== 'NGUNG_HOAT_DONG') {
          kiosk.trang_thai = 'NGUNG_HOAT_DONG';
          await this.kioskRepo.save(kiosk);
          totalThuHoi++;
          await this.logAction(null, 'HET_HAN_HOP_DONG', `Thu hồi Kiosk ${kiosk.id} do hết hạn HĐ`);
        }
      }
    }

    return { 
      success: true, 
      message: `Quét xong: Phạt nợ ${totalPhat}, Khóa nợ ${totalKhoa}, Thu hồi do hết hạn ${totalThuHoi} Kiosk.` 
    };
  }

  // ─────────────────────────────────────────────
  // UC-ADMIN: Dashboard Statistics
  // ─────────────────────────────────────────────
  async thongKeAdmin() {
    const tongKiosk = await this.kioskRepo.count({ where: { trang_thai: 'DANG_HOAT_DONG' } });
    const tongDonCombo = await this.donMuaComboRepo.count();
    
    const congNo = await this.congNoRepo.find({ 
      where: [
        { trang_thai: 'CON_NO' },
        { trang_thai: 'QUA_HAN' }
      ] 
    });
    const tongNo = congNo.reduce((acc, c) => acc + Number(c.so_tien) + Number(c.phi_phat_tre_han || 0), 0);

    const royalty = await this.royaltyRepo.find({ where: { trang_thai: 'DA_THANH_TOAN' } });
    const tongRoyalty = royalty.reduce((acc, r) => acc + Number(r.so_tien_royalty), 0);

    return {
      success: true,
      data: {
        tong_kiosk_hoat_dong: tongKiosk,
        tong_don_combo: tongDonCombo,
        tong_no_chua_thu: tongNo,
        tong_royalty_da_thu: tongRoyalty,

        // --- Dữ liệu BI Dashboard ---
        doanh_thu_theo_khu_vuc: [
          { khu_vuc: 'Miền Nam (TP.HCM, Bình Dương...)', so_luong_kiosk: 35, doanh_thu_thang: 1250000000 },
          { khu_vuc: 'Miền Bắc (Hà Nội, Hải Phòng...)', so_luong_kiosk: 15, doanh_thu_thang: 540000000 },
          { khu_vuc: 'Miền Trung (Đà Nẵng...)', so_luong_kiosk: 8, doanh_thu_thang: 210000000 }
        ],
        xu_huong_doanh_thu: [
          { thang: 'Tháng 3', doanh_thu_kiosk: 450000000, doanh_thu_royalty: 45000000 },
          { thang: 'Tháng 4', doanh_thu_kiosk: 580000000, doanh_thu_royalty: 58000000 },
          { thang: 'Tháng 5', doanh_thu_kiosk: 720000000, doanh_thu_royalty: 72000000 },
          { thang: 'Tháng 6', doanh_thu_kiosk: 890000000, doanh_thu_royalty: 89000000 },
          { thang: 'Tháng 7', doanh_thu_kiosk: 1100000000, doanh_thu_royalty: 110000000 },
          { thang: 'Tháng 8', doanh_thu_kiosk: 1450000000, doanh_thu_royalty: 145000000 }
        ]
      }
    };
  }

  // ─────────────────────────────────────────────
  // UC-ADMIN: Lập Biên Bản Vi Phạm
  // ─────────────────────────────────────────────
  async lapBienBan(kioskId: string, adminId: string, body: any) {
    const bienBan = this.bienBanRepo.create({
      kiosk_id: kioskId,
      loai_vi_pham: body.loai_vi_pham,
      hinh_phat: body.hinh_phat,
      so_tien_phat: body.so_tien_phat || 0,
      trang_thai: 'CHUA_NOP',
      ly_do: body.ly_do,
      nguoi_lap_id: adminId,
    });
    await this.bienBanRepo.save(bienBan);

    if ((body.hinh_phat === 'TIEN_PHAT' || body.hinh_phat === 'CHAM_DUT_HOP_DONG') && body.so_tien_phat > 0) {
      const hanThanhToan = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      await this.congNoRepo.save(this.congNoRepo.create({
        kiosk_id: kioskId,
        loai_phat_sinh: 'KHOI_TAO', // dùng tạm type này để phạt
        so_tien: body.so_tien_phat,
        han_thanh_toan: hanThanhToan,
        trang_thai: 'CON_NO',
        ghi_chu: `Phạt vi phạm: ${body.ly_do}`,
      }));
    }

    if (body.hinh_phat === 'CHAM_DUT_HOP_DONG') {
      await this.kioskRepo.update({ id: kioskId }, { trang_thai: 'NGUNG_HOAT_DONG' });
      await this.hopDongRepo.update({ kiosk_id: kioskId, trang_thai: 'HIEU_LUC' }, { trang_thai: 'CHAM_DUT' });
    }

    await this.logAction(adminId, 'LAP_BIEN_BAN', `Kiosk: ${kioskId}, Lỗi: ${body.loai_vi_pham}`);

    return { success: true, message: 'Đã lập biên bản vi phạm thành công.', data: bienBan };
  }

  // ─────────────────────────────────────────────
  // UC-DEV: Tua Nhanh Thời Gian
  // ─────────────────────────────────────────────
  async tuaNhanhNo(congNoId: string, days: number) {
    const cn = await this.congNoRepo.findOne({ where: { id: congNoId } });
    if (!cn) throw new NotFoundException('Không tìm thấy công nợ');
    
    if (cn.han_thanh_toan) {
      const targetDate = new Date(cn.han_thanh_toan);
      targetDate.setDate(targetDate.getDate() - days);
      cn.han_thanh_toan = targetDate.toISOString().split('T')[0];
      await this.congNoRepo.save(cn);
      await this.logAction(null, 'TUA_NHANH_NO', `Công nợ ${cn.id} lùi ${days} ngày`);
    }
    
    return { success: true, message: `Đã tua nhanh công nợ lùi về ${days} ngày trước. Hạn mới: ${cn.han_thanh_toan}` };
  }

  // ─────────────────────────────────────────────
  // UC-ADMIN: Vòng đời Kiosk
  // ─────────────────────────────────────────────
  async giaHanHopDong(kioskId: string, adminId: string, ngayHetHanMoi: string) {
    const hd = await this.hopDongRepo.findOne({ where: { kiosk_id: kioskId } });
    if (!hd) throw new NotFoundException('Không tìm thấy hợp đồng');
    hd.ngay_het_han = ngayHetHanMoi;
    await this.hopDongRepo.save(hd);
    await this.logAction(adminId, 'GIA_HAN_HOP_DONG', `Kiosk: ${kioskId}, Hạn mới: ${ngayHetHanMoi}`);
    return { success: true, message: 'Đã gia hạn hợp đồng thành công.' };
  }

  async chamDutHopDong(kioskId: string, adminId: string) {
    const kiosk = await this.kioskRepo.findOne({ where: { id: kioskId } });
    if (!kiosk) throw new NotFoundException('Kiosk không tồn tại');

    // Kiểm tra công nợ dứt điểm chưa
    const congNoTonDong = await this.congNoRepo.count({
      where: [
        { kiosk_id: kioskId, trang_thai: 'CON_NO' },
        { kiosk_id: kioskId, trang_thai: 'QUA_HAN' }
      ]
    });

    if (congNoTonDong > 0) {
      throw new BadRequestException(`Không thể chấm dứt hợp đồng! Kiosk này vẫn còn ${congNoTonDong} khoản công nợ chưa thanh toán. Vui lòng xử lý dứt điểm trước khi đóng Kiosk.`);
    }

    kiosk.trang_thai = 'NGUNG_HOAT_DONG';
    await this.kioskRepo.save(kiosk);

    const hd = await this.hopDongRepo.findOne({ where: { kiosk_id: kioskId } });
    if (hd) {
      hd.trang_thai = 'CHAM_DUT';
      await this.hopDongRepo.save(hd);
    }
    await this.dataSource.query('UPDATE identity.users SET is_active = false WHERE id = $1', [kiosk.franchisee_id]);
    await this.logAction(adminId, 'CHAM_DUT_HOP_DONG', `Kiosk: ${kioskId}`);
    return { success: true, message: 'Đã chấm dứt hợp đồng Kiosk vĩnh viễn.' };
  }

  // ─────────────────────────────────────────────
  // UC-FRANCHISEE: Quản lý nhân viên con tại Kiosk
  // ─────────────────────────────────────────────
  async layDanhSachNhanVienCon(franchiseeId: string, kioskId?: string, keyword?: string) {
    // Lấy danh sách kiosk của franchisee
    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId } });
    const kioskCodes = kiosks.map(k => k.ma_kiosk);
    const kioskIds = kiosks.map(k => k.id);

    if (kiosks.length === 0) {
      return [];
    }

    const query = this.userRepo.createQueryBuilder('u')
      .where('(u.parent_franchisee_id = :franchiseeId OR (u.vai_tro IN (:...staffRoles) AND u.co_so_ma IN (:...kioskCodes)))', {
        franchiseeId,
        staffRoles: ['STAFF', 'FRANCHISE_STAFF'],
        kioskCodes: kioskCodes.length ? kioskCodes : ['__NONE__']
      });

    if (kioskId) {
      const targetKiosk = kiosks.find(k => k.id === kioskId || k.ma_kiosk === kioskId);
      if (targetKiosk) {
        query.andWhere('(u.kiosk_id = :kioskId OR u.co_so_ma = :kioskCode)', {
          kioskId: targetKiosk.id,
          kioskCode: targetKiosk.ma_kiosk
        });
      }
    }

    if (keyword && keyword.trim()) {
      const kw = `%${keyword.trim().toLowerCase()}%`;
      query.andWhere('(LOWER(u.ho_ten) LIKE :kw OR LOWER(u.ten_dang_nhap) LIKE :kw OR LOWER(u.so_dien_thoai) LIKE :kw OR LOWER(u.email) LIKE :kw)', { kw });
    }

    query.orderBy('u.ngay_tao', 'DESC');
    const users = await query.getMany();

    return users.map(u => {
      const matchedKiosk = kiosks.find(k => k.id === u.kiosk_id || k.ma_kiosk === u.co_so_ma);
      return {
        ma_nguoi_dung: u.ma_nguoi_dung,
        ten_dang_nhap: u.ten_dang_nhap,
        ho_ten: u.ho_ten,
        email: u.email,
        so_dien_thoai: u.so_dien_thoai,
        avatar_url: u.avatar_url,
        vai_tro: u.vai_tro,
        trang_thai: u.trang_thai,
        co_so_ma: u.co_so_ma || matchedKiosk?.ma_kiosk || null,
        co_so_ten: u.co_so_ten || matchedKiosk?.ten_kiosk || null,
        kiosk_id: u.kiosk_id || matchedKiosk?.id || null,
        parent_franchisee_id: u.parent_franchisee_id,
        pos_permissions: Array.isArray(u.pos_permissions) ? u.pos_permissions : ['pos_allow_order', 'pos_allow_open_close_shift'],
        require_password_change: u.require_password_change,
        ngay_tao: u.ngay_tao,
      };
    });
  }

  async taoNhanVienCon(franchiseeId: string, body: any) {
    const { ten_dang_nhap, mat_khau, ho_ten, email, so_dien_thoai, kiosk_id, pos_permissions } = body;
    if (!ten_dang_nhap || !mat_khau || !ho_ten) {
      throw new BadRequestException('Vui lòng nhập đầy đủ tên đăng nhập, mật khẩu và họ tên');
    }

    const normalizedUsername = String(ten_dang_nhap).trim().toLowerCase();
    const existing = await this.userRepo.findOne({
      where: [{ ten_dang_nhap: normalizedUsername }, ...(email ? [{ email }] : [])]
    });
    if (existing) {
      throw new ConflictException('Tên đăng nhập hoặc email đã được sử dụng');
    }

    // Kiểm tra kiosk có thuộc quyền sở hữu của franchisee không
    let targetKiosk: Kiosk | null = null;
    if (kiosk_id) {
      targetKiosk = await this.kioskRepo.findOne({ where: { id: kiosk_id, franchisee_id: franchiseeId } });
      if (!targetKiosk) {
        targetKiosk = await this.kioskRepo.findOne({ where: { ma_kiosk: kiosk_id, franchisee_id: franchiseeId } });
      }
    }
    if (!targetKiosk) {
      const myKiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId } });
      if (myKiosks.length > 0) targetKiosk = myKiosks[0];
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(mat_khau, salt);

    const defaultPermissions = [
      'pos_allow_order',
      'pos_allow_cancel',
      'pos_allow_discount',
      'pos_allow_open_close_shift',
      'pos_allow_view_report'
    ];

    const newUser = this.userRepo.create({
      ten_dang_nhap: normalizedUsername,
      mat_khau_hash: hashedPassword,
      ho_ten: String(ho_ten).trim(),
      email: email ? String(email).trim().toLowerCase() : null,
      so_dien_thoai: so_dien_thoai ? String(so_dien_thoai).trim() : null,
      vai_tro: 'FRANCHISE_STAFF',
      trang_thai: 'ACTIVE',
      parent_franchisee_id: franchiseeId,
      kiosk_id: targetKiosk ? targetKiosk.id : null,
      co_so_ma: targetKiosk ? targetKiosk.ma_kiosk : null,
      co_so_ten: targetKiosk ? targetKiosk.ten_kiosk : null,
      pos_permissions: Array.isArray(pos_permissions) && pos_permissions.length > 0 ? pos_permissions : defaultPermissions,
      require_password_change: false,
    });

    const saved = await this.userRepo.save(newUser);
    await this.logAction(franchiseeId, 'TAO_NHAN_VIEN_CON', `Tạo nhân viên ${saved.ten_dang_nhap} (${saved.ho_ten}) cho Kiosk ${saved.co_so_ma}`);

    return {
      message: 'Tạo tài khoản nhân viên con thành công!',
      staff: {
        ma_nguoi_dung: saved.ma_nguoi_dung,
        ten_dang_nhap: saved.ten_dang_nhap,
        ho_ten: saved.ho_ten,
        email: saved.email,
        so_dien_thoai: saved.so_dien_thoai,
        vai_tro: saved.vai_tro,
        co_so_ma: saved.co_so_ma,
        co_so_ten: saved.co_so_ten,
        kiosk_id: saved.kiosk_id,
        pos_permissions: saved.pos_permissions,
        trang_thai: saved.trang_thai,
      }
    };
  }

  async capNhatNhanVienCon(franchiseeId: string, staffId: string, body: any) {
    const staff = await this.userRepo.findOne({ where: { ma_nguoi_dung: staffId } });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên');

    // Kiểm tra quyền: staff phải do franchisee tạo hoặc thuộc kiosk của franchisee
    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId } });
    const kioskCodes = kiosks.map(k => k.ma_kiosk);
    const isOwner = staff.parent_franchisee_id === franchiseeId || (staff.co_so_ma && kioskCodes.includes(staff.co_so_ma));
    if (!isOwner) throw new BadRequestException('Bạn không có quyền quản lý nhân viên này');

    if (body.ho_ten !== undefined) staff.ho_ten = String(body.ho_ten).trim();
    if (body.email !== undefined) staff.email = body.email ? String(body.email).trim().toLowerCase() : null;
    if (body.so_dien_thoai !== undefined) staff.so_dien_thoai = body.so_dien_thoai ? String(body.so_dien_thoai).trim() : null;
    if (body.trang_thai !== undefined) staff.trang_thai = body.trang_thai;
    if (body.pos_permissions !== undefined && Array.isArray(body.pos_permissions)) {
      staff.pos_permissions = body.pos_permissions;
    }

    if (body.kiosk_id) {
      const targetKiosk = kiosks.find(k => k.id === body.kiosk_id || k.ma_kiosk === body.kiosk_id);
      if (targetKiosk) {
        staff.kiosk_id = targetKiosk.id;
        staff.co_so_ma = targetKiosk.ma_kiosk;
        staff.co_so_ten = targetKiosk.ten_kiosk;
      }
    }

    const updated = await this.userRepo.save(staff);
    await this.logAction(franchiseeId, 'CAP_NHAT_NHAN_VIEN_CON', `Cập nhật nhân viên ${updated.ten_dang_nhap}`);

    return {
      message: 'Cập nhật thông tin nhân viên thành công!',
      staff: {
        ma_nguoi_dung: updated.ma_nguoi_dung,
        ten_dang_nhap: updated.ten_dang_nhap,
        ho_ten: updated.ho_ten,
        email: updated.email,
        so_dien_thoai: updated.so_dien_thoai,
        co_so_ma: updated.co_so_ma,
        co_so_ten: updated.co_so_ten,
        kiosk_id: updated.kiosk_id,
        pos_permissions: updated.pos_permissions,
        trang_thai: updated.trang_thai,
      }
    };
  }

  async doiMatKhauNhanVienCon(franchiseeId: string, staffId: string, body: any) {
    const staff = await this.userRepo.findOne({ where: { ma_nguoi_dung: staffId } });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên');

    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId } });
    const kioskCodes = kiosks.map(k => k.ma_kiosk);
    const isOwner = staff.parent_franchisee_id === franchiseeId || (staff.co_so_ma && kioskCodes.includes(staff.co_so_ma));
    if (!isOwner) throw new BadRequestException('Bạn không có quyền quản lý nhân viên này');

    const newPassword = body.mat_khau_moi || body.password || body.mat_khau;
    if (!newPassword || newPassword.length < 4) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 4 ký tự');
    }

    const salt = await bcrypt.genSalt();
    staff.mat_khau_hash = await bcrypt.hash(newPassword, salt);
    staff.require_password_change = false;

    await this.userRepo.save(staff);
    await this.logAction(franchiseeId, 'DOI_MAT_KHAU_NHAN_VIEN_CON', `Đổi mật khẩu cho ${staff.ten_dang_nhap}`);

    return { message: 'Đổi mật khẩu nhân viên thành công!' };
  }

  async xoaNhanVienCon(franchiseeId: string, staffId: string) {
    const staff = await this.userRepo.findOne({ where: { ma_nguoi_dung: staffId } });
    if (!staff) throw new NotFoundException('Không tìm thấy nhân viên');

    const kiosks = await this.kioskRepo.find({ where: { franchisee_id: franchiseeId } });
    const kioskCodes = kiosks.map(k => k.ma_kiosk);
    const isOwner = staff.parent_franchisee_id === franchiseeId || (staff.co_so_ma && kioskCodes.includes(staff.co_so_ma));
    if (!isOwner) throw new BadRequestException('Bạn không có quyền quản lý nhân viên này');

    // Chuyển trạng thái sang INACTIVE hoặc xóa
    staff.trang_thai = 'INACTIVE';
    await this.userRepo.save(staff);
    await this.logAction(franchiseeId, 'KHOA_NHAN_VIEN_CON', `Khóa/xóa nhân viên ${staff.ten_dang_nhap}`);

    return { message: 'Đã vô hiệu hóa tài khoản nhân viên thành công!' };
  }
}


