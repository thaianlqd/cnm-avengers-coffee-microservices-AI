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
}
