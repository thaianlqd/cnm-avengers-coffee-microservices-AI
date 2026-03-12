import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
}
