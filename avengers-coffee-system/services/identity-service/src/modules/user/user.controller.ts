import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AllowInternal, CurrentUser, Public, Roles } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/auth.types';
import { UserService } from './user.service';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  private ensureSelfOrAdmin(currentUser: AuthUser | null, userId: string) {
    if (currentUser?.isInternal) {
      return;
    }

    const role = String(currentUser?.role || '').toUpperCase();
    if (role === 'ADMIN') {
      return;
    }

    if (currentUser?.sub !== userId) {
      throw new ForbiddenException('Ban khong co quyen truy cap tai nguyen nay');
    }
  }

  @Public()
  @Post('auth/register')
  async register(@Body() body: any) {
    return this.userService.register(body);
  }

  @Public()
  @Post('auth/login')
  async login(@Body() body: any) {
    return this.userService.login(body);
  }

  @AllowInternal()
  @Roles('ADMIN', 'MANAGER')
  @Get('users/workforce')
  async layDanhSachNhanSu(@Query('role') role?: string, @Query('branch_code') branchCode?: string) {
    return this.userService.layDanhSachNhanSu(role, branchCode);
  }

  @Roles('ADMIN')
  @Get('users/admin/accounts')
  async layDanhSachTaiKhoanAdmin(
    @Query('role') role?: string,
    @Query('branch_code') branchCode?: string,
    @Query('q') keyword?: string,
  ) {
    return this.userService.layDanhSachTaiKhoanHeThong({ role, branchCode, keyword });
  }

  @Roles('ADMIN')
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

  @Roles('ADMIN')
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

  @Roles('ADMIN')
  @Delete('users/admin/accounts/:userId')
  async xoaTaiKhoanAdmin(@Param('userId') userId: string) {
    return this.userService.xoaTaiKhoanHeThong(userId);
  }

  @Roles('ADMIN')
  @Get('users/admin/stats')
  async layThongKeAdmin() {
    return this.userService.layThongKeHeThong();
  }

  @Roles('ADMIN')
  @Get('users/admin/branches')
  async layDanhSachChiNhanhAdmin() {
    return this.userService.layDanhSachChiNhanhAdmin();
  }

  @Roles('ADMIN')
  @Post('users/admin/branches')
  async taoChiNhanhAdmin(
    @Body()
    body: {
      ma_chi_nhanh?: string;
      ten_chi_nhanh?: string;
      dia_chi?: string;
      so_dien_thoai?: string;
      trang_thai?: 'ACTIVE' | 'INACTIVE';
    },
  ) {
    return this.userService.taoChiNhanhAdmin(body);
  }

  @Roles('ADMIN')
  @Patch('users/admin/branches/:branchCode')
  async capNhatChiNhanhAdmin(
    @Param('branchCode') branchCode: string,
    @Body()
    body: {
      ten_chi_nhanh?: string;
      dia_chi?: string;
      so_dien_thoai?: string;
      trang_thai?: 'ACTIVE' | 'INACTIVE';
    },
  ) {
    return this.userService.capNhatChiNhanhAdmin(branchCode, body);
  }

  @Roles('ADMIN')
  @Delete('users/admin/branches/:branchCode')
  async xoaChiNhanhAdmin(@Param('branchCode') branchCode: string) {
    return this.userService.xoaChiNhanhAdmin(branchCode);
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Get('users/:userId/profile')
  async layThongTinCaNhan(@Param('userId') userId: string, @CurrentUser() currentUser: AuthUser | null) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.layThongTinCaNhan(userId);
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Patch('users/:userId/profile')
  async capNhatThongTinCaNhan(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Body() body: { hoTen?: string; soDienThoai?: string; avatarUrl?: string },
  ) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.capNhatThongTinCaNhan(userId, body);
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Post('users/:userId/change-password')
  async doiMatKhau(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.doiMatKhau(userId, body);
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Get('users/:userId/addresses')
  async layDanhSachDiaChi(@Param('userId') userId: string, @CurrentUser() currentUser: AuthUser | null) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.layDanhSachDiaChi(userId);
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Post('users/:userId/addresses')
  async themDiaChi(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Body() body: { tenDiaChi?: string; diaChiDayDu?: string; ghiChu?: string; macDinh?: boolean },
  ) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.themDiaChi(userId, body);
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Patch('users/:userId/addresses/:addressId')
  async capNhatDiaChi(
    @Param('userId') userId: string,
    @Param('addressId') addressId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Body() body: { tenDiaChi?: string; diaChiDayDu?: string; ghiChu?: string; macDinh?: boolean },
  ) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.capNhatDiaChi(userId, Number(addressId), body);
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Patch('users/:userId/addresses/:addressId/default')
  async datDiaChiMacDinh(
    @Param('userId') userId: string,
    @Param('addressId') addressId: string,
    @CurrentUser() currentUser: AuthUser | null,
  ) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.datDiaChiMacDinh(userId, Number(addressId));
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Delete('users/:userId/addresses/:addressId')
  async xoaDiaChi(
    @Param('userId') userId: string,
    @Param('addressId') addressId: string,
    @CurrentUser() currentUser: AuthUser | null,
  ) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.xoaDiaChi(userId, Number(addressId));
  }

  @Roles('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  @Get('users/:userId/loyalty')
  async layDiemLoyalty(@Param('userId') userId: string, @CurrentUser() currentUser: AuthUser | null) {
    this.ensureSelfOrAdmin(currentUser, userId);
    return this.userService.layDiemLoyalty(userId);
  }

  @AllowInternal()
  @Roles('ADMIN')
  @Post('users/:userId/loyalty/cong-diem')
  async congDiem(
    @Param('userId') userId: string,
    @Body() body: { diem?: number },
  ) {
    return this.userService.congDiemLoyalty(userId, Number(body.diem || 0));
  }

  // ═══════════════════════════════════════════════════════
  //  PROMOTION / VOUCHER ROUTES
  // ═══════════════════════════════════════════════════════

  @Roles('ADMIN')
  @Get('promotions/admin')
  async layDanhSachKhuyenMaiAdmin() {
    return this.userService.layDanhSachKhuyenMaiAdmin();
  }

  @Roles('ADMIN')
  @Post('promotions/admin')
  async taoKhuyenMaiAdmin(@Body() body: any) {
    return this.userService.taoKhuyenMaiAdmin(body);
  }

  @Roles('ADMIN')
  @Patch('promotions/admin/:code')
  async capNhatKhuyenMaiAdmin(@Param('code') code: string, @Body() body: any) {
    return this.userService.capNhatKhuyenMaiAdmin(code, body);
  }

  @Roles('ADMIN')
  @Delete('promotions/admin/:code')
  async xoaKhuyenMaiAdmin(@Param('code') code: string) {
    return this.userService.xoaKhuyenMaiAdmin(code);
  }

  /** Customer: lấy danh sách voucher đang hiệu lực (truyền ?user_id=xxx để lọc đã dùng) */
  @Public()
  @Get('promotions/vouchers')
  async layVoucherChoKhach(@Query('user_id') userId?: string) {
    return this.userService.layVoucherChoKhach(userId);
  }

  /** Customer: kiểm tra / tính toán mã giảm giá trước khi đặt hàng */
  @Public()
  @Post('promotions/kiem-tra')
  async kiemTraMaKhuyenMai(
    @Body() body: { ma_khuyen_mai?: string; user_id?: string; gia_tri_don?: number },
  ) {
    return this.userService.kiemTraMaKhuyenMai(
      body.ma_khuyen_mai || '',
      body.user_id || '',
      Number(body.gia_tri_don || 0),
    );
  }

  /** Internal: xác nhận đã dùng mã sau khi tạo đơn hàng thành công */
  @AllowInternal()
  @Post('promotions/xac-nhan-su-dung')
  async xacNhanSuDungKhuyenMai(
    @Body() body: { ma_khuyen_mai?: string; user_id?: string; ma_don_hang?: string; so_tien_giam?: number },
  ) {
    return this.userService.xacNhanSuDungKhuyenMai({
      ma_khuyen_mai: body.ma_khuyen_mai || '',
      user_id: body.user_id || '',
      ma_don_hang: body.ma_don_hang || null,
      so_tien_giam: Number(body.so_tien_giam || 0),
    });
  }
}