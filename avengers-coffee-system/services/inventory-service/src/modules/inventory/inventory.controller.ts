import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('items')
  getItems() {
    return this.inventoryService.findAll();
  }

  @Post('items')
  upsertItem(
    @Body() payload: { ma_san_pham: number; so_luong_ton: number; muc_canh_bao?: number },
  ) {
    return this.inventoryService.upsertStock(payload);
  }

  @Patch('items/:maSanPham/adjust')
  adjustItem(@Param('maSanPham') maSanPham: string, @Body() payload: { delta: number }) {
    return this.inventoryService.adjustStock(Number(maSanPham), Number(payload.delta ?? 0));
  }
}
