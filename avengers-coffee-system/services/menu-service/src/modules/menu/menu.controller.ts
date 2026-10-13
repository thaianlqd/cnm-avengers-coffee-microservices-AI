import { Controller, Get, Param, NotFoundException, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express';
import { PublicBrowseCache } from '../../public-browse-cache';
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  private readonly publicCache = new PublicBrowseCache();
  constructor(private readonly menuService: MenuService) {}

  @Get('san-pham')
  async laySanPham(@Req() req: Request, @Res() res: Response) {
    await this.publicCache.respond('products', () => this.menuService.layTatCaSanPham(), req, res);
  }

  @Get('danh-muc')
  async layDanhMuc(@Req() req: Request, @Res() res: Response) {
    await this.publicCache.respond('categories', () => this.menuService.layTatCaDanhMuc(), req, res);
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
