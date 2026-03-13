import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AppService } from './app.service';
import { NotificationService } from './modules/notification/notification.service';
import { ThanhToanService } from './modules/thanh-toan/thanh-toan.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly thanhToanService: ThanhToanService,
    private readonly notificationService: NotificationService,
  ) {}

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

  @Get('customers/:customerId/orders')
  getOrders(
    @Param('customerId') customerId: string,
    @Query('status') status?: string,
    @Query('payment_status') paymentStatus?: string,
    @Query('payment_method') paymentMethod?: string,
    @Query('q') keyword?: string,
  ) {
    return this.thanhToanService.layLichSuDonHang(customerId, {
      status,
      paymentStatus,
      paymentMethod,
      keyword,
    });
  }

  @Patch('customers/:customerId/orders/:orderId')
  updateOrder(
    @Param('customerId') customerId: string,
    @Param('orderId') orderId: string,
    @Body()
    payload: {
      dia_chi_giao_hang?: string;
      khung_gio_giao?: string;
      ghi_chu?: string;
      items?: Array<{ id: number; so_luong: number }>;
    },
  ) {
    return this.thanhToanService.capNhatThongTinDonHang(customerId, orderId, payload);
  }

  @Get('customers/:customerId/notifications')
  getNotifications(
    @Param('customerId') customerId: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationService.layDanhSachThongBao(customerId, {
      chiLayChuaDoc: unreadOnly === 'true',
      limit: Number(limit || 20),
    });
  }

  @Patch('customers/:customerId/notifications/:notificationId/read')
  markNotificationRead(
    @Param('customerId') customerId: string,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationService.danhDauDaDoc(customerId, Number(notificationId));
  }

  @Patch('customers/:customerId/notifications/read-all')
  markAllNotificationsRead(@Param('customerId') customerId: string) {
    return this.notificationService.danhDauTatCaDaDoc(customerId);
  }

  @Patch('customers/:customerId/orders/:orderId/cancel')
  cancelOrder(
    @Param('customerId') customerId: string,
    @Param('orderId') orderId: string,
    @Body() payload: { reason?: string },
  ) {
    return this.thanhToanService.huyDonHang(customerId, orderId, payload.reason);
  }

  @Patch('customers/:customerId/orders/:orderId/status')
  updateStatus(
    @Param('customerId') customerId: string,
    @Param('orderId') orderId: string,
    @Body() payload: { status: string },
  ) {
    return this.thanhToanService.capNhatTrangThaiDonHang(customerId, orderId, payload.status);
  }

  @Get('staff/orders')
  getStaffOrders(
    @Query('status') status?: string,
    @Query('payment_status') paymentStatus?: string,
    @Query('payment_method') paymentMethod?: string,
    @Query('q') keyword?: string,
  ) {
    return this.thanhToanService.layDanhSachDonHangChoStaff({
      status,
      paymentStatus,
      paymentMethod,
      keyword,
    });
  }

  @Patch('staff/orders/:orderId/status')
  updateStaffOrderStatus(
    @Param('orderId') orderId: string,
    @Body() payload: { status: string },
  ) {
    return this.thanhToanService.capNhatTrangThaiDonHangChoStaff(orderId, payload.status);
  }

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
      phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG' | 'NGAN_HANG_QR' | 'VNPAY';
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

  @Get('staff/shifts/preview')
  previewShift(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cash_open') cashOpen?: string,
    @Query('cash_close') cashClose?: string,
  ) {
    return this.thanhToanService.xemTruocDoiSoatCa({
      from,
      to,
      cashOpen,
      cashClose,
    });
  }

  @Post('staff/shifts/close')
  closeShift(
    @Body()
    payload: {
      from: string;
      to: string;
      cash_open: number;
      cash_close: number;
      note?: string;
      staff_name?: string;
    },
  ) {
    return this.thanhToanService.chotCaLamViec(payload);
  }

  @Get('staff/shifts/history')
  getShiftHistory(@Query('limit') limit?: string) {
    return this.thanhToanService.layLichSuChotCa(Number(limit || 20));
  }

  @Patch('staff/shifts/:id')
  updateShift(
    @Param('id') id: string,
    @Body() payload: { cash_open?: number; cash_close?: number; note?: string; staff_name?: string },
  ) {
    return this.thanhToanService.suaCaLamViec(id, payload);
  }

  @Delete('staff/shifts/:id')
  deleteShift(@Param('id') id: string) {
    return this.thanhToanService.xoaCaLamViec(id);
  }
}
