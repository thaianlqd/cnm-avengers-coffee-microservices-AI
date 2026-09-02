import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public, Roles } from '../../auth/auth.decorators';
import type { AuthUser } from '../../auth/auth.types';
import { FranchiseService } from './franchise.service';

@Controller('franchise')
export class FranchiseController {
  constructor(private readonly franchiseService: FranchiseService) {}

  // ─── UC-B01: Hồ sơ đăng ký ───────────────────────
  /** Public: Bất kỳ ai cũng có thể nộp hồ sơ */
  @Public()
  @Post('dang-ky')
  async dangKy(@Body() body: any) {
    return this.franchiseService.dangKyHoSo(body);
  }

  @Public()
  @Get('ho-so/tra-cuu')
  async traCuuHoSo(@Query('so_dien_thoai') soDienThoai: string) {
    return this.franchiseService.traCuuHoSo(soDienThoai);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Get('ho-so')
  async layDanhSachHoSo(@Query('trang_thai') trang_thai?: string) {
    return this.franchiseService.layDanhSachHoSo(trang_thai);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Patch('ho-so/:id/yeu-cau-coc')
  async yeuCauDatCoc(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.franchiseService.yeuCauDatCoc(id, user.sub);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Patch('ho-so/:id/duyet')
  async duyetHoSo(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.franchiseService.duyetHoSo(id, user.sub);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Patch('ho-so/:id/tu-choi')
  async tuChoiHoSo(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.franchiseService.tuChoiHoSo(id, user.sub, body.ly_do);
  }

  @Public()
  @Patch('ho-so/:id/huy')
  async huyHoSoDangKy(@Param('id') id: string) {
    return this.franchiseService.huyHoSoDangKy(id);
  }

  // ─── UC-B02: Kiosk & Hợp đồng ─────────────────────
  @Public()
  @Get('kiosk/public')
  async layDanhSachKioskPublic() {
    return this.franchiseService.layDanhSachKioskPublic();
  }

  @Roles('ADMIN', 'ACCOUNTANT', 'MANAGER')
  @Get('kiosk')
  async layDanhSachKiosk() {
    return this.franchiseService.layDanhSachKiosk();
  }

  @Roles('FRANCHISEE')
  @Get('kiosk/cua-toi')
  async layKioskCuaToi(@CurrentUser() user: AuthUser) {
    return this.franchiseService.layKioskCuaToi(user.sub);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Post('kiosk/:id/hop-dong')
  async taoHopDong(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthUser) {
    return this.franchiseService.taoHopDong(id, body, user.sub);
  }

  @Roles('ADMIN', 'FRANCHISEE')
  @Patch('kiosk/:id/khai-truong')
  async xacNhanKhaiTruong(@Param('id') id: string) {
    return this.franchiseService.xacNhanKhaiTruong(id);
  }

  // ─── UC-B03: Đơn mua combo ─────────────────────────
  @Roles('ADMIN', 'FRANCHISEE', 'ACCOUNTANT')
  @Get('combo')
  async layDanhSachCombo() {
    return this.franchiseService.layDanhSachCombo();
  }

  @Roles('FRANCHISEE')
  @Post('don-mua-combo')
  async datMuaCombo(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.franchiseService.datMuaCombo(user.sub, body);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Get('don-mua-combo')
  async layDanhSachDon(@Query('trang_thai') trang_thai?: string, @Query('kiosk_id') kiosk_id?: string) {
    return this.franchiseService.layDanhSachDonMuaCombo(trang_thai, kiosk_id);
  }

  @Roles('FRANCHISEE')
  @Get('don-mua-combo/cua-toi')
  async layDonCuaToi(@CurrentUser() user: AuthUser) {
    return this.franchiseService.layDonMuaComboCuaToi(user.sub);
  }

  @Public()
  @Get('vnpay/return')
  async vnpayReturn(@Query() query: Record<string, string>, @Res() res: Response) {
    const result = await this.franchiseService.ketQuaVnpay(query);
    const webAdminUrl = process.env.WEB_ADMIN_URL || 'http://localhost:5174';
    // Redirect về trang FranchiseePortal, tab order
    const redirectUrl = `${webAdminUrl}/?tab=order&vnpay=${result.success ? 'success' : 'failed'}`;
    return res.redirect(302, redirectUrl);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Patch('don-mua-combo/:id/giao')
  async xacNhanGiao(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.franchiseService.xacNhanDaGiaoCombo(id, user.sub, body.ghi_chu);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Patch('don-mua-combo/:id/tam-hoan')
  async tamHoanDon(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.franchiseService.tamHoanDon(id, user.sub, body.ghi_chu || 'Kho tạm thời hết hàng');
  }

  // ─── UC-B04: Công nợ ───────────────────────────────
  @Roles('ADMIN', 'ACCOUNTANT')
  @Get('cong-no')
  async layCongNo(@Query('trang_thai') trang_thai?: string, @Query('kiosk_id') kiosk_id?: string) {
    return this.franchiseService.layDanhSachCongNo(trang_thai, kiosk_id);
  }

  @Roles('FRANCHISEE')
  @Get('cong-no/cua-toi')
  async layCongNoCuaToi(@CurrentUser() user: AuthUser) {
    return this.franchiseService.layDanhSachCongNoCuaToi(user.sub);
  }

  @Roles('ACCOUNTANT', 'ADMIN')
  @Patch('cong-no/:id/xac-nhan-thanh-toan')
  async xacNhanThanhToan(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.franchiseService.xacNhanThanhToanCongNo(id, user.sub, body.ghi_chu);
  }

  @Roles('FRANCHISEE')
  @Patch('cong-no/:id/thanh-toan-vi')
  async thanhToanVi(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.franchiseService.thanhToanViCongNo(id, user.sub);
  }

  // ─── UC-B05: Royalty ───────────────────────────────
  @Roles('ADMIN', 'ACCOUNTANT')
  @Get('royalty')
  async layRoyalty(@Query('thang') thang?: string, @Query('kiosk_id') kiosk_id?: string) {
    return this.franchiseService.layDanhSachRoyalty(thang, kiosk_id);
  }

  @Roles('FRANCHISEE')
  @Get('royalty/cua-toi')
  async layRoyaltyCuaToi(@CurrentUser() user: AuthUser) {
    return this.franchiseService.layRoyaltyCuaToi(user.sub);
  }

  @Roles('ADMIN')
  @Post('royalty/tinh-thang')
  async tinhRoyaltyThang(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.franchiseService.tinhRoyaltyThang(user.sub, body.thang);
  }

  @Roles('ACCOUNTANT', 'ADMIN')
  @Patch('royalty/:id/xac-nhan')
  async xacNhanRoyalty(@Param('id') id: string, @CurrentUser() user: AuthUser, @Body() body: any) {
    return this.franchiseService.xacNhanRoyalty(id, user.sub, body.ghi_chu);
  }

  @Roles('ACCOUNTANT', 'ADMIN')
  @Patch('royalty/:id/thanh-toan')
  async ghiNhanThanhToanRoyalty(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.franchiseService.ghiNhanThanhToanRoyalty(id, user.sub);
  }

  // ─── UC-B06: Đối soát ─────────────────────────────
  @Roles('ADMIN', 'ACCOUNTANT')
  @Get('doi-soat')
  async layKetQuaDoiSoat(@Query('kiosk_id') kiosk_id?: string) {
    return this.franchiseService.layKetQuaDoiSoat(kiosk_id);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Post('doi-soat/chay-thang-nay')
  async chayDoiSoat(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.franchiseService.chayDoiSoat(user.sub, body.ky);
  }

  // ─── Cập nhật Trạng thái Kiosk (Thủ công) ──────────
  @Roles('ADMIN', 'ACCOUNTANT')
  @Patch('kiosk/:id/trang-thai')
  async capNhatTrangThaiKiosk(@Param('id') id: string, @Body() body: any) {
    return this.franchiseService.capNhatTrangThaiKiosk(id, body.trang_thai);
  }

  // ─── Xử lý nợ quá hạn (Cron demo) ────────────────
  @Roles('ADMIN', 'ACCOUNTANT')
  @Post('cron/xu-ly-no-qua-han')
  async cronXuLyNoQuaHan() {
    return this.franchiseService.xuLyNoQuaHan();
  }

  // ─── Thống kê Admin ──────────────────────────────
  @Get('dashboard/admin')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT')
  async thongKeAdmin() {
    return this.franchiseService.thongKeAdmin();
  }

  // ─── Lập Biên Bản ─────────────────────────────
  @Roles('ADMIN')
  @Post('doi-soat/:kiosk_id/lap-bien-ban')
  async lapBienBan(@Param('kiosk_id') kioskId: string, @Body() body: any, @CurrentUser() user: AuthUser) {
    return this.franchiseService.lapBienBan(kioskId, user.sub, body);
  }

  // ─── DEV TOOL: Tua Nhanh Nợ ────────────────────
  @Roles('ADMIN', 'ACCOUNTANT')
  @Post('cong-no/:id/tua-nhanh')
  async tuaNhanhNo(@Param('id') id: string, @Body() body: any) {
    return this.franchiseService.tuaNhanhNo(id, body.days || 8);
  }

  // ─── Gia Hạn & Chấm Dứt HĐ ──────────────────────
  @Roles('ADMIN', 'ACCOUNTANT')
  @Post('kiosk/:id/gia-han')
  async giaHanHopDong(@Param('id') kioskId: string, @Body() body: any, @CurrentUser() user: AuthUser) {
    return this.franchiseService.giaHanHopDong(kioskId, user.sub, body.ngay_het_han_moi);
  }

  @Roles('ADMIN', 'ACCOUNTANT')
  @Post('kiosk/:id/cham-dut')
  async chamDutHopDong(@Param('id') kioskId: string, @CurrentUser() user: AuthUser) {
    return this.franchiseService.chamDutHopDong(kioskId, user.sub);
  }

  // ─── Audit Log ──────────────────────────────────
  @Roles('ADMIN')
  @Get('audit-logs')
  async getAuditLogs() {
    const logs = await this.franchiseService.getAuditLogs();
    return { success: true, data: logs };
  }
}
