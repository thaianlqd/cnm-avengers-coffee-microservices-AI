import { Injectable, OnModuleInit, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryAddress } from './delivery-address.entity';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const BRANCHES = {
  MAC_DINH_CHI: {
    code: 'MAC_DINH_CHI',
    name: 'Mạc Đĩnh Chi',
  },
  THE_GRACE_TOWER: {
    code: 'THE_GRACE_TOWER',
    name: 'The Grace Tower',
  },
} as const;

@Injectable()
export class UserService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(DeliveryAddress)
    private deliveryAddressRepo: Repository<DeliveryAddress>,
  ) {}

  async onModuleInit() {
    await this.seedSystemAdminAccount();
    await this.seedStoreWorkforceAccounts();
  }

  private normalizeBranchCode(branchCode?: string) {
    const code = String(branchCode || '').trim().toUpperCase();
    if (!code) return null;
    return BRANCHES[code as keyof typeof BRANCHES]?.code || null;
  }

  private mapBranchName(branchCode?: string | null) {
    const code = String(branchCode || '').trim().toUpperCase();
    if (!code) return null;
    return BRANCHES[code as keyof typeof BRANCHES]?.name || null;
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

    // Trả về đúng format để Frontend AuthModal.jsx của bác đọc được
    return {
      accessToken: 'jwt_avengers_' + Math.random().toString(36).substring(7),
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
    vai_tro?: 'STAFF' | 'MANAGER';
    co_so_ma?: string;
    email?: string;
  }) {
    const username = String(payload.ten_dang_nhap || '').trim();
    const password = String(payload.mat_khau || '');
    const fullName = String(payload.ho_ten || '').trim();
    const role = String(payload.vai_tro || '').trim().toUpperCase();
    const branchCode = this.normalizeBranchCode(payload.co_so_ma);

    if (!username || !password || !fullName || !['STAFF', 'MANAGER'].includes(role)) {
      throw new BadRequestException('Du lieu tao tai khoan khong hop le');
    }
    if (password.length < 6) {
      throw new BadRequestException('Mat khau phai tu 6 ky tu tro len');
    }
    if (!branchCode) {
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
      co_so_ma: branchCode,
      co_so_ten: this.mapBranchName(branchCode),
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
      vai_tro?: 'STAFF' | 'MANAGER';
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
      if (!['STAFF', 'MANAGER'].includes(role)) {
        throw new BadRequestException('Chi cho phep role STAFF hoac MANAGER');
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
      const branchCode = this.normalizeBranchCode(payload.co_so_ma);
      if (!branchCode) {
        throw new BadRequestException('co_so_ma khong hop le');
      }
      user.co_so_ma = branchCode;
      user.co_so_ten = this.mapBranchName(branchCode);
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

  private async seedStoreWorkforceAccounts() {
    const sharedPassword = process.env.STORE_DEFAULT_PASSWORD || '123456';

    await this.upsertWorkforceUser({
      username: 'thaian_staff_macdinhchi',
      password: sharedPassword,
      fullName: 'Thái An - Nhân viên cơ sở Mạc Đĩnh Chi',
      role: 'STAFF',
      branchCode: BRANCHES.MAC_DINH_CHI.code,
      branchName: BRANCHES.MAC_DINH_CHI.name,
    });

    await this.upsertWorkforceUser({
      username: 'thaian_manager_macdinhchi',
      password: sharedPassword,
      fullName: 'Thái An - Quản lý cơ sở Mạc Đĩnh Chi',
      role: 'MANAGER',
      branchCode: BRANCHES.MAC_DINH_CHI.code,
      branchName: BRANCHES.MAC_DINH_CHI.name,
    });

    await this.upsertWorkforceUser({
      username: 'thaian_staff_thegracetower',
      password: sharedPassword,
      fullName: 'Thái An - Nhân viên cơ sở The Grace Tower',
      role: 'STAFF',
      branchCode: BRANCHES.THE_GRACE_TOWER.code,
      branchName: BRANCHES.THE_GRACE_TOWER.name,
    });

    await this.upsertWorkforceUser({
      username: 'thaian_manager_thegracetower',
      password: sharedPassword,
      fullName: 'Thái An - Quản lý cơ sở The Grace Tower',
      role: 'MANAGER',
      branchCode: BRANCHES.THE_GRACE_TOWER.code,
      branchName: BRANCHES.THE_GRACE_TOWER.name,
    });
  }

  private async seedSystemAdminAccount() {
    await this.upsertGenericUser({
      username: 'thaian_admin',
      password: process.env.SYSTEM_ADMIN_PASSWORD || '123456',
      fullName: 'Thái An - Quản trị viên hệ thống',
      role: 'ADMIN',
      branchCode: null,
      branchName: null,
    });
  }

  private async upsertWorkforceUser(input: {
    username: string;
    password: string;
    fullName: string;
    role: 'STAFF' | 'MANAGER';
    branchCode: string;
    branchName: string;
  }) {
    const existed = await this.userRepo.findOne({
      where: [{ ten_dang_nhap: input.username }, { email: input.username }],
    });

    if (existed) {
      let shouldSave = false;
      if (existed.vai_tro !== input.role) {
        existed.vai_tro = input.role;
        shouldSave = true;
      }
      if (existed.trang_thai !== 'ACTIVE') {
        existed.trang_thai = 'ACTIVE';
        shouldSave = true;
      }
      if (!existed.email) {
        existed.email = input.username;
        shouldSave = true;
      }
      if (existed.co_so_ma !== input.branchCode) {
        existed.co_so_ma = input.branchCode;
        shouldSave = true;
      }
      if (existed.co_so_ten !== input.branchName) {
        existed.co_so_ten = input.branchName;
        shouldSave = true;
      }
      if (shouldSave) {
        await this.userRepo.save(existed);
      }
      return;
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(input.password, salt);

    const seededUser = this.userRepo.create({
      ma_nguoi_dung: randomUUID(),
      ten_dang_nhap: input.username,
      email: input.username,
      mat_khau_hash: hashedPassword,
      ho_ten: input.fullName,
      trang_thai: 'ACTIVE',
      vai_tro: input.role,
      co_so_ma: input.branchCode,
      co_so_ten: input.branchName,
    });

    await this.userRepo.save(seededUser);
  }

  private async upsertGenericUser(input: {
    username: string;
    password: string;
    fullName: string;
    role: 'ADMIN' | 'STAFF' | 'MANAGER';
    branchCode: string | null;
    branchName: string | null;
  }) {
    const existed = await this.userRepo.findOne({
      where: [{ ten_dang_nhap: input.username }, { email: input.username }],
    });

    if (existed) {
      let shouldSave = false;
      if (existed.vai_tro !== input.role) {
        existed.vai_tro = input.role;
        shouldSave = true;
      }
      if (existed.ho_ten !== input.fullName) {
        existed.ho_ten = input.fullName;
        shouldSave = true;
      }
      if (existed.trang_thai !== 'ACTIVE') {
        existed.trang_thai = 'ACTIVE';
        shouldSave = true;
      }
      if (!existed.email) {
        existed.email = input.username;
        shouldSave = true;
      }
      if (existed.co_so_ma !== input.branchCode) {
        existed.co_so_ma = input.branchCode;
        shouldSave = true;
      }
      if (existed.co_so_ten !== input.branchName) {
        existed.co_so_ten = input.branchName;
        shouldSave = true;
      }
      if (shouldSave) {
        await this.userRepo.save(existed);
      }
      return;
    }

    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(input.password, salt);

    const seededUser = this.userRepo.create({
      ma_nguoi_dung: randomUUID(),
      ten_dang_nhap: input.username,
      email: input.username,
      mat_khau_hash: hashedPassword,
      ho_ten: input.fullName,
      trang_thai: 'ACTIVE',
      vai_tro: input.role,
      co_so_ma: input.branchCode,
      co_so_ten: input.branchName,
    });

    await this.userRepo.save(seededUser);
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
    payload: { hoTen?: string; soDienThoai?: string; avatarUrl?: string },
  ) {
    const user = await this.userRepo.findOne({ where: { ma_nguoi_dung: maNguoiDung } });
    if (!user) {
      throw new NotFoundException('Khong tim thay nguoi dung');
    }

    const hoTenMoi = payload.hoTen?.trim();
    const soDienThoaiMoi = payload.soDienThoai?.trim();
    const avatarUrlMoi = payload.avatarUrl?.trim();

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
}