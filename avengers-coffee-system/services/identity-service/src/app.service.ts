import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { User } from './modules/user/user.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  getHello(): string {
    return 'Identity service is running';
  }

  async register(payload: {
    ten_dang_nhap: string;
    mat_khau: string;
    ho_ten: string;
    email?: string;
    so_dien_thoai?: string;
    avatar_url?: string;
  }) {
    if (!payload.ten_dang_nhap || !payload.mat_khau || !payload.ho_ten) {
      throw new BadRequestException('ten_dang_nhap, mat_khau, ho_ten là bắt buộc');
    }

    const existedByUsername = await this.userRepository.findOne({
      where: { ten_dang_nhap: payload.ten_dang_nhap },
    });
    if (existedByUsername) {
      throw new BadRequestException('Tên đăng nhập đã tồn tại');
    }

    if (payload.email) {
      const existedByEmail = await this.userRepository.findOne({ where: { email: payload.email } });
      if (existedByEmail) {
        throw new BadRequestException('Email đã tồn tại');
      }
    }

    if (payload.so_dien_thoai) {
      const existedByPhone = await this.userRepository.findOne({
        where: { so_dien_thoai: payload.so_dien_thoai },
      });
      if (existedByPhone) {
        throw new BadRequestException('Số điện thoại đã tồn tại');
      }
    }

    const user = new User();
    user.ten_dang_nhap = payload.ten_dang_nhap;
    user.mat_khau_hash = this.hashPassword(payload.mat_khau);
    user.ho_ten = payload.ho_ten;
    user.email = payload.email ?? null;
    user.so_dien_thoai = payload.so_dien_thoai ?? null;
    user.avatar_url = payload.avatar_url ?? null;
    user.trang_thai = 'ACTIVE';

    const savedUser = await this.userRepository.save(user);
    return {
      message: 'Đăng ký thành công',
      user: this.toSafeUser(savedUser),
    };
  }

  async login(payload: { tai_khoan: string; mat_khau: string }) {
    if (!payload.tai_khoan || !payload.mat_khau) {
      throw new BadRequestException('tai_khoan và mat_khau là bắt buộc');
    }

    const user = await this.userRepository.findOne({
      where: [{ ten_dang_nhap: payload.tai_khoan }, { email: payload.tai_khoan }],
    });
    if (!user) {
      throw new UnauthorizedException('Sai thông tin đăng nhập');
    }

    const isValid = user.mat_khau_hash === this.hashPassword(payload.mat_khau);
    if (!isValid) {
      throw new UnauthorizedException('Sai thông tin đăng nhập');
    }

    return {
      message: 'Đăng nhập thành công',
      user: this.toSafeUser(user),
    };
  }

  async updateProfile(
    userId: string,
    payload: {
      ho_ten?: string;
      email?: string;
      so_dien_thoai?: string;
      avatar_url?: string;
    },
  ) {
    const user = await this.userRepository.findOne({ where: { ma_nguoi_dung: userId } });
    if (!user) {
      throw new NotFoundException('Khong tim thay nguoi dung');
    }

    if (payload.email && payload.email !== user.email) {
      const existedByEmail = await this.userRepository.findOne({ where: { email: payload.email } });
      if (existedByEmail) {
        throw new BadRequestException('Email da ton tai');
      }
    }

    if (payload.so_dien_thoai && payload.so_dien_thoai !== user.so_dien_thoai) {
      const existedByPhone = await this.userRepository.findOne({
        where: { so_dien_thoai: payload.so_dien_thoai },
      });
      if (existedByPhone) {
        throw new BadRequestException('So dien thoai da ton tai');
      }
    }

    user.ho_ten = payload.ho_ten ?? user.ho_ten;
    user.email = payload.email ?? user.email;
    user.so_dien_thoai = payload.so_dien_thoai ?? user.so_dien_thoai;
    user.avatar_url = payload.avatar_url ?? user.avatar_url;

    const saved = await this.userRepository.save(user);
    return {
      message: 'Cap nhat profile thanh cong',
      user: this.toSafeUser(saved),
    };
  }

  async changePassword(
    userId: string,
    payload: {
      mat_khau_cu: string;
      mat_khau_moi: string;
    },
  ) {
    if (!payload.mat_khau_cu || !payload.mat_khau_moi) {
      throw new BadRequestException('mat_khau_cu va mat_khau_moi la bat buoc');
    }

    const user = await this.userRepository.findOne({ where: { ma_nguoi_dung: userId } });
    if (!user) {
      throw new NotFoundException('Khong tim thay nguoi dung');
    }

    if (user.mat_khau_hash !== this.hashPassword(payload.mat_khau_cu)) {
      throw new UnauthorizedException('Mat khau cu khong dung');
    }

    user.mat_khau_hash = this.hashPassword(payload.mat_khau_moi);
    await this.userRepository.save(user);

    return { message: 'Doi mat khau thanh cong' };
  }

  private hashPassword(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private toSafeUser(user: User) {
    return {
      ma_nguoi_dung: user.ma_nguoi_dung,
      ten_dang_nhap: user.ten_dang_nhap,
      ho_ten: user.ho_ten,
      email: user.email,
      so_dien_thoai: user.so_dien_thoai,
      avatar_url: user.avatar_url,
      trang_thai: user.trang_thai,
      ngay_tao: user.ngay_tao,
    };
  }
}
