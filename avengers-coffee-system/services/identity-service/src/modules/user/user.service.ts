import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from './branch.entity';
import { DeliveryAddress } from './delivery-address.entity';
import { Promotion } from './promotion.entity';
import { PromotionUsage } from './promotion-usage.entity';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt, randomUUID } from 'crypto';
import nodemailer, { type Transporter } from 'nodemailer';

const RESET_CODE_EXPIRE_MINUTES = 10;
const RESET_CODE_COOLDOWN_SECONDS = 60;
const RESET_CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class UserService {
  private mailTransporter: Transporter | null = null;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(DeliveryAddress)
    private deliveryAddressRepo: Repository<DeliveryAddress>,
    @InjectRepository(Branch)
    private branchRepo: Repository<Branch>,
    @InjectRepository(Promotion)
    private promotionRepo: Repository<Promotion>,
    @InjectRepository(PromotionUsage)
    private promotionUsageRepo: Repository<PromotionUsage>,
  ) {}

  private getResetCodeExpireMs() {
    return RESET_CODE_EXPIRE_MINUTES * 60 * 1000;
  }

  private getResetCodeCooldownMs() {
    return RESET_CODE_COOLDOWN_SECONDS * 1000;
  }

  private hashResetCode(code: string) {
    return createHash('sha256').update(String(code || '')).digest('hex');
  }

  private generateResetCode() {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private getOrCreateTransporter() {
    if (this.mailTransporter) {
      return this.mailTransporter;
    }

    const host = String(process.env.SMTP_HOST || '').trim();
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    if (!host || !user || !pass) {
      return null;
    }

    const port = Number(process.env.SMTP_PORT || 587);
    this.mailTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    return this.mailTransporter;
  }

  private async guiMailDatLaiMatKhau(email: string, fullName: string, code: string) {
    const transporter = this.getOrCreateTransporter();
    const appName = String(process.env.APP_NAME || 'The Avengers House').trim();
    const fromEmail = String(process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@avengershouse.local').trim();

    if (!transporter) {
      console.warn(`[forgot-password][DEV] OTP for ${email}: ${code}`);
      return;
    }

    const html = `
      <div style="font-family:Arial,sans-serif;color:#222;line-height:1.6;max-width:560px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:16px;">
        <h2 style="margin:0 0 12px;color:#d97706;">Đặt lại mật khẩu</h2>
        <p style="margin:0 0 8px;">Xin chào ${fullName || 'bạn'},</p>
        <p style="margin:0 0 16px;">Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản tại ${appName}.</p>
        <div style="font-size:30px;font-weight:700;letter-spacing:8px;background:#fff7ed;color:#9a3412;border-radius:12px;padding:12px 16px;text-align:center;margin:0 0 16px;">
          ${code}
        </div>
        <p style="margin:0 0 8px;">Mã có hiệu lực trong ${RESET_CODE_EXPIRE_MINUTES} phút.</p>
        <p style="margin:0;color:#6b7280;">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p>
      </div>
    `;

    await transporter.sendMail({
      from: `${appName} <${fromEmail}>`,
      to: email,
      subject: `[${appName}] Ma OTP dat lai mat khau`,
      text: `Ma OTP dat lai mat khau cua ban la ${code}. Ma co hieu luc trong ${RESET_CODE_EXPIRE_MINUTES} phut.`,
      html,
    });
  }

  private taoAccessToken(user: User) {
    return this.jwtService.signAsync({
      sub: user.ma_nguoi_dung,
      role: user.vai_tro || 'CUSTOMER',
      username: user.ten_dang_nhap || null,
      email: user.email || null,
      branchCode: user.co_so_ma || null,
      branchName: user.co_so_ten || null,
    });
  }

  private normalizeBranchCode(branchCode?: string) {
    const code = String(branchCode || '').trim().toUpperCase();
    if (!code) return null;
    return /^[A-Z0-9_]+$/.test(code) ? code : null;
  }

  private async timChiNhanhTheoMa(branchCode?: string | null) {
    const code = this.normalizeBranchCode(branchCode || undefined);
    if (!code) return null;
    return this.branchRepo.findOne({ where: { ma_chi_nhanh: code } });
  }

  private async resolveBranchInfo(branchCode?: string | null) {
    const branch = await this.timChiNhanhTheoMa(branchCode);
    if (!branch || branch.trang_thai !== 'ACTIVE') {
      return null;
    }
    return {
      code: branch.ma_chi_nhanh,
      name: branch.ten_chi_nhanh,
    };
  }

  private mapBranchItem(branch: Branch) {
    return {
      ma_chi_nhanh: branch.ma_chi_nhanh,
      ten_chi_nhanh: branch.ten_chi_nhanh,
      dia_chi: branch.dia_chi,
      thanh_pho: branch.thanh_pho,
      quan_huyen: branch.quan_huyen,
      so_dien_thoai: branch.so_dien_thoai,
      hinh_anh_url: branch.hinh_anh_url,
      gio_mo_cua: branch.gio_mo_cua,
      gio_dong_cua: branch.gio_dong_cua,
      map_url: branch.map_url,
      trang_thai: branch.trang_thai,
      ngay_tao: branch.ngay_tao,
      ngay_cap_nhat: branch.ngay_cap_nhat,
    };
  }

  private normalizeTimeValue(value?: string | null) {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
      throw new BadRequestException('Dinh dang gio khong hop le, can HH:MM');
    }
    return normalized;
  }

  async register(data: any) {
    const { email, password, hoTen } = data;
    
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new BadRequestException('Email này đã tồn tại rồi bác ơi!');

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = this.userRepo.create({
      ma_nguoi_dung: randomUUID(),
      email,
      ten_dang_nhap: email, 
      mat_khau_hash: hashedPassword,
      ho_ten: hoTen,
      vai_tro: 'CUSTOMER',
      co_so_ma: null,
      co_so_ten: null,
    });

    const savedUser = await this.userRepo.save(newUser);
    return { message: 'Đăng ký thành công!', userId: savedUser.ma_nguoi_dung };
  }

  async login(data: any) {
    const identifier = String(data?.email || data?.tai_khoan || data?.tenDangNhap || '').trim();
    const password = String(data?.password || data?.mat_khau || '');

    if (!identifier || !password) {
      throw new BadRequestException('Vui lòng nhập tài khoản và mật khẩu');
    }

    const user = await this.userRepo.findOne({
      where: [{ email: identifier }, { ten_dang_nhap: identifier }],
    });

    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại');

    const isMatch = await bcrypt.compare(password, user.mat_khau_hash);
    if (!isMatch) throw new UnauthorizedException('Sai mật khẩu');
    if (user.trang_thai !== 'ACTIVE') throw new UnauthorizedException('Tai khoan da bi vo hieu hoa');

    // Trả về đúng format để Frontend AuthModal.jsx của bác đọc được
    const accessToken = await this.taoAccessToken(user);
    return {
      accessToken,
      user: {
        ma_nguoi_dung: user.ma_nguoi_dung,
        hoTen: user.ho_ten,
        tenDangNhap: user.ten_dang_nhap,
        email: user.email,
        vaiTro: user.vai_tro || 'STAFF',
        coSoMa: user.co_so_ma,
        coSoTen: user.co_so_ten,
        co_so_ma: user.co_so_ma,
        co_so_ten: user.co_so_ten,
      }
    };
  }

  async requestForgotPassword(payload: { email?: string; tai_khoan?: string }) {
    const identifier = String(payload?.email || payload?.tai_khoan || '').trim();
    if (!identifier) {
      throw new BadRequestException('Vui lòng nhập email hoặc tài khoản');
    }

    const normalizedIdentifier = identifier.toLowerCase();
    const user = await this.userRepo.findOne({
      where: [{ email: normalizedIdentifier }, { ten_dang_nhap: identifier }, { ten_dang_nhap: normalizedIdentifier }],
    });

    if (!user || !user.email) {
      return {
        message: 'Nếu tài khoản tồn tại, mã xác thực đã được gửi về email của bạn.',
      };
    }

    const now = Date.now();
    if (user.reset_password_requested_at) {
      const elapsed = now - new Date(user.reset_password_requested_at).getTime();
      const cooldownMs = this.getResetCodeCooldownMs();
      if (elapsed < cooldownMs) {
        const secondsLeft = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
        throw new BadRequestException(`Vui lòng chờ ${secondsLeft}s trước khi yêu cầu lại mã.`);
      }
    }

    const code = this.generateResetCode();
    user.reset_password_code_hash = this.hashResetCode(code);
    user.reset_password_code_expires_at = new Date(now + this.getResetCodeExpireMs());
    user.reset_password_requested_at = new Date(now);
    user.reset_password_attempts = 0;
    await this.userRepo.save(user);

    await this.guiMailDatLaiMatKhau(user.email, user.ho_ten || user.ten_dang_nhap || 'bạn', code);

    return {
      message: 'Nếu tài khoản tồn tại, mã xác thực đã được gửi về email của bạn.',
      expires_in_minutes: RESET_CODE_EXPIRE_MINUTES,
    };
  }

  async resetPasswordByOtp(payload: {
    email?: string;
    tai_khoan?: string;
    otp?: string;
    newPassword?: string;
  }) {
    const identifier = String(payload?.email || payload?.tai_khoan || '').trim();
    const otp = String(payload?.otp || '').trim();
    const newPassword = String(payload?.newPassword || '').trim();

    if (!identifier || !otp || !newPassword) {
      throw new BadRequestException('Thiếu thông tin đặt lại mật khẩu');
    }
    if (!/^\d{6}$/.test(otp)) {
      throw new BadRequestException('Mã OTP phải gồm 6 chữ số');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải từ 6 ký tự trở lên');
    }

    const normalizedIdentifier = identifier.toLowerCase();
    const user = await this.userRepo.findOne({
      where: [{ email: normalizedIdentifier }, { ten_dang_nhap: identifier }, { ten_dang_nhap: normalizedIdentifier }],
    });

    if (!user || !user.reset_password_code_hash || !user.reset_password_code_expires_at) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    const now = new Date();
    if (new Date(user.reset_password_code_expires_at).getTime() < now.getTime()) {
      user.reset_password_code_hash = null;
      user.reset_password_code_expires_at = null;
      user.reset_password_requested_at = null;
      user.reset_password_attempts = 0;
      await this.userRepo.save(user);
      throw new BadRequestException('Mã OTP đã hết hạn, vui lòng yêu cầu mã mới');
    }

    if (user.reset_password_attempts >= RESET_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException('Bạn đã nhập sai OTP quá nhiều lần, vui lòng yêu cầu mã mới');
    }

    const otpHash = this.hashResetCode(otp);
    if (otpHash !== user.reset_password_code_hash) {
      user.reset_password_attempts += 1;
      if (user.reset_password_attempts >= RESET_CODE_MAX_ATTEMPTS) {
        user.reset_password_code_hash = null;
        user.reset_password_code_expires_at = null;
        user.reset_password_requested_at = null;
      }
      await this.userRepo.save(user);
      throw new BadRequestException('Mã OTP không chính xác');
    }

    const salt = await bcrypt.genSalt();
    user.mat_khau_hash = await bcrypt.hash(newPassword, salt);
    user.reset_password_code_hash = null;
    user.reset_password_code_expires_at = null;
    user.reset_password_requested_at = null;
    user.reset_password_attempts = 0;
    await this.userRepo.save(user);

    return {
      message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    };
  }

  async layDanhSachNhanSu(role?: string, branchCode?: string) {
    const query = this.userRepo
      .createQueryBuilder('user')
      .where('user.vai_tro IN (:...roles)', { roles: ['STAFF', 'MANAGER'] })
      .andWhere('user.trang_thai = :status', { status: 'ACTIVE' })

    if (role?.trim()) {
      query.andWhere('user.vai_tro = :role', { role: role.trim().toUpperCase() })
    }

    if (branchCode?.trim()) {
      query.andWhere('user.co_so_ma = :branchCode', { branchCode: branchCode.trim().toUpperCase() })
    }

    const rows = await query
      .orderBy('user.vai_tro', 'ASC')
      .addOrderBy('user.ho_ten', 'ASC')
      .addOrderBy('user.ten_dang_nhap', 'ASC')
      .getMany()

    return {
      total: rows.length,
      items: rows.map((user) => ({
        ma_nguoi_dung: user.ma_nguoi_dung,
        ten_dang_nhap: user.ten_dang_nhap,
        ho_ten: user.ho_ten,
        email: user.email,
        vai_tro: user.vai_tro,
        co_so_ma: user.co_so_ma,
        co_so_ten: user.co_so_ten,
      })),
    }
  }

  async layDanhSachTaiKhoanHeThong(input: { role?: string; branchCode?: string; keyword?: string }) {
    const query = this.userRepo.createQueryBuilder('user');

    if (input.role?.trim()) {
      query.andWhere('user.vai_tro = :role', { role: input.role.trim().toUpperCase() });
    }

    if (input.branchCode?.trim()) {
      query.andWhere('user.co_so_ma = :branchCode', { branchCode: input.branchCode.trim().toUpperCase() });
    }

    if (input.keyword?.trim()) {
      const q = `%${input.keyword.trim()}%`;
      query.andWhere('(user.ten_dang_nhap ILIKE :q OR user.ho_ten ILIKE :q OR user.email ILIKE :q)', { q });
    }

    const rows = await query
      .orderBy('user.ngay_tao', 'DESC')
      .getMany();

    return {
      total: rows.length,
      items: rows.map((user) => ({
        ma_nguoi_dung: user.ma_nguoi_dung,
        ten_dang_nhap: user.ten_dang_nhap,
        ho_ten: user.ho_ten,
        email: user.email,
        vai_tro: user.vai_tro,
        trang_thai: user.trang_thai,
        co_so_ma: user.co_so_ma,
        co_so_ten: user.co_so_ten,
        ngay_tao: user.ngay_tao,
      })),
    };
  }

  async taoTaiKhoanHeThong(payload: {
    ten_dang_nhap?: string;
    mat_khau?: string;
    ho_ten?: string;
    vai_tro?: 'STAFF' | 'MANAGER' | 'CUSTOMER';
    co_so_ma?: string;
    email?: string;
  }) {
    const username = String(payload.ten_dang_nhap || '').trim();
    const password = String(payload.mat_khau || '');
    const fullName = String(payload.ho_ten || '').trim();
    const role = String(payload.vai_tro || '').trim().toUpperCase();
    const branchCode = String(payload.co_so_ma || '').trim();
    const branchInfo = branchCode ? await this.resolveBranchInfo(branchCode) : null;

    if (!username || !password || !fullName || !['STAFF', 'MANAGER', 'CUSTOMER'].includes(role)) {
      throw new BadRequestException('Du lieu tao tai khoan khong hop le');
    }
    if (password.length < 6) {
      throw new BadRequestException('Mat khau phai tu 6 ky tu tro len');
    }
    if (branchCode && !branchInfo) {
      throw new BadRequestException('co_so_ma khong hop le');
    }
    if (role !== 'CUSTOMER' && !branchInfo) {
      throw new BadRequestException('Vui long chon chi nhanh hop le');
    }

    const existed = await this.userRepo.findOne({ where: [{ ten_dang_nhap: username }, { email: username }, { email: payload.email || '' }] });
    if (existed) {
      throw new BadRequestException('Ten dang nhap hoac email da ton tai');
    }

    const salt = await bcrypt.genSalt();
    const mat_khau_hash = await bcrypt.hash(password, salt);

    const created = this.userRepo.create({
      ma_nguoi_dung: randomUUID(),
      ten_dang_nhap: username,
      email: payload.email?.trim() || username,
      mat_khau_hash,
      ho_ten: fullName,
      vai_tro: role,
      trang_thai: 'ACTIVE',
      co_so_ma: branchInfo?.code || null,
      co_so_ten: branchInfo?.name || null,
    });

    const saved = await this.userRepo.save(created);
    return {
      message: 'Tao tai khoan thanh cong',
      item: {
        ma_nguoi_dung: saved.ma_nguoi_dung,
        ten_dang_nhap: saved.ten_dang_nhap,
        ho_ten: saved.ho_ten,
        email: saved.email,
        vai_tro: saved.vai_tro,
        trang_thai: saved.trang_thai,
        co_so_ma: saved.co_so_ma,
        co_so_ten: saved.co_so_ten,
      },
    };
  }

  async capNhatTaiKhoanHeThong(
    userId: string,
    payload: {
      ten_dang_nhap?: string;
      mat_khau?: string;
      ho_ten?: string;
      vai_tro?: 'STAFF' | 'MANAGER' | 'CUSTOMER';
      co_so_ma?: string;
      trang_thai?: 'ACTIVE' | 'INACTIVE';
      email?: string;
    },
  ) {
    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: userId } });
    if (!user) {
      throw new NotFoundException('Khong tim thay tai khoan');
    }

    if (user.vai_tro === 'ADMIN' && (payload.vai_tro || payload.trang_thai === 'INACTIVE')) {
      throw new BadRequestException('Khong the doi role hoac vo hieu hoa tai khoan ADMIN');
    }

    if (payload.ten_dang_nhap !== undefined) {
      const username = payload.ten_dang_nhap.trim();
      if (!username) throw new BadRequestException('ten_dang_nhap khong hop le');
      const existed = await this.userRepo.findOne({ where: { ten_dang_nhap: username } });
      if (existed && existed.ma_nguoi_dung !== userId) throw new BadRequestException('Ten dang nhap da ton tai');
      user.ten_dang_nhap = username;
    }

    if (payload.email !== undefined) {
      const email = payload.email?.trim() || null;
      if (email) {
        const existed = await this.userRepo.findOne({ where: { email } });
        if (existed && existed.ma_nguoi_dung !== userId) throw new BadRequestException('Email da ton tai');
      }
      user.email = email;
    }

    if (payload.ho_ten !== undefined) {
      const fullName = payload.ho_ten.trim();
      if (!fullName) throw new BadRequestException('ho_ten khong hop le');
      user.ho_ten = fullName;
    }

    if (payload.vai_tro !== undefined) {
      const role = String(payload.vai_tro).toUpperCase();
      if (!['STAFF', 'MANAGER', 'CUSTOMER'].includes(role)) {
        throw new BadRequestException('Chi cho phep role STAFF, MANAGER hoac CUSTOMER');
      }
      user.vai_tro = role;
    }

    if (payload.trang_thai !== undefined) {
      if (!['ACTIVE', 'INACTIVE'].includes(payload.trang_thai)) {
        throw new BadRequestException('trang_thai khong hop le');
      }
      user.trang_thai = payload.trang_thai;
    }

    if (payload.co_so_ma !== undefined) {
      const branchCode = String(payload.co_so_ma || '').trim();
      if (!branchCode) {
        if (String(user.vai_tro || '').toUpperCase() === 'CUSTOMER') {
          user.co_so_ma = null;
          user.co_so_ten = null;
        } else {
          throw new BadRequestException('co_so_ma khong hop le');
        }
      } else {
        const branchInfo = await this.resolveBranchInfo(branchCode);
        if (!branchInfo) {
          throw new BadRequestException('co_so_ma khong hop le');
        }
        user.co_so_ma = branchInfo.code;
        user.co_so_ten = branchInfo.name;
      }
    }

    if (payload.mat_khau !== undefined) {
      const password = String(payload.mat_khau || '');
      if (password.length < 6) throw new BadRequestException('Mat khau phai tu 6 ky tu tro len');
      const salt = await bcrypt.genSalt();
      user.mat_khau_hash = await bcrypt.hash(password, salt);
    }

    const saved = await this.userRepo.save(user);
    return {
      message: 'Cap nhat tai khoan thanh cong',
      item: {
        ma_nguoi_dung: saved.ma_nguoi_dung,
        ten_dang_nhap: saved.ten_dang_nhap,
        ho_ten: saved.ho_ten,
        email: saved.email,
        vai_tro: saved.vai_tro,
        trang_thai: saved.trang_thai,
        co_so_ma: saved.co_so_ma,
        co_so_ten: saved.co_so_ten,
      },
    };
  }

  async xoaTaiKhoanHeThong(userId: string) {
    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: userId } });
    if (!user) {
      throw new NotFoundException('Khong tim thay tai khoan');
    }
    if (user.vai_tro === 'ADMIN') {
      throw new BadRequestException('Khong the xoa tai khoan ADMIN he thong');
    }

    await this.userRepo.remove(user);
    return { message: 'Xoa tai khoan thanh cong' };
  }

  async layThongKeHeThong() {
    const rows = await this.userRepo.find();

    const byRole: Record<string, number> = { ADMIN: 0, MANAGER: 0, STAFF: 0, CUSTOMER: 0 };
    const byBranch: Record<string, number> = {};
    let activeUsers = 0;

    rows.forEach((user) => {
      const role = String(user.vai_tro || 'CUSTOMER').toUpperCase();
      byRole[role] = (byRole[role] || 0) + 1;
      if (user.trang_thai === 'ACTIVE') activeUsers += 1;

      if (user.co_so_ma) {
        byBranch[user.co_so_ma] = (byBranch[user.co_so_ma] || 0) + 1;
      }
    });

    return {
      total_users: rows.length,
      active_users: activeUsers,
      inactive_users: Math.max(rows.length - activeUsers, 0),
      by_role: byRole,
      by_branch: byBranch,
    };
  }

  async layDanhSachChiNhanhAdmin() {
    const rows = await this.branchRepo.find({ order: { ngay_tao: 'DESC', ma_chi_nhanh: 'DESC' } });

    const usageRows = await this.userRepo
      .createQueryBuilder('user')
      .select('user.co_so_ma', 'branchCode')
      .addSelect('COUNT(*)', 'count')
      .where('user.co_so_ma IS NOT NULL')
      .groupBy('user.co_so_ma')
      .getRawMany<{ branchCode: string; count: string }>();

    const usageMap = usageRows.reduce<Record<string, number>>((acc, row) => {
      if (row.branchCode) {
        acc[row.branchCode] = Number(row.count || 0);
      }
      return acc;
    }, {});

    return {
      total: rows.length,
      items: rows.map((branch) => ({
        ...this.mapBranchItem(branch),
        account_count: usageMap[branch.ma_chi_nhanh] || 0,
      })),
    };
  }

  async layDanhSachChiNhanhCongKhai() {
    const rows = await this.branchRepo.find({
      where: { trang_thai: 'ACTIVE' },
      order: { ngay_tao: 'ASC', ma_chi_nhanh: 'ASC' },
    });

    return {
      total: rows.length,
      items: rows.map((branch) => this.mapBranchItem(branch)),
    };
  }

  async taoChiNhanhAdmin(payload: {
    ma_chi_nhanh?: string;
    ten_chi_nhanh?: string;
    dia_chi?: string;
    thanh_pho?: string;
    quan_huyen?: string;
    so_dien_thoai?: string;
    hinh_anh_url?: string;
    gio_mo_cua?: string;
    gio_dong_cua?: string;
    map_url?: string;
    trang_thai?: 'ACTIVE' | 'INACTIVE';
  }) {
    const branchCode = this.normalizeBranchCode(payload.ma_chi_nhanh);
    const branchName = String(payload.ten_chi_nhanh || '').trim();
    const phone = payload.so_dien_thoai?.trim() || null;
    const address = payload.dia_chi?.trim() || null;
    const city = payload.thanh_pho?.trim() || null;
    const district = payload.quan_huyen?.trim() || null;
    const imageUrl = payload.hinh_anh_url?.trim() || null;
    const openTime = this.normalizeTimeValue(payload.gio_mo_cua);
    const closeTime = this.normalizeTimeValue(payload.gio_dong_cua);
    const mapUrl = payload.map_url?.trim() || null;
    const status = String(payload.trang_thai || 'ACTIVE').toUpperCase();

    if (!branchCode) {
      throw new BadRequestException('ma_chi_nhanh khong hop le. Chi duoc dung A-Z, 0-9, _');
    }
    if (!branchName) {
      throw new BadRequestException('ten_chi_nhanh la bat buoc');
    }
    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      throw new BadRequestException('trang_thai khong hop le');
    }

    const existedCode = await this.branchRepo.findOne({ where: { ma_chi_nhanh: branchCode } });
    if (existedCode) {
      throw new BadRequestException('Ma chi nhanh da ton tai');
    }

    const existedName = await this.branchRepo.findOne({ where: { ten_chi_nhanh: branchName } });
    if (existedName) {
      throw new BadRequestException('Ten chi nhanh da ton tai');
    }

    const created = this.branchRepo.create({
      ma_chi_nhanh: branchCode,
      ten_chi_nhanh: branchName,
      dia_chi: address,
      thanh_pho: city,
      quan_huyen: district,
      so_dien_thoai: phone,
      hinh_anh_url: imageUrl,
      gio_mo_cua: openTime,
      gio_dong_cua: closeTime,
      map_url: mapUrl,
      trang_thai: status,
    });

    const saved = await this.branchRepo.save(created);
    return {
      message: 'Tao chi nhanh thanh cong',
      item: this.mapBranchItem(saved),
    };
  }

  async capNhatChiNhanhAdmin(
    branchCode: string,
    payload: {
      ten_chi_nhanh?: string;
      dia_chi?: string;
      thanh_pho?: string;
      quan_huyen?: string;
      so_dien_thoai?: string;
      hinh_anh_url?: string;
      gio_mo_cua?: string;
      gio_dong_cua?: string;
      map_url?: string;
      trang_thai?: 'ACTIVE' | 'INACTIVE';
    },
  ) {
    const normalizedCode = this.normalizeBranchCode(branchCode);
    if (!normalizedCode) {
      throw new BadRequestException('branchCode khong hop le');
    }

    const branch = await this.branchRepo.findOne({ where: { ma_chi_nhanh: normalizedCode } });
    if (!branch) {
      throw new NotFoundException('Khong tim thay chi nhanh');
    }

    if (payload.ten_chi_nhanh !== undefined) {
      const branchName = payload.ten_chi_nhanh.trim();
      if (!branchName) {
        throw new BadRequestException('ten_chi_nhanh khong duoc de trong');
      }

      const existedName = await this.branchRepo.findOne({ where: { ten_chi_nhanh: branchName } });
      if (existedName && existedName.ma_chi_nhanh !== normalizedCode) {
        throw new BadRequestException('Ten chi nhanh da ton tai');
      }

      branch.ten_chi_nhanh = branchName;
    }

    if (payload.dia_chi !== undefined) {
      branch.dia_chi = payload.dia_chi?.trim() || null;
    }

    if (payload.so_dien_thoai !== undefined) {
      branch.so_dien_thoai = payload.so_dien_thoai?.trim() || null;
    }

    if (payload.thanh_pho !== undefined) {
      branch.thanh_pho = payload.thanh_pho?.trim() || null;
    }

    if (payload.quan_huyen !== undefined) {
      branch.quan_huyen = payload.quan_huyen?.trim() || null;
    }

    if (payload.hinh_anh_url !== undefined) {
      branch.hinh_anh_url = payload.hinh_anh_url?.trim() || null;
    }

    if (payload.gio_mo_cua !== undefined) {
      branch.gio_mo_cua = this.normalizeTimeValue(payload.gio_mo_cua);
    }

    if (payload.gio_dong_cua !== undefined) {
      branch.gio_dong_cua = this.normalizeTimeValue(payload.gio_dong_cua);
    }

    if (payload.map_url !== undefined) {
      branch.map_url = payload.map_url?.trim() || null;
    }

    if (payload.trang_thai !== undefined) {
      const status = String(payload.trang_thai).toUpperCase();
      if (!['ACTIVE', 'INACTIVE'].includes(status)) {
        throw new BadRequestException('trang_thai khong hop le');
      }
      branch.trang_thai = status;
    }

    const saved = await this.branchRepo.save(branch);

    await this.userRepo
      .createQueryBuilder()
      .update(User)
      .set({ co_so_ten: saved.ten_chi_nhanh })
      .where('co_so_ma = :branchCode', { branchCode: saved.ma_chi_nhanh })
      .execute();

    return {
      message: 'Cap nhat chi nhanh thanh cong',
      item: this.mapBranchItem(saved),
    };
  }

  async xoaChiNhanhAdmin(branchCode: string) {
    const normalizedCode = this.normalizeBranchCode(branchCode);
    if (!normalizedCode) {
      throw new BadRequestException('branchCode khong hop le');
    }

    const branch = await this.branchRepo.findOne({ where: { ma_chi_nhanh: normalizedCode } });
    if (!branch) {
      throw new NotFoundException('Khong tim thay chi nhanh');
    }

    const accountCount = await this.userRepo.count({ where: { co_so_ma: normalizedCode } });
    if (accountCount > 0) {
      throw new BadRequestException('Khong the xoa chi nhanh dang co tai khoan gan vao');
    }

    await this.branchRepo.remove(branch);
    return { message: 'Xoa chi nhanh thanh cong' };
  }

  async layThongTinCaNhan(maNguoiDung: string) {
    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: maNguoiDung } });
    if (!user) {
      throw new NotFoundException('Khong tim thay nguoi dung');
    }

    return {
      ma_nguoi_dung: user.ma_nguoi_dung,
      ho_ten: user.ho_ten,
      email: user.email,
      so_dien_thoai: user.so_dien_thoai,
      avatar_url: user.avatar_url,
      ten_dang_nhap: user.ten_dang_nhap,
      trang_thai: user.trang_thai,
      vai_tro: user.vai_tro,
      co_so_ma: user.co_so_ma,
      co_so_ten: user.co_so_ten,
      ngay_tao: user.ngay_tao,
    };
  }

  async capNhatThongTinCaNhan(
    maNguoiDung: string,
    payload: { hoTen?: string; soDienThoai?: string; avatarUrl?: string; email?: string },
  ) {
    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: maNguoiDung } });
    if (!user) {
      throw new NotFoundException('Khong tim thay nguoi dung');
    }

    const hoTenMoi = payload.hoTen?.trim();
    const soDienThoaiMoi = payload.soDienThoai?.trim();
    const avatarUrlMoi = payload.avatarUrl?.trim();
    const emailMoi = payload.email?.trim();

    if (hoTenMoi) {
      user.ho_ten = hoTenMoi;
    }

    if (payload.soDienThoai !== undefined) {
      if (!soDienThoaiMoi) {
        user.so_dien_thoai = null;
      } else {
        const existedPhone = await this.userRepo.findOne({ where: { so_dien_thoai: soDienThoaiMoi } });
        if (existedPhone && existedPhone.ma_nguoi_dung !== maNguoiDung) {
          throw new BadRequestException('So dien thoai da duoc su dung');
        }
        user.so_dien_thoai = soDienThoaiMoi;
      }
    }

    if (payload.avatarUrl !== undefined) {
      user.avatar_url = avatarUrlMoi || null;
    }

    if (payload.email !== undefined) {
      if (!emailMoi) {
        user.email = null;
      } else {
        const existedEmail = await this.userRepo.findOne({ where: { email: emailMoi } });
        if (existedEmail && existedEmail.ma_nguoi_dung !== maNguoiDung) {
          throw new BadRequestException('Email da duoc su dung');
        }
        user.email = emailMoi;
      }
    }

    const saved = await this.userRepo.save(user);
    return {
      message: 'Cap nhat thong tin thanh cong',
      user: {
        ma_nguoi_dung: saved.ma_nguoi_dung,
        ho_ten: saved.ho_ten,
        email: saved.email,
        so_dien_thoai: saved.so_dien_thoai,
        avatar_url: saved.avatar_url,
      },
    };
  }

  async doiMatKhau(
    maNguoiDung: string,
    payload: { currentPassword?: string; newPassword?: string },
  ) {
    const { currentPassword, newPassword } = payload;
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Vui long nhap du mat khau hien tai va mat khau moi');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException('Mat khau moi phai co it nhat 6 ky tu');
    }

    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: maNguoiDung } });
    if (!user) {
      throw new NotFoundException('Khong tim thay nguoi dung');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.mat_khau_hash);
    if (!isMatch) {
      throw new UnauthorizedException('Mat khau hien tai khong dung');
    }

    const salt = await bcrypt.genSalt();
    user.mat_khau_hash = await bcrypt.hash(newPassword, salt);
    await this.userRepo.save(user);

    return { message: 'Doi mat khau thanh cong' };
  }

  async layDanhSachDiaChi(maNguoiDung: string) {
    await this.kiemTraNguoiDungTonTai(maNguoiDung);

    const items = await this.deliveryAddressRepo.find({
      where: { ma_nguoi_dung: maNguoiDung },
      order: { mac_dinh: 'DESC', ngay_cap_nhat: 'DESC', id: 'DESC' },
    });

    return {
      items,
      defaultAddressId: items.find((item) => item.mac_dinh)?.id || null,
    };
  }

  async themDiaChi(
    maNguoiDung: string,
    payload: { tenDiaChi?: string; diaChiDayDu?: string; ghiChu?: string; macDinh?: boolean },
  ) {
    await this.kiemTraNguoiDungTonTai(maNguoiDung);

    const tenDiaChi = payload.tenDiaChi?.trim();
    const diaChiDayDu = payload.diaChiDayDu?.trim();
    const ghiChu = payload.ghiChu?.trim();

    if (!tenDiaChi) {
      throw new BadRequestException('tenDiaChi la bat buoc');
    }
    if (!diaChiDayDu) {
      throw new BadRequestException('diaChiDayDu la bat buoc');
    }

    const existingCount = await this.deliveryAddressRepo.count({ where: { ma_nguoi_dung: maNguoiDung } });
    const shouldSetDefault = payload.macDinh === true || existingCount === 0;
    if (shouldSetDefault) {
      await this.boMacDinhTatCaDiaChi(maNguoiDung);
    }

    const created = this.deliveryAddressRepo.create({
      ma_nguoi_dung: maNguoiDung,
      ten_dia_chi: tenDiaChi,
      dia_chi_day_du: diaChiDayDu,
      ghi_chu: ghiChu || null,
      mac_dinh: shouldSetDefault,
    });

    const saved = await this.deliveryAddressRepo.save(created);
    return {
      message: 'Them dia chi thanh cong',
      item: saved,
    };
  }

  async capNhatDiaChi(
    maNguoiDung: string,
    addressId: number,
    payload: { tenDiaChi?: string; diaChiDayDu?: string; ghiChu?: string; macDinh?: boolean },
  ) {
    const address = await this.timDiaChiTheoNguoiDung(maNguoiDung, addressId);

    if (payload.tenDiaChi !== undefined) {
      const tenDiaChi = payload.tenDiaChi.trim();
      if (!tenDiaChi) {
        throw new BadRequestException('tenDiaChi khong duoc de trong');
      }
      address.ten_dia_chi = tenDiaChi;
    }

    if (payload.diaChiDayDu !== undefined) {
      const diaChiDayDu = payload.diaChiDayDu.trim();
      if (!diaChiDayDu) {
        throw new BadRequestException('diaChiDayDu khong duoc de trong');
      }
      address.dia_chi_day_du = diaChiDayDu;
    }

    if (payload.ghiChu !== undefined) {
      address.ghi_chu = payload.ghiChu?.trim() || null;
    }

    if (payload.macDinh === true && !address.mac_dinh) {
      await this.boMacDinhTatCaDiaChi(maNguoiDung);
      address.mac_dinh = true;
    }

    const saved = await this.deliveryAddressRepo.save(address);
    return {
      message: 'Cap nhat dia chi thanh cong',
      item: saved,
    };
  }

  async datDiaChiMacDinh(maNguoiDung: string, addressId: number) {
    const address = await this.timDiaChiTheoNguoiDung(maNguoiDung, addressId);
    if (!address.mac_dinh) {
      await this.boMacDinhTatCaDiaChi(maNguoiDung);
      address.mac_dinh = true;
      await this.deliveryAddressRepo.save(address);
    }

    return {
      message: 'Da dat dia chi mac dinh',
      item: address,
    };
  }

  async xoaDiaChi(maNguoiDung: string, addressId: number) {
    const address = await this.timDiaChiTheoNguoiDung(maNguoiDung, addressId);
    const wasDefault = address.mac_dinh;

    await this.deliveryAddressRepo.remove(address);

    if (wasDefault) {
      const nextAddress = await this.deliveryAddressRepo.findOne({
        where: { ma_nguoi_dung: maNguoiDung },
        order: { ngay_cap_nhat: 'DESC', id: 'DESC' },
      });
      if (nextAddress) {
        nextAddress.mac_dinh = true;
        await this.deliveryAddressRepo.save(nextAddress);
      }
    }

    return { message: 'Xoa dia chi thanh cong' };
  }

  private async kiemTraNguoiDungTonTai(maNguoiDung: string) {
    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: maNguoiDung } });
    if (!user) {
      throw new NotFoundException('Khong tim thay nguoi dung');
    }
    return user;
  }

  private async timDiaChiTheoNguoiDung(maNguoiDung: string, addressId: number) {
    await this.kiemTraNguoiDungTonTai(maNguoiDung);
    const address = await this.deliveryAddressRepo.findOne({ where: { id: addressId, ma_nguoi_dung: maNguoiDung } });
    if (!address) {
      throw new NotFoundException('Khong tim thay dia chi');
    }
    return address;
  }

  private async boMacDinhTatCaDiaChi(maNguoiDung: string) {
    await this.deliveryAddressRepo.update({ ma_nguoi_dung: maNguoiDung, mac_dinh: true }, { mac_dinh: false });
  }

  private tinhHangThanhVien(diem: number): {
    hang: string;
    ma_hang: string;
    diem_hien_tai: number;
    diem_can_len_hang: number | null;
    diem_bat_dau_hang: number;
  } {
    if (diem >= 5000) {
      return { hang: 'Kim cương', ma_hang: 'DIAMOND', diem_hien_tai: diem, diem_can_len_hang: null, diem_bat_dau_hang: 5000 };
    }
    if (diem >= 3000) {
      return { hang: 'Vàng', ma_hang: 'GOLD', diem_hien_tai: diem, diem_can_len_hang: 5000, diem_bat_dau_hang: 3000 };
    }
    if (diem >= 1000) {
      return { hang: 'Bạc', ma_hang: 'SILVER', diem_hien_tai: diem, diem_can_len_hang: 3000, diem_bat_dau_hang: 1000 };
    }
    return { hang: 'Thành viên', ma_hang: 'MEMBER', diem_hien_tai: diem, diem_can_len_hang: 1000, diem_bat_dau_hang: 0 };
  }

  async layDiemLoyalty(maNguoiDung: string) {
    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: maNguoiDung } });
    if (!user) throw new NotFoundException('Khong tim thay nguoi dung');
    const diem = user.diem_loyalty || 0;
    const hang = this.tinhHangThanhVien(diem);
    return {
      ma_nguoi_dung: maNguoiDung,
      diem,
      hang_thanh_vien: hang,
      ghi_chu: 'Tich luy 1 diem cho moi 1.000d chi tieu',
    };
  }

  async congDiemLoyalty(maNguoiDung: string, diem: number) {
    if (!diem || diem <= 0) return { diem_moi: 0 };
    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: maNguoiDung } });
    if (!user) return { diem_moi: 0 }; // Silently fail - called cross-service
    user.diem_loyalty = (user.diem_loyalty || 0) + Math.floor(diem);
    await this.userRepo.save(user);
    return { diem_moi: user.diem_loyalty };
  }

  // ═══════════════════════════════════════════════════════
  //  PROMOTION / VOUCHER MANAGEMENT
  // ═══════════════════════════════════════════════════════

  private mapPromotionItem(p: Promotion, usedByUser = 0) {
    const now = new Date();
    let computedStatus = p.trang_thai;
    if (p.ngay_ket_thuc && new Date(p.ngay_ket_thuc) < now) {
      computedStatus = 'EXPIRED';
    }
    if (p.so_luong_toi_da > 0 && p.so_luong_da_dung >= p.so_luong_toi_da) {
      if (computedStatus === 'ACTIVE') computedStatus = 'EXPIRED';
    }
    return {
      ma_khuyen_mai: p.ma_khuyen_mai,
      ten_khuyen_mai: p.ten_khuyen_mai,
      mo_ta: p.mo_ta,
      loai_khuyen_mai: p.loai_khuyen_mai,
      gia_tri: Number(p.gia_tri),
      gia_tri_don_toi_thieu: Number(p.gia_tri_don_toi_thieu),
      giam_toi_da: p.giam_toi_da !== null ? Number(p.giam_toi_da) : null,
      so_luong_toi_da: p.so_luong_toi_da,
      so_luong_da_dung: p.so_luong_da_dung,
      con_lai: p.so_luong_toi_da > 0 ? Math.max(0, p.so_luong_toi_da - p.so_luong_da_dung) : null,
      gioi_han_moi_nguoi: p.gioi_han_moi_nguoi,
      ngay_bat_dau: p.ngay_bat_dau,
      ngay_ket_thuc: p.ngay_ket_thuc,
      trang_thai: computedStatus,
      hien_thi_cho_khach: p.hien_thi_cho_khach,
      ten_san_pham_tang: p.ten_san_pham_tang,
      hinh_anh: p.hinh_anh,
      ngay_tao: p.ngay_tao,
      ngay_cap_nhat: p.ngay_cap_nhat,
      da_dung_boi_ban: usedByUser,
    };
  }

  /** Admin: lấy toàn bộ danh sách khuyến mãi */
  async layDanhSachKhuyenMaiAdmin() {
    const rows = await this.promotionRepo.find({ order: { ngay_tao: 'DESC' } });
    return {
      total: rows.length,
      items: rows.map((p) => this.mapPromotionItem(p)),
    };
  }

  /** Admin: tạo mã khuyến mãi mới */
  async taoKhuyenMaiAdmin(payload: {
    ma_khuyen_mai?: string;
    ten_khuyen_mai?: string;
    mo_ta?: string;
    loai_khuyen_mai?: string;
    gia_tri?: number;
    gia_tri_don_toi_thieu?: number;
    giam_toi_da?: number | null;
    so_luong_toi_da?: number;
    gioi_han_moi_nguoi?: number;
    ngay_bat_dau?: string | null;
    ngay_ket_thuc?: string | null;
    trang_thai?: string;
    hien_thi_cho_khach?: boolean;
    ten_san_pham_tang?: string | null;
    hinh_anh?: string | null;
  }) {
    const code = String(payload.ma_khuyen_mai || '').trim().toUpperCase().replace(/\s+/g, '_');
    const name = String(payload.ten_khuyen_mai || '').trim();
    const type = String(payload.loai_khuyen_mai || '').toUpperCase();

    if (!code || !/^[A-Z0-9_]+$/.test(code)) {
      throw new BadRequestException('ma_khuyen_mai chi duoc dung A-Z, 0-9, _');
    }
    if (!name) throw new BadRequestException('ten_khuyen_mai la bat buoc');
    if (!['PERCENT', 'FIXED', 'FREE_ITEM'].includes(type)) {
      throw new BadRequestException('loai_khuyen_mai phai la PERCENT, FIXED hoac FREE_ITEM');
    }
    if (type !== 'FREE_ITEM' && Number(payload.gia_tri || 0) <= 0) {
      throw new BadRequestException('gia_tri phai lon hon 0');
    }
    if (type === 'PERCENT' && Number(payload.gia_tri || 0) > 100) {
      throw new BadRequestException('Phan tram giam khong duoc vuot qua 100');
    }

    const existed = await this.promotionRepo.findOne({ where: { ma_khuyen_mai: code } });
    if (existed) throw new BadRequestException('Ma khuyen mai da ton tai');

    const p = new Promotion();
    p.ma_khuyen_mai = code;
    p.ten_khuyen_mai = name;
    p.mo_ta = payload.mo_ta?.trim() || null;
    p.loai_khuyen_mai = type;
    p.gia_tri = Number(payload.gia_tri || 0);
    p.gia_tri_don_toi_thieu = Number(payload.gia_tri_don_toi_thieu || 0);
    p.giam_toi_da = payload.giam_toi_da !== undefined && payload.giam_toi_da !== null ? Number(payload.giam_toi_da) : null;
    p.so_luong_toi_da = Number(payload.so_luong_toi_da || 0);
    p.gioi_han_moi_nguoi = Math.max(1, Number(payload.gioi_han_moi_nguoi || 1));
    p.ngay_bat_dau = payload.ngay_bat_dau ? new Date(payload.ngay_bat_dau) : null;
    p.ngay_ket_thuc = payload.ngay_ket_thuc ? new Date(payload.ngay_ket_thuc) : null;
    p.trang_thai = ['ACTIVE', 'INACTIVE'].includes(String(payload.trang_thai || 'ACTIVE').toUpperCase())
      ? String(payload.trang_thai).toUpperCase()
      : 'ACTIVE';
    p.hien_thi_cho_khach = payload.hien_thi_cho_khach !== false;
    p.ten_san_pham_tang = payload.ten_san_pham_tang?.trim() || null;
    p.hinh_anh = payload.hinh_anh?.trim() || null;
    p.so_luong_da_dung = 0;

    const saved = await this.promotionRepo.save(p);
    return { message: 'Tao khuyen mai thanh cong', item: this.mapPromotionItem(saved) };
  }

  /** Admin: cập nhật khuyến mãi */
  async capNhatKhuyenMaiAdmin(
    maKhuyenMai: string,
    payload: {
      ten_khuyen_mai?: string;
      mo_ta?: string;
      gia_tri?: number;
      gia_tri_don_toi_thieu?: number;
      giam_toi_da?: number | null;
      so_luong_toi_da?: number;
      gioi_han_moi_nguoi?: number;
      ngay_bat_dau?: string | null;
      ngay_ket_thuc?: string | null;
      trang_thai?: string;
      hien_thi_cho_khach?: boolean;
      ten_san_pham_tang?: string | null;
      hinh_anh?: string | null;
    },
  ) {
    const p = await this.promotionRepo.findOne({ where: { ma_khuyen_mai: maKhuyenMai.toUpperCase() } });
    if (!p) throw new NotFoundException('Khong tim thay khuyen mai');

    if (payload.ten_khuyen_mai !== undefined) p.ten_khuyen_mai = String(payload.ten_khuyen_mai).trim();
    if (payload.mo_ta !== undefined) p.mo_ta = payload.mo_ta?.trim() || null;
    if (payload.gia_tri !== undefined) p.gia_tri = Number(payload.gia_tri);
    if (payload.gia_tri_don_toi_thieu !== undefined) p.gia_tri_don_toi_thieu = Number(payload.gia_tri_don_toi_thieu);
    if (payload.giam_toi_da !== undefined) p.giam_toi_da = payload.giam_toi_da !== null ? Number(payload.giam_toi_da) : null;
    if (payload.so_luong_toi_da !== undefined) p.so_luong_toi_da = Number(payload.so_luong_toi_da);
    if (payload.gioi_han_moi_nguoi !== undefined) p.gioi_han_moi_nguoi = Math.max(1, Number(payload.gioi_han_moi_nguoi));
    if (payload.ngay_bat_dau !== undefined) p.ngay_bat_dau = payload.ngay_bat_dau ? new Date(payload.ngay_bat_dau) : null;
    if (payload.ngay_ket_thuc !== undefined) p.ngay_ket_thuc = payload.ngay_ket_thuc ? new Date(payload.ngay_ket_thuc) : null;
    if (payload.trang_thai !== undefined) {
      const s = String(payload.trang_thai).toUpperCase();
      if (['ACTIVE', 'INACTIVE'].includes(s)) p.trang_thai = s;
    }
    if (payload.hien_thi_cho_khach !== undefined) p.hien_thi_cho_khach = Boolean(payload.hien_thi_cho_khach);
    if (payload.ten_san_pham_tang !== undefined) p.ten_san_pham_tang = payload.ten_san_pham_tang?.trim() || null;
    if (payload.hinh_anh !== undefined) p.hinh_anh = payload.hinh_anh?.trim() || null;

    const saved = await this.promotionRepo.save(p);
    return { message: 'Cap nhat khuyen mai thanh cong', item: this.mapPromotionItem(saved) };
  }

  /** Admin: xóa khuyến mãi */
  async xoaKhuyenMaiAdmin(maKhuyenMai: string) {
    const p = await this.promotionRepo.findOne({ where: { ma_khuyen_mai: maKhuyenMai.toUpperCase() } });
    if (!p) throw new NotFoundException('Khong tim thay khuyen mai');
    await this.promotionUsageRepo.delete({ ma_khuyen_mai: p.ma_khuyen_mai });
    await this.promotionRepo.remove(p);
    return { message: 'Xoa khuyen mai thanh cong', soft_deleted: false };
  }

  /** Customer: lấy danh sách voucher hiển thị được */
  async layVoucherChoKhach(userId?: string) {
    const now = new Date();
    const rows = await this.promotionRepo.find({
      where: { trang_thai: 'ACTIVE', hien_thi_cho_khach: true },
      order: { ngay_tao: 'DESC' },
    });

    const visibleRows = rows.filter((p) => {
      if (p.ngay_bat_dau && new Date(p.ngay_bat_dau) > now) return false;
      if (p.ngay_ket_thuc && new Date(p.ngay_ket_thuc) < now) return false;
      if (p.so_luong_toi_da > 0 && p.so_luong_da_dung >= p.so_luong_toi_da) return false;
      return true;
    });

    let usageMap: Record<string, number> = {};
    if (userId) {
      const usages = await this.promotionUsageRepo
        .createQueryBuilder('u')
        .select('u.ma_khuyen_mai', 'code')
        .addSelect('COUNT(*)', 'cnt')
        .where('u.ma_nguoi_dung = :userId', { userId })
        .groupBy('u.ma_khuyen_mai')
        .getRawMany<{ code: string; cnt: string }>();
      usageMap = usages.reduce<Record<string, number>>((acc, row) => {
        acc[row.code] = Number(row.cnt || 0);
        return acc;
      }, {});
    }

    return {
      total: visibleRows.length,
      items: visibleRows.map((p) => {
        const usedByUser = usageMap[p.ma_khuyen_mai] || 0;
        const canUse = usedByUser < p.gioi_han_moi_nguoi;
        return {
          ...this.mapPromotionItem(p, usedByUser),
          co_the_dung: canUse,
        };
      }),
    };
  }

  /** Customer: kiểm tra và áp dụng mã, gọi từ order service */
  async kiemTraMaKhuyenMai(maKhuyenMai: string, userId: string, giaTriDon: number) {
    const code = String(maKhuyenMai || '').trim().toUpperCase();
    if (!code) throw new BadRequestException('Vui long nhap ma khuyen mai');

    const p = await this.promotionRepo.findOne({ where: { ma_khuyen_mai: code } });
    if (!p) throw new NotFoundException('Ma khuyen mai khong ton tai');
    if (p.trang_thai !== 'ACTIVE') throw new BadRequestException('Ma khuyen mai khong con hieu luc');

    const now = new Date();
    if (p.ngay_bat_dau && new Date(p.ngay_bat_dau) > now) {
      throw new BadRequestException('Ma khuyen mai chua den ngay su dung');
    }
    if (p.ngay_ket_thuc && new Date(p.ngay_ket_thuc) < now) {
      throw new BadRequestException('Ma khuyen mai da het han');
    }
    if (p.so_luong_toi_da > 0 && p.so_luong_da_dung >= p.so_luong_toi_da) {
      throw new BadRequestException('Ma khuyen mai da su dung het luot');
    }
    if (Number(giaTriDon || 0) < Number(p.gia_tri_don_toi_thieu)) {
      throw new BadRequestException(
        `Don hang toi thieu ${Number(p.gia_tri_don_toi_thieu).toLocaleString('vi-VN')}d de ap dung ma nay`,
      );
    }

    const usedCount = await this.promotionUsageRepo.count({
      where: { ma_khuyen_mai: code, ma_nguoi_dung: userId },
    });
    if (usedCount >= p.gioi_han_moi_nguoi) {
      throw new BadRequestException('Ban da dung het luot su dung ma khuyen mai nay');
    }

    let soTienGiam = 0;
    if (p.loai_khuyen_mai === 'PERCENT') {
      soTienGiam = Math.floor((Number(giaTriDon) * Number(p.gia_tri)) / 100);
      if (p.giam_toi_da !== null && soTienGiam > Number(p.giam_toi_da)) {
        soTienGiam = Number(p.giam_toi_da);
      }
    } else if (p.loai_khuyen_mai === 'FIXED') {
      soTienGiam = Math.min(Number(p.gia_tri), Number(giaTriDon));
    }

    return {
      hop_le: true,
      ma_khuyen_mai: p.ma_khuyen_mai,
      ten_khuyen_mai: p.ten_khuyen_mai,
      loai_khuyen_mai: p.loai_khuyen_mai,
      so_tien_giam: soTienGiam,
      ten_san_pham_tang: p.ten_san_pham_tang,
      gia_tri: Number(p.gia_tri),
    };
  }

  /** Internal: ghi nhận lượt dùng khuyến mãi sau khi tạo đơn thành công */
  async xacNhanSuDungKhuyenMai(payload: {
    ma_khuyen_mai: string;
    user_id?: string;
    ma_don_hang?: string | null;
    so_tien_giam?: number;
  }) {
    const code = String(payload.ma_khuyen_mai || '').trim().toUpperCase();
    if (!code) throw new BadRequestException('ma_khuyen_mai la bat buoc');

    const p = await this.promotionRepo.findOne({ where: { ma_khuyen_mai: code } });
    if (!p) throw new NotFoundException('Ma khuyen mai khong ton tai');

    p.so_luong_da_dung = Number(p.so_luong_da_dung || 0) + 1;
    await this.promotionRepo.save(p);

    const userId = String(payload.user_id || '').trim();
    if (userId) {
      const usage = this.promotionUsageRepo.create({
        ma_khuyen_mai: code,
        ma_nguoi_dung: userId,
        ma_don_hang: payload.ma_don_hang || null,
        so_tien_giam: Number(payload.so_tien_giam || 0),
      });
      await this.promotionUsageRepo.save(usage);
    }

    return {
      message: 'Da ghi nhan su dung khuyen mai',
      ma_khuyen_mai: code,
      so_luong_da_dung: p.so_luong_da_dung,
    };
  }

    async loginWithFacebook(payload: {
      facebookAccessToken?: string;
      accessToken?: string;
    }) {
      const facebookAccessToken = String(
        payload.facebookAccessToken || payload.accessToken || '',
      ).trim();

      if (!facebookAccessToken) {
        throw new BadRequestException('Facebook access token là bắt buộc');
      }

      const facebookAppId = String(process.env.FACEBOOK_APP_ID || '').trim();
      const facebookAppSecret = String(process.env.FACEBOOK_APP_SECRET || '').trim();

      if (facebookAppId && facebookAppSecret) {
        const appToken = `${facebookAppId}|${facebookAppSecret}`;
        const debugUrl =
          `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(facebookAccessToken)}` +
          `&access_token=${encodeURIComponent(appToken)}`;

        const debugResponse = await fetch(debugUrl);
        const debugJson = await debugResponse.json() as any;
        const tokenInfo = debugJson?.data;

        if (!debugResponse.ok || !tokenInfo?.is_valid) {
          throw new UnauthorizedException('Facebook token không hợp lệ');
        }

        if (String(tokenInfo?.app_id || '') !== facebookAppId) {
          throw new UnauthorizedException('Facebook token không đúng app');
        }
      }

      const meUrl =
        `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)` +
        `&access_token=${encodeURIComponent(facebookAccessToken)}`;
      const meResponse = await fetch(meUrl);
      const meJson = await meResponse.json() as any;

      if (!meResponse.ok || !meJson?.id) {
        throw new UnauthorizedException('Không lấy được thông tin từ Facebook');
      }

      const facebookId = String(meJson.id);
      const normalizedEmail = meJson.email ? String(meJson.email).toLowerCase().trim() : null;
      const fallbackUsername = `facebook_${facebookId}`;
      const avatarUrl = meJson?.picture?.data?.url ? String(meJson.picture.data.url) : null;

      let user = normalizedEmail
        ? await this.userRepo.findOne({ where: { email: normalizedEmail } })
        : null;

      if (!user) {
        user = await this.userRepo.findOne({ where: { ten_dang_nhap: fallbackUsername } });
      }

      if (!user) {
        user = this.userRepo.create({
          ma_nguoi_dung: randomUUID(),
          email: normalizedEmail || `${fallbackUsername}@facebook.local`,
          ten_dang_nhap: fallbackUsername,
          mat_khau_hash: 'FACEBOOK_AUTH',
          ho_ten: meJson.name || 'Facebook User',
          avatar_url: avatarUrl,
          vai_tro: 'CUSTOMER',
          trang_thai: 'ACTIVE',
          co_so_ma: null,
          co_so_ten: null,
        });
        user = await this.userRepo.save(user);
      } else {
        let shouldSave = false;

        if (normalizedEmail && user.email !== normalizedEmail) {
          user.email = normalizedEmail;
          shouldSave = true;
        }
        if (avatarUrl && user.avatar_url !== avatarUrl) {
          user.avatar_url = avatarUrl;
          shouldSave = true;
        }
        if (meJson.name && user.ho_ten !== meJson.name) {
          user.ho_ten = meJson.name;
          shouldSave = true;
        }
        if (user.trang_thai !== 'ACTIVE') {
          user.trang_thai = 'ACTIVE';
          shouldSave = true;
        }

        if (shouldSave) {
          user = await this.userRepo.save(user);
        }
      }

      const accessToken = await this.taoAccessToken(user);

      return {
        accessToken,
        user: {
          ma_nguoi_dung: user.ma_nguoi_dung,
          hoTen: user.ho_ten,
          tenDangNhap: user.ten_dang_nhap,
          email: user.email,
          avatar_url: user.avatar_url,
          vaiTro: user.vai_tro || 'CUSTOMER',
          coSoMa: user.co_so_ma,
          coSoTen: user.co_so_ten,
          co_so_ma: user.co_so_ma,
          co_so_ten: user.co_so_ten,
        },
      };
    }

    /**
     * Google OAuth: Verify Google ID Token và tạo/cập nhật user
     * Frontend sẽ gửi token từ Google, backend verify signature
     */
    async loginWithGoogle(payload: {
      googleToken: string;
      googleTokenId?: string;
      recaptchaToken?: string;
    }) {
      if (!payload.googleToken && !payload.googleTokenId) {
        throw new BadRequestException('Google token là bắt buộc');
      }

      let googleData: any = {};
      try {
        const parts = (payload.googleToken || payload.googleTokenId || '').split('.');
        if (parts.length === 3) {
          const payload_decoded = JSON.parse(
            Buffer.from(parts[1], 'base64').toString('utf8')
          );
          googleData = payload_decoded;
        } else {
          throw new Error('Invalid token format');
        }
      } catch (err) {
        throw new UnauthorizedException('Token Google không hợp lệ');
      }

      const email = googleData.email || googleData.email_verified_by && googleData.email;
      if (!email) {
        throw new UnauthorizedException('Không tìm thấy email trong token Google');
      }

      let user = await this.userRepo.findOne({ where: { email } });

      if (!user) {
        user = this.userRepo.create({
          ma_nguoi_dung: randomUUID(),
          email: email,
          ten_dang_nhap: email,
          mat_khau_hash: 'GOOGLE_AUTH',
          ho_ten: googleData.name || 'User',
          avatar_url: googleData.picture || null,
          vai_tro: 'CUSTOMER',
          trang_thai: 'ACTIVE',
          co_so_ma: null,
          co_so_ten: null,
        });
        user = await this.userRepo.save(user);
      } else {
        let shouldSave = false;
        if (!user.avatar_url && googleData.picture) {
          user.avatar_url = googleData.picture;
          shouldSave = true;
        }
        if (!user.ho_ten && googleData.name) {
          user.ho_ten = googleData.name;
          shouldSave = true;
        }
        if (user.trang_thai !== 'ACTIVE') {
          user.trang_thai = 'ACTIVE';
          shouldSave = true;
        }
        if (shouldSave) {
          await this.userRepo.save(user);
        }
      }

      const accessToken = await this.taoAccessToken(user);
    
      return {
        accessToken,
        user: {
          ma_nguoi_dung: user.ma_nguoi_dung,
          hoTen: user.ho_ten,
          tenDangNhap: user.ten_dang_nhap,
          email: user.email,
          avatar_url: user.avatar_url,
          vaiTro: user.vai_tro || 'CUSTOMER',
          coSoMa: user.co_so_ma,
          coSoTen: user.co_so_ten,
          co_so_ma: user.co_so_ma,
          co_so_ten: user.co_so_ten,
        },
      };
    }

    /**
     * Verify reCAPTCHA token từ frontend
     * Gọi API reCAPTCHA v3 để xác minh người dùng không phải robot
     */
    async verifyRecaptcha(payload: { recaptchaToken: string }) {
      if (!payload.recaptchaToken) {
        throw new BadRequestException('reCAPTCHA token là bắt buộc');
      }

      const secretKey = process.env.RECAPTCHA_SECRET_KEY || '';
    
      if (!secretKey) {
        console.warn('RECAPTCHA_SECRET_KEY not configured');
        return { success: true, score: 0.9, message: 'reCAPTCHA verification skipped (dev mode)' };
      }

      try {
        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${secretKey}&response=${payload.recaptchaToken}`,
        });
      
        const result = await response.json() as any;

        if (!result.success) {
          throw new BadRequestException('Xác minh reCAPTCHA thất bại');
        }

        if (result.score && result.score < 0.5) {
          throw new UnauthorizedException('Phát hiện hoạt động nghi ngờ, vui lòng thử lại');
        }

        return {
          success: true,
          score: result.score || 0,
          action: result.action || 'LOGIN',
          challenge_ts: result.challenge_ts,
        };
      } catch (err) {
        console.error('reCAPTCHA verification error:', err);
        throw new BadRequestException('Xác minh reCAPTCHA thất bại, vui lòng thử lại');
      }
    }
  }