import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryAddress } from './delivery-address.entity';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(DeliveryAddress)
    private deliveryAddressRepo: Repository<DeliveryAddress>,
  ) {}

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
    });

    const savedUser = await this.userRepo.save(newUser);
    return { message: 'Đăng ký thành công!', userId: savedUser.ma_nguoi_dung };
  }

  async login(data: any) {
    const { email, password } = data;
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) throw new UnauthorizedException('Email không tồn tại bác ạ!');

    const isMatch = await bcrypt.compare(password, user.mat_khau_hash);
    if (!isMatch) throw new UnauthorizedException('Sai mật khẩu rồi!');

    // Trả về đúng format để Frontend AuthModal.jsx của bác đọc được
    return {
      accessToken: 'jwt_avengers_' + Math.random().toString(36).substring(7),
      user: {
        ma_nguoi_dung: user.ma_nguoi_dung,
        hoTen: user.ho_ten,
        email: user.email
      }
    };
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