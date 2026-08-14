import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ShipperService } from './shipper.service';

@Controller('shippers')
export class ShipperController {
  constructor(private readonly shipperService: ShipperService) {}

  @Post('login')
  async login(@Body() body: { username?: string; password?: string }) {
    return this.shipperService.login(String(body?.username || ''), String(body?.password || ''));
  }

  // ============ LIST SHIPPERS & CONFIG & ADMIN ============

  @Get()
  async getShippers(
    @Query('branch_code') branchCode?: string,
    @Query('status') status?: string,
    @Query('q') searchKeyword?: string,
  ) {
    return this.shipperService.getAllShippers(branchCode, status, searchKeyword);
  }

  @Get('all')
  async getAllShippers(@Query('branch_code') branchCode?: string) {
    return this.shipperService.getAllShippers(branchCode);
  }

  @Get('config')
  async getDispatchConfig() {
    return this.shipperService.getDispatchConfig();
  }

  @Put('config')
  async updateDispatchConfig(@Body() body: any) {
    return this.shipperService.updateDispatchConfig(body);
  }

  @Put('commission-rate')
  @Post('commission-rate')
  async setCommissionRate(@Body() body: { rate_percent: number }) {
    return this.shipperService.setCommissionRate(body.rate_percent);
  }

  @Get('kpi')
  async getKpiData(@Query('range') range?: string) {
    return this.shipperService.getKpiData(range);
  }

  @Get('finance')
  async getFinanceData(@Query('limit') limit?: string) {
    return this.shipperService.getFinanceData(Number(limit || 20));
  }

  @Get('exceptions')
  async getExceptions(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.shipperService.getExceptions(status, Number(limit || 50));
  }

  @Post('exceptions/:id/:action')
  async handleExceptionAction(
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: { manager_note?: string },
  ) {
    return this.shipperService.handleExceptionAction(id, action, body?.manager_note);
  }

  @Post()
  async createShipper(@Body() body: any) {
    return this.shipperService.createShipper(body);
  }

  // ============ AVAILABLE ORDERS POOL ============

  /**
   * GET /shippers/available-orders?branch_code=MAC_DINH_CHI
   * Lấy danh sách đơn DANG_GIAO chưa có shipper → Shipper nhìn thấy và tự nhận
   */
  @Get('available-orders')
  async getAvailableOrders(@Query('branch_code') branchCode?: string) {
    return this.shipperService.getAvailableOrders(branchCode);
  }

  /**
   * POST /shippers/orders/:orderId/mark-ready
   * Staff bấm "Shipper Nội Bộ" → Chuyển đơn sang DANG_GIAO để Shipper pool thấy
   */
  @Post('orders/:orderId/mark-ready')
  async markOrderReadyForDelivery(@Param('orderId') orderId: string) {
    return this.shipperService.markOrderReadyForDelivery(orderId);
  }

  // ============ MANAGER: Assign order manually ============

  @Post('assign-order')
  async assignOrderToShipper(
    @Body() body: { ma_don_hang: string; shipper_id: string; manager_id?: string },
  ) {
    return this.shipperService.assignOrderToShipper(body.ma_don_hang, body.shipper_id, body.manager_id || 'system');
  }

  @Post(':shipperId/deliveries')
  async assignDeliveryToShipper(
    @Param('shipperId') shipperId: string,
    @Body() body: { ma_don_hang: string; manager_id?: string },
  ) {
    return this.shipperService.assignOrderToShipper(body.ma_don_hang, shipperId, body.manager_id || 'system');
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

  /**
   * POST /shippers/:shipperId/accept/:maDonHang
   * Shipper tự nhận đơn từ pool công khai → tạo ShipperDelivery
   */
  @Post(':shipperId/accept/:maDonHang')
  async acceptOrder(
    @Param('shipperId') shipperId: string,
    @Param('maDonHang') maDonHang: string,
  ) {
    return this.shipperService.acceptOrder(shipperId, maDonHang);
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
    @Body() body: { latitude: number; longitude: number; proof_image_url?: string; is_batched?: boolean },
  ) {
    return this.shipperService.completeDelivery(deliveryId, shipperId, body.latitude, body.longitude, body.proof_image_url, body.is_batched);
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

  // ============ WALLET, SCHEDULE, EXCEPTIONS, VEHICLE, NOTIFICATIONS ============

  @Get(':shipperId/wallet')
  async getWallet(@Param('shipperId') shipperId: string) {
    return this.shipperService.getWallet(shipperId);
  }

  @Get(':shipperId/schedule')
  async getSchedule(@Param('shipperId') shipperId: string) {
    return this.shipperService.getSchedule(shipperId);
  }

  @Post(':shipperId/exceptions')
  async reportException(
    @Param('shipperId') shipperId: string,
    @Body() body: { delivery_id: string; type: any; description: string; image_url?: string },
  ) {
    return this.shipperService.reportException(shipperId, body.delivery_id, body.type, body.description, body.image_url);
  }

  @Get(':shipperId/vehicle')
  async getVehicle(@Param('shipperId') shipperId: string) {
    return this.shipperService.getVehicle(shipperId);
  }

  @Patch(':shipperId/vehicle')
  async updateVehicle(
    @Param('shipperId') shipperId: string,
    @Body() body: { vehicle_type: string; vehicle_plate: string },
  ) {
    return this.shipperService.updateVehicle(shipperId, body.vehicle_type, body.vehicle_plate);
  }

  @Get(':shipperId/notifications')
  async getNotifications(@Param('shipperId') shipperId: string) {
    return this.shipperService.getNotifications(shipperId);
  }

  // ============ BATCH ORDERS ============

  @Get(':shipperId/batch-orders')
  async getBatchOrders(@Param('shipperId') shipperId: string) {
    return this.shipperService.getBatchOrders(shipperId);
  }

  @Post(':shipperId/batch-orders/:batchId/accept')
  async acceptBatchOrders(
    @Param('shipperId') shipperId: string,
    @Param('batchId') batchId: string,
    @Body() body: { order_ids?: string[] },
  ) {
    // Lấy order_ids từ body hoặc từ batchId parse
    const orderIds = body?.order_ids || [];
    return this.shipperService.acceptBatchOrders(shipperId, orderIds);
  }
}
