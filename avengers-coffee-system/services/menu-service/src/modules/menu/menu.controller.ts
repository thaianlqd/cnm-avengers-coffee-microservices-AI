import { Controller, Get, Param, NotFoundException } from '@nestjs/common'
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('san-pham')
  async laySanPham() {
    return await this.menuService.layTatCaSanPham();
  }

  @Get('danh-muc')
  async layDanhMuc() {
    return await this.menuService.layTatCaDanhMuc();
  }

  @Get('san-pham/:id')
  async layChiTiet(@Param('id') id: number) {
    const sanPham = await this.menuService.layChiTietSanPham(id);
    
    if (!sanPham) {
      throw new NotFoundException('Món này không tồn tại bác ơi!');
    }
    
    return sanPham;
  }
}