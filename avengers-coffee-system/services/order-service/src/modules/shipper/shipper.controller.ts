import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ShipperService } from './shipper.service';

@Controller('shippers')
export class ShipperController {
  constructor(private readonly shipperService: ShipperService) {}

  @Post('login')
  async login(@Body() body: { username?: string; password?: string }) {
    return this.shipperService.login(String(body?.username || ''), String(body?.password || ''));
  }

  // ============ PROFILE ============

  @Get(':shipperId/profile')
  async getProfile(@Param('shipperId') shipperId: string) {
    return this.shipperService.getShipperProfile(shipperId);
  }

  @Patch(':shipperId/status')
  async updateStatus(
    @Param('shipperId') shipperId: string,
    @Body() body: { status: 'ACTIVE' | 'INACTIVE' | 'ON_BREAK' },
  ) {
    return this.shipperService.updateShipperStatus(shipperId, body.status);
  }

  @Patch(':shipperId/location')
  async updateLocation(
    @Param('shipperId') shipperId: string,
    @Body() body: { latitude: number; longitude: number },
  ) {
    return this.shipperService.updateShipperLocation(shipperId, body.latitude, body.longitude);
  }

  // ============ DELIVERIES ============

  @Get(':shipperId/deliveries')
  async getAssignedDeliveries(
    @Param('shipperId') shipperId: string,
    @Query('status') status?: string,
  ) {
    return this.shipperService.getAssignedDeliveries(shipperId, status);
  }

  @Get(':shipperId/deliveries/:deliveryId')
  async getDeliveryDetail(
    @Param('shipperId') shipperId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.shipperService.getDeliveryDetail(deliveryId);
  }

  @Post(':shipperId/deliveries/:deliveryId/confirm-pickup')
  async confirmPickup(
    @Param('shipperId') shipperId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.shipperService.confirmPickup(deliveryId, shipperId);
  }

  @Post(':shipperId/deliveries/:deliveryId/start')
  async startDelivery(
    @Param('shipperId') shipperId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: { latitude: number; longitude: number },
  ) {
    return this.shipperService.startDelivery(deliveryId, shipperId, body.latitude, body.longitude);
  }

  @Post(':shipperId/deliveries/:deliveryId/complete')
  async completeDelivery(
    @Param('shipperId') shipperId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: { latitude: number; longitude: number; proof_image_url?: string },
  ) {
    return this.shipperService.completeDelivery(
      deliveryId,
      shipperId,
      body.latitude,
      body.longitude,
      body.proof_image_url,
    );
  }

  @Post(':shipperId/deliveries/:deliveryId/fail')
  async failDelivery(
    @Param('shipperId') shipperId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() body: { reason: string },
  ) {
    return this.shipperService.failDelivery(deliveryId, shipperId, body.reason);
  }

  // ============ STATS & ANALYTICS ============

  @Get(':shipperId/stats')
  async getStats(@Param('shipperId') shipperId: string) {
    return this.shipperService.getDeliveryStats(shipperId);
  }

  @Get(':shipperId/nearby-deliveries')
  async getNearbyDeliveries(
    @Param('shipperId') shipperId: string,
    @Query('radius') radius: string = '5',
  ) {
    return this.shipperService.getNearbyDeliveries(shipperId, Number(radius));
  }
}
