import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DeliveryTrackingService } from './delivery-tracking.service';

/**
 * DeliveryTrackingController — API cho customer tracking.
 * Prefix: /shippers/delivery/tracking (tận dụng gateway proxy /shippers)
 */
@Controller('shippers/delivery/tracking')
export class DeliveryTrackingController {
  constructor(private readonly trackingService: DeliveryTrackingService) {}

  /**
   * POST /shippers/delivery/tracking/create
   * Tạo tracking record khi đặt hàng (gọi từ checkout flow).
   */
  @Post('create')
  async createTracking(
    @Body()
    body: {
      ma_don_hang: string;
      delivery_mode: 'GIAO_TAN_NOI' | 'LAY_TAI_QUAN' | 'DUNG_TAI_CHO';
      delivery_method?: 'INTERNAL' | 'LALAMOVE';
      branch_code?: string;
      table_number?: string;
      pickup_time?: string;
      customer_name?: string;
      customer_phone?: string;
      delivery_address?: string;
      store_latitude?: number;
      store_longitude?: number;
      destination_latitude?: number;
      destination_longitude?: number;
    },
  ) {
    const tracking = await this.trackingService.createTracking({
      ...body,
      pickup_time: body.pickup_time ? new Date(body.pickup_time) : undefined,
    });
    return { success: true, tracking };
  }

  /**
   * GET /shippers/delivery/tracking/:maDonHang
   * Lấy tracking info đầy đủ (timeline + shipper location + order detail).
   */
  @Get(':maDonHang')
  async getTrackingInfo(@Param('maDonHang') maDonHang: string) {
    return this.trackingService.getTrackingInfo(maDonHang);
  }

  /**
   * GET /shippers/delivery/tracking/by-code/lookup?code=AC-XXXXX
   * Tra cứu đơn hàng bằng mã tracking code (cho khách vãng lai).
   */
  @Get('by-code/lookup')
  async lookupByCode(@Query('code') code: string) {
    return this.trackingService.lookupByCode(code);
  }

  /**
   * GET /shippers/delivery/tracking/:maDonHang/shipper-location
   * Lấy vị trí shipper real-time.
   */
  @Get(':maDonHang/shipper-location')
  async getShipperLocation(@Param('maDonHang') maDonHang: string) {
    return this.trackingService.getShipperLocation(maDonHang);
  }

  /**
   * GET /shippers/delivery/tracking/user/:maNguoiDung/all
   * Lấy tất cả tracking records của 1 user.
   */
  @Get('user/:maNguoiDung/all')
  async getTrackingsByUser(@Param('maNguoiDung') maNguoiDung: string) {
    return this.trackingService.getTrackingsByUser(maNguoiDung);
  }

  /**
   * POST /shippers/delivery/tracking/:maDonHang/lalamove-info
   * Cập nhật thông tin Lalamove cho tracking record.
   */
  @Post(':maDonHang/lalamove-info')
  async updateLalamoveInfo(
    @Param('maDonHang') maDonHang: string,
    @Body() body: { lalamove_order_id: string; share_link?: string },
  ) {
    await this.trackingService.updateLalamoveInfo(maDonHang, body.lalamove_order_id, body.share_link);
    return { success: true };
  }

  /**
   * POST /shippers/delivery/tracking/:maDonHang/shipper-delivery-id
   * Link tracking với shipper_delivery record.
   */
  @Post(':maDonHang/shipper-delivery-id')
  async updateShipperDeliveryId(
    @Param('maDonHang') maDonHang: string,
    @Body() body: { shipper_delivery_id: string },
  ) {
    await this.trackingService.updateShipperDeliveryId(maDonHang, body.shipper_delivery_id);
    return { success: true };
  }
}
