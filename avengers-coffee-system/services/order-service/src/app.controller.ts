import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, Roles } from './auth/auth.decorators';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import type { AuthUser } from './auth/auth.types';
import { RealtimeAnalyticsService } from './infrastructure/analytics/realtime-analytics.service';
import { AppService } from './app.service';
import { NotificationService } from './modules/notification/notification.service';
import { ThanhToanService } from './modules/thanh-toan/thanh-toan.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly thanhToanService: ThanhToanService,
    private readonly notificationService: NotificationService,
    private readonly realtimeAnalyticsService: RealtimeAnalyticsService,
  ) {}

  private ensureSelfOrAdmin(currentUser: AuthUser | null, userId: string) {
    const role = String(currentUser?.role || '').toUpperCase();
    if (role === 'ADMIN') {
      return;
    }

    if (currentUser?.sub !== userId) {
      throw new ForbiddenException('Ban khong co quyen truy cap tai nguyen nay');
    }
  }

  private ensureStaffSelfOrElevated(currentUser: AuthUser | null, staffUsername: string) {
    const role = String(currentUser?.role || '').toUpperCase();
    if (['ADMIN', 'MANAGER'].includes(role)) {
      return;
    }

    const normalizedUsername = String(staffUsername || '').trim().toLowerCase();
    const currentUsername = String(currentUser?.username || '').trim().toLowerCase();
    if (!normalizedUsername || normalizedUsername !== currentUsername) {
      throw new ForbiddenException('Ban chi duoc truy cap lich lam cua chinh minh');
    }
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('customers/:customerId/cart')
  getCart(@Param('customerId') customerId: string) {
    return this.appService.getCart(customerId);
  }

  @Post('customers/:customerId/cart/items')
  addCartItem(
    @Param('customerId') customerId: string,
    @Body()
    payload: {
      itemId: string;
      name: string;
      price: number;
      quantity: number;
      note?: string;
    },
  ) {
    return this.appService.addCartItem(customerId, payload);
  }

  @Patch('customers/:customerId/cart/items/:itemId')
  updateCartItem(
    @Param('customerId') customerId: string,
    @Param('itemId') itemId: string,
    @Body() payload: { quantity: number; note?: string },
  ) {
    return this.appService.updateCartItem(customerId, itemId, payload);
  }

  @Delete('customers/:customerId/cart/items/:itemId')
  removeCartItem(@Param('customerId') customerId: string, @Param('itemId') itemId: string) {
    return this.appService.removeCartItem(customerId, itemId);
  }

  @Post('customers/:customerId/orders')
  placeOrder(
    @Param('customerId') customerId: string,
    @Body() payload: { deliverySlot: string; address: string; note?: string },
  ) {
    return this.appService.placeOrder(customerId, payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  @Get('customers/:customerId/orders')
  getOrders(
    @Param('customerId') customerId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Query('status') status?: string,
    @Query('payment_status') paymentStatus?: string,
    @Query('payment_method') paymentMethod?: string,
    @Query('q') keyword?: string,
  ) {
    this.ensureSelfOrAdmin(currentUser, customerId);
    return this.thanhToanService.layLichSuDonHang(customerId, {
      status,
      paymentStatus,
      paymentMethod,
      keyword,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  @Patch('customers/:customerId/orders/:orderId')
  updateOrder(
    @Param('customerId') customerId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Body()
    payload: {
      dia_chi_giao_hang?: string;
      khung_gio_giao?: string;
      ghi_chu?: string;
      items?: Array<{ id: number; so_luong: number }>;
    },
  ) {
    this.ensureSelfOrAdmin(currentUser, customerId);
    return this.thanhToanService.capNhatThongTinDonHang(customerId, orderId, payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  @Get('customers/:customerId/notifications')
  getNotifications(
    @Param('customerId') customerId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureSelfOrAdmin(currentUser, customerId);
    return this.notificationService.layDanhSachThongBao(customerId, {
      chiLayChuaDoc: unreadOnly === 'true',
      limit: Number(limit || 20),
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  @Patch('customers/:customerId/notifications/:notificationId/read')
  markNotificationRead(
    @Param('customerId') customerId: string,
    @Param('notificationId') notificationId: string,
    @CurrentUser() currentUser: AuthUser | null,
  ) {
    this.ensureSelfOrAdmin(currentUser, customerId);
    return this.notificationService.danhDauDaDoc(customerId, Number(notificationId));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  @Patch('customers/:customerId/notifications/read-all')
  markAllNotificationsRead(@Param('customerId') customerId: string, @CurrentUser() currentUser: AuthUser | null) {
    this.ensureSelfOrAdmin(currentUser, customerId);
    return this.notificationService.danhDauTatCaDaDoc(customerId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  @Patch('customers/:customerId/orders/:orderId/cancel')
  cancelOrder(
    @Param('customerId') customerId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Body() payload: { reason?: string },
  ) {
    this.ensureSelfOrAdmin(currentUser, customerId);
    return this.thanhToanService.huyDonHang(customerId, orderId, payload.reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER', 'ADMIN')
  @Patch('customers/:customerId/orders/:orderId/status')
  updateStatus(
    @Param('customerId') customerId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() currentUser: AuthUser | null,
    @Body() payload: { status: string },
  ) {
    this.ensureSelfOrAdmin(currentUser, customerId);
    return this.thanhToanService.capNhatTrangThaiDonHang(customerId, orderId, payload.status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Get('staff/orders')
  getStaffOrders(
    @Query('status') status?: string,
    @Query('payment_status') paymentStatus?: string,
    @Query('payment_method') paymentMethod?: string,
    @Query('q') keyword?: string,
    @Query('branch_code') branchCode?: string,
  ) {
    return this.thanhToanService.layDanhSachDonHangChoStaff({
      status,
      paymentStatus,
      paymentMethod,
      keyword,
      branchCode,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Patch('staff/orders/:orderId/status')
  updateStaffOrderStatus(
    @Param('orderId') orderId: string,
    @Body() payload: { status: string; branch_code?: string },
  ) {
    return this.thanhToanService.capNhatTrangThaiDonHangChoStaff(orderId, payload.status, payload.branch_code);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Patch('staff/orders/:orderId')
  updateStaffOrder(
    @Param('orderId') orderId: string,
    @Body()
    payload: {
      dia_chi_giao_hang?: string;
      khung_gio_giao?: string;
      ghi_chu?: string;
      ten_khach_hang?: string;
      ma_ban?: string;
      tien_khach_dua?: number;
      branch_code?: string;
      items?: Array<{
        ma_san_pham: number;
        ten_san_pham: string;
        so_luong: number;
        gia_ban: number;
      }>;
    },
  ) {
    return this.thanhToanService.capNhatThongTinDonHangChoStaff(orderId, payload.branch_code, payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Delete('staff/orders/:orderId')
  deleteStaffOrder(
    @Param('orderId') orderId: string,
    @Query('branch_code') branchCode?: string,
    @Query('reason') reason?: string,
  ) {
    return this.thanhToanService.xoaDonHangChoStaff(orderId, branchCode, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Post('staff/orders')
  createStaffOrder(
    @Req() req: Request,
    @Body()
    payload: {
      ma_nguoi_dung?: string;
      ten_khach_hang?: string;
      ten_thu_ngan?: string;
      loai_don_hang: 'TAI_CHO' | 'MANG_DI';
      ma_ban?: string;
      ghi_chu?: string;
      tien_khach_dua?: number;
      phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG' | 'NGAN_HANG_QR' | 'VNPAY';
      branch_code?: string;
      items: Array<{
        ma_san_pham: number;
        ten_san_pham: string;
        so_luong: number;
        gia_ban: number;
      }>;
    },
  ) {
    return this.thanhToanService.taoDonTaiQuayChoStaff(payload, req.ip || '127.0.0.1');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Get('staff/shifts/preview')
  previewShift(
    @Query('shift_date') shiftDate?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cash_open') cashOpen?: string,
    @Query('cash_close') cashClose?: string,
    @Query('branch_code') branchCode?: string,
  ) {
    return this.thanhToanService.xemTruocDoiSoatCa({
      shiftDate,
      from,
      to,
      cashOpen,
      cashClose,
      branchCode,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Post('staff/shifts/close')
  closeShift(
    @Body()
    payload: {
      shift_date?: string;
      from: string;
      to: string;
      cash_open: number;
      cash_close: number;
      note?: string;
      staff_name?: string;
      branch_code?: string;
    },
  ) {
    return this.thanhToanService.chotCaLamViec(payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Get('staff/shifts/history')
  getShiftHistory(@Query('limit') limit?: string, @Query('branch_code') branchCode?: string) {
    return this.thanhToanService.layLichSuChotCa(Number(limit || 20), branchCode);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Patch('staff/shifts/:id')
  updateShift(
    @Param('id') id: string,
    @Body() payload: { cash_open?: number; cash_close?: number; note?: string; staff_name?: string; branch_code?: string },
  ) {
    return this.thanhToanService.suaCaLamViec(id, payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Delete('staff/shifts/:id')
  deleteShift(@Param('id') id: string, @Query('branch_code') branchCode?: string) {
    return this.thanhToanService.xoaCaLamViec(id, branchCode);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Patch('manager/shifts/:id/approval')
  approveShiftReconciliation(
    @Param('id') id: string,
    @Body() payload: { status: 'APPROVED' | 'REJECTED'; manager_name?: string; approval_note?: string; branch_code?: string },
  ) {
    return this.thanhToanService.pheDuyetDoiSoatCaLamViec(id, payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Post('manager/work-shifts')
  createWorkShift(
    @Body()
    payload: {
      staff_username: string;
      staff_name?: string;
      shift_date: string;
      shift_template?: '2_CA' | '3_CA';
      shift_code: 'SANG' | 'CHIEU' | 'TOI';
      shift_codes?: Array<'SANG' | 'CHIEU' | 'TOI'>;
      note?: string;
      manager_username?: string;
      branch_code?: string;
    },
  ) {
    return this.thanhToanService.taoLichLamViecChoManager(payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Get('manager/work-shifts')
  getWorkShiftsForManager(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('staff_username') staff_username?: string,
    @Query('branch_code') branchCode?: string,
  ) {
    return this.thanhToanService.layDanhSachLichLamViecChoManager({
      from,
      to,
      staff_username,
      branchCode,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Patch('manager/work-shifts/:id/attendance')
  updateWorkShiftAttendance(
    @Param('id') id: string,
    @Body()
    payload: {
      attendance_status?: 'ASSIGNED' | 'PRESENT' | 'ABSENT';
      check_in_at?: string | null;
      check_out_at?: string | null;
      note?: string;
      branch_code?: string;
    },
  ) {
    return this.thanhToanService.capNhatChamCongCaLamViecChoManager(id, payload);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Delete('manager/work-shifts/:id')
  deleteWorkShift(@Param('id') id: string, @Query('branch_code') branchCode?: string) {
    return this.thanhToanService.xoaLichLamViecChoManager(id, branchCode);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Get('staff/work-shifts')
  getWorkShiftsForStaff(
    @CurrentUser() currentUser: AuthUser | null,
    @Query('staff_username') staffUsername?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branch_code') branchCode?: string,
  ) {
    const resolvedStaffUsername = staffUsername || currentUser?.username || '';
    this.ensureStaffSelfOrElevated(currentUser, resolvedStaffUsername);
    return this.thanhToanService.layLichLamViecChoStaff(resolvedStaffUsername, from, to, branchCode);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'MANAGER', 'ADMIN')
  @Get('staff/analytics/realtime')
  getRealtimeAnalytics(@Query('branch_code') branchCode?: string) {
    return this.realtimeAnalyticsService.getSnapshot(branchCode);
  }
}
