import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('items')
  getItems(@Query('branch_code') branchCode?: string) {
    return this.inventoryService.findAll(branchCode);
  }

  @Post('items')
  upsertItem(
    @Body() payload: { ma_san_pham: number; so_luong_ton: number; muc_canh_bao?: number; dang_kinh_doanh?: boolean; branch_code?: string },
  ) {
    return this.inventoryService.upsertStock(payload);
  }

  @Patch('items/:maSanPham/adjust')
  adjustItem(
    @Param('maSanPham') maSanPham: string,
    @Body() payload: { delta: number; branch_code?: string },
  ) {
    return this.inventoryService.adjustStock(Number(maSanPham), Number(payload.delta ?? 0), payload.branch_code);
  }

  // ─── KIOSK COMBO DELIVERY ───────────────────────────────────────

  /** Manager tạo phiếu giao combo nguyên liệu cho Kiosk */
  @Post('kiosk-combos')
  taoCombo(
    @Body() body: { ma_chi_nhanh_me: string; ma_kiosk: string; ten_combo: string; mo_ta?: string },
  ) {
    return this.inventoryService.taoComboGiao(body);
  }

  /** Lấy danh sách combo — dùng được cho cả Manager và Kiosk Staff */
  @Get('kiosk-combos')
  layCombo(
    @Query('ma_chi_nhanh_me') ma_chi_nhanh_me?: string,
    @Query('ma_kiosk') ma_kiosk?: string,
    @Query('trang_thai') trang_thai?: string,
  ) {
    return this.inventoryService.layDanhSachCombo({ ma_chi_nhanh_me, ma_kiosk, trang_thai });
  }

  /** Kiosk Staff xác nhận đã nhận combo */
  @Patch('kiosk-combos/:id/receive')
  nhanCombo(
    @Param('id') id: string,
    @Body() body: { nguoi_nhan?: string },
  ) {
    return this.inventoryService.xacNhanNhanCombo(Number(id), body.nguoi_nhan || 'Kiosk Staff');
  }
}
