import { Controller, Get, Post, Patch, Body, Param, Delete, Query, Req, Headers, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
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
  async addToCart(
    @Body() dto: any,
    @Headers('x-idempotency-key') headerOperationId: string | undefined,
    @Req() req: any,
  ) {
    this.assertOwner(req.user, String(dto?.ma_nguoi_dung || ''));
    return this.cartService.themVaoGiỏ(dto, headerOperationId || dto?.operation_id);
  }

  /**
   * Canonical, absolute update for exactly one cart row.  The client must use
   * the row id returned by GET /cart; product/size matching is ambiguous when
   * a customer has two variants of the same product.
   */
  @Patch(':id')
  async updateItem(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new BadRequestException('Id giỏ hàng không hợp lệ');
    }
    const userId = req.user?.username === 'internal-service' ? undefined : String(req.user?.sub || '');
    return this.cartService.capNhatMucGio(itemId, body || {}, userId);
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
