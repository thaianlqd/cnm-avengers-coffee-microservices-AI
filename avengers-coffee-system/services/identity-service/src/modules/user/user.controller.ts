import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserService } from './user.service';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('auth/register')
  async register(@Body() body: any) {
    return this.userService.register(body);
  }

  @Post('auth/login')
  async login(@Body() body: any) {
    return this.userService.login(body);
  }

  @Get('users/workforce')
  async layDanhSachNhanSu(@Query('role') role?: string, @Query('branch_code') branchCode?: string) {
    return this.userService.layDanhSachNhanSu(role, branchCode);
  }

  @Get('users/admin/accounts')
  async layDanhSachTaiKhoanAdmin(
    @Query('role') role?: string,
    @Query('branch_code') branchCode?: string,
    @Query('q') keyword?: string,
  ) {
    return this.userService.layDanhSachTaiKhoanHeThong({ role, branchCode, keyword });
  }

  @Post('users/admin/accounts')
  async taoTaiKhoanAdmin(
    @Body()
    body: {
      ten_dang_nhap?: string;
      mat_khau?: string;
      ho_ten?: string;
      vai_tro?: 'STAFF' | 'MANAGER';
      co_so_ma?: string;
      email?: string;
    },
  ) {
    return this.userService.taoTaiKhoanHeThong(body);
  }

  @Patch('users/admin/accounts/:userId')
  async capNhatTaiKhoanAdmin(
    @Param('userId') userId: string,
    @Body()
    body: {
      ten_dang_nhap?: string;
      mat_khau?: string;
      ho_ten?: string;
      vai_tro?: 'STAFF' | 'MANAGER';
      co_so_ma?: string;
      trang_thai?: 'ACTIVE' | 'INACTIVE';
      email?: string;
    },
  ) {
    return this.userService.capNhatTaiKhoanHeThong(userId, body);
  }

  @Delete('users/admin/accounts/:userId')
  async xoaTaiKhoanAdmin(@Param('userId') userId: string) {
    return this.userService.xoaTaiKhoanHeThong(userId);
  }

  @Get('users/admin/stats')
  async layThongKeAdmin() {
    return this.userService.layThongKeHeThong();
  }

  @Get('users/:userId/profile')
  async layThongTinCaNhan(@Param('userId') userId: string) {
    return this.userService.layThongTinCaNhan(userId);
  }

  @Patch('users/:userId/profile')
  async capNhatThongTinCaNhan(
    @Param('userId') userId: string,
    @Body() body: { hoTen?: string; soDienThoai?: string; avatarUrl?: string },
  ) {
    return this.userService.capNhatThongTinCaNhan(userId, body);
  }

  @Post('users/:userId/change-password')
  async doiMatKhau(
    @Param('userId') userId: string,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    return this.userService.doiMatKhau(userId, body);
  }

  @Get('users/:userId/addresses')
  async layDanhSachDiaChi(@Param('userId') userId: string) {
    return this.userService.layDanhSachDiaChi(userId);
  }

  @Post('users/:userId/addresses')
  async themDiaChi(
    @Param('userId') userId: string,
    @Body() body: { tenDiaChi?: string; diaChiDayDu?: string; ghiChu?: string; macDinh?: boolean },
  ) {
    return this.userService.themDiaChi(userId, body);
  }

  @Patch('users/:userId/addresses/:addressId')
  async capNhatDiaChi(
    @Param('userId') userId: string,
    @Param('addressId') addressId: string,
    @Body() body: { tenDiaChi?: string; diaChiDayDu?: string; ghiChu?: string; macDinh?: boolean },
  ) {
    return this.userService.capNhatDiaChi(userId, Number(addressId), body);
  }

  @Patch('users/:userId/addresses/:addressId/default')
  async datDiaChiMacDinh(
    @Param('userId') userId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.userService.datDiaChiMacDinh(userId, Number(addressId));
  }

  @Delete('users/:userId/addresses/:addressId')
  async xoaDiaChi(
    @Param('userId') userId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.userService.xoaDiaChi(userId, Number(addressId));
  }

  @Get('users/:userId/loyalty')
  async layDiemLoyalty(@Param('userId') userId: string) {
    return this.userService.layDiemLoyalty(userId);
  }

  @Post('users/:userId/loyalty/cong-diem')
  async congDiem(
    @Param('userId') userId: string,
    @Body() body: { diem?: number },
  ) {
    return this.userService.congDiemLoyalty(userId, Number(body.diem || 0));
  }
}