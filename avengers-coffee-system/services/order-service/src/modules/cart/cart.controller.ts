import { Controller, Get, Post, Body, Param, Delete, Query, Req, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private assertOwner(user: any, userId: string) {
    if (user?.username !== 'internal-service' && String(user?.sub || '') !== String(userId)) {
      throw new ForbiddenException('Ban khong co quyen truy cap gio hang nay');
    }
  }

  @Get(':userId')
  async getCart(@Param('userId') userId: string, @Req() req: any) {
    this.assertOwner(req.user, userId);
    return this.cartService.layGiỏHàng(userId);
  }

  @Post(':userId/quote')
  async quoteCart(
    @Param('userId') userId: string,
    @Body() body: { voucher_code?: string },
    @Req() req: any,
  ) {
    this.assertOwner(req.user, userId);
    return this.cartService.quote(userId, body?.voucher_code);
  }

  @Post()
  async addToCart(@Body() dto: any, @Req() req: any) {
    this.assertOwner(req.user, String(dto?.ma_nguoi_dung || ''));
    return this.cartService.themVaoGiỏ(dto);
  }

  @Delete('clear/:userId')
  async clearCart(@Param('userId') userId: string, @Req() req: any) {
    this.assertOwner(req.user, userId);
    return this.cartService.xoaToanBoGio(userId);
  }

  @Delete('users/:userId/products/:productId')
  async removeProduct(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
    @Query('size') size: string | undefined,
    @Req() req: any,
  ) {
    this.assertOwner(req.user, userId);
    const productIdNumber = Number(productId);
    if (!Number.isInteger(productIdNumber) || productIdNumber <= 0) {
      throw new BadRequestException('Ma san pham khong hop le');
    }
    return this.cartService.xoaSanPhamKhoiGio(userId, productIdNumber, size);
  }

  @Delete(':id')
  async removeItem(@Param('id') id: number, @Req() req: any) {
    const userId = req.user?.username === 'internal-service' ? undefined : String(req.user?.sub || '');
    return this.cartService.xoaKhoiGiỏ(id, userId);
  }
}
