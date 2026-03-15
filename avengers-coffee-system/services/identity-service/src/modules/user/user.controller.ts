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

  @Get('users/admin/branches')
  async layDanhSachChiNhanhAdmin() {
    return this.userService.layDanhSachChiNhanhAdmin();
  }

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

  @Delete('users/admin/branches/:branchCode')
  async xoaChiNhanhAdmin(@Param('branchCode') branchCode: string) {
    return this.userService.xoaChiNhanhAdmin(branchCode);
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

  // ═══════════════════════════════════════════════════════
  //  PROMOTION / VOUCHER ROUTES
  // ═══════════════════════════════════════════════════════

  @Get('promotions/admin')
  async layDanhSachKhuyenMaiAdmin() {
    return this.userService.layDanhSachKhuyenMaiAdmin();
  }

  @Post('promotions/admin')
  async taoKhuyenMaiAdmin(@Body() body: any) {
    return this.userService.taoKhuyenMaiAdmin(body);
  }

  @Patch('promotions/admin/:code')
  async capNhatKhuyenMaiAdmin(@Param('code') code: string, @Body() body: any) {
    return this.userService.capNhatKhuyenMaiAdmin(code, body);
  }

  @Delete('promotions/admin/:code')
  async xoaKhuyenMaiAdmin(@Param('code') code: string) {
    return this.userService.xoaKhuyenMaiAdmin(code);
  }

  /** Customer: lấy danh sách voucher đang hiệu lực (truyền ?user_id=xxx để lọc đã dùng) */
  @Get('promotions/vouchers')
  async layVoucherChoKhach(@Query('user_id') userId?: string) {
    return this.userService.layVoucherChoKhach(userId);
  }

  /** Customer: kiểm tra / tính toán mã giảm giá trước khi đặt hàng */
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