import { Body, Controller, Delete, Get, Param, Post, Query, HttpException, HttpStatus } from '@nestjs/common';
import { LalamoveService } from './lalamove.service';

/**
 * Controller cho Lalamove integration.
 * Prefix: /shippers/delivery/lalamove (tận dụng gateway proxy /shippers)
 */
@Controller('shippers/delivery/lalamove')
export class LalamoveController {
  constructor(private readonly lalamoveService: LalamoveService) { }

  @Get('test-market')
  async testMarket() {
    try {
      const vnCities = await this.lalamoveService.testCities('VN');
      const hkCities = await this.lalamoveService.testCities('HK');
      return { success: true, vn: vnCities, hk: hkCities };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  @Get('test-quotation-hk')
  async testQuotationHK() {
    try {
      const result = await this.lalamoveService.testQuotationHK();
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  /**
   * POST /shippers/delivery/lalamove/quotation
   * Lấy báo giá từ Lalamove.
   */
  @Post('quotation')
  async getQuotation(@Body() body: any) {
    try {
      const result = await this.lalamoveService.getQuotation(
        body.pickup_address,
        body.pickup_lat,
        body.pickup_lng,
        body.delivery_address,
        body.delivery_lat,
        body.delivery_lng,
      );
      return { success: true, data: result };
    } catch (error: any) {
      console.error(error);
      throw new HttpException(error.message || 'Lỗi khi lấy báo giá Lalamove', HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * POST /shippers/delivery/lalamove/order
   * Tạo đơn giao hàng qua Lalamove.
   */
  @Post('order')
  async placeOrder(
    @Body()
    body: {
      quotation_id: string;
      sender_stop_id: string;
      recipient_stop_id: string;
      sender_name: string;
      sender_phone: string;
      recipient_name: string;
      recipient_phone: string;
      pickup_address: string;
      pickup_lat: string;
      pickup_lng: string;
      delivery_address: string;
      delivery_lat: string;
      delivery_lng: string;
      remarks?: string;
    },
  ) {
    const result = await this.lalamoveService.placeOrder(
      body.quotation_id,
      body.sender_stop_id,
      body.recipient_stop_id,
      body.sender_name,
      body.sender_phone,
      body.recipient_name,
      body.recipient_phone,
      body.pickup_address,
      body.pickup_lat,
      body.pickup_lng,
      body.delivery_address,
      body.delivery_lat,
      body.delivery_lng,
      body.remarks,
    );
    return { success: true, data: result };
  }

  /**
   * GET /shippers/delivery/lalamove/order/:orderId
   * Xem trạng thái đơn Lalamove.
   */
  @Get('order/:orderId')
  async getOrderDetail(@Param('orderId') orderId: string) {
    const result = await this.lalamoveService.getOrderDetail(orderId);
    return { success: true, data: result };
  }

  /**
   * GET /shippers/delivery/lalamove/order/:orderId/driver/:driverId/location
   * Vị trí tài xế Lalamove.
   */
  @Get('order/:orderId/driver/:driverId/location')
  async getDriverLocation(
    @Param('orderId') orderId: string,
    @Param('driverId') driverId: string,
  ) {
    const result = await this.lalamoveService.getDriverLocation(orderId, driverId);
    return { success: true, data: result };
  }

  /**
   * DELETE /shippers/delivery/lalamove/order/:orderId
   * Hủy đơn Lalamove.
   */
  @Delete('order/:orderId')
  async cancelOrder(@Param('orderId') orderId: string) {
    const result = await this.lalamoveService.cancelOrder(orderId);
    return { success: true, data: result };
  }
}
