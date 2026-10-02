import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  Req,
  Headers,
  HttpCode,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CartAuthGuard, isGuestCartId } from '../../auth/cart-auth.guard';

@Controller('cart')
@UseGuards(CartAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private assertOwner(user: any, userId: string) {
    if (
      user?.username !== 'internal-service' &&
      String(user?.sub || '') !== String(userId)
    ) {
      throw new ForbiddenException('Ban khong co quyen truy cap gio hang nay');
    }
  }

  private mutationOwner(user: any, internalCartUserId?: string) {
    if (user?.username === 'internal-service') {
      return String(internalCartUserId || '').trim() || undefined;
    }
    return String(user?.sub || '');
  }

  @Get(':userId')
  async getCart(@Param('userId') userId: string, @Req() req: any) {
    this.assertOwner(req.user, userId);
    return this.cartService.layGiỏHàng(userId);
  }

  @Post(':userId/quote')
  @HttpCode(200)
  async quoteCart(
    @Param('userId') userId: string,
    @Body() body: { voucher_code?: string; delivery_mode?: string; delivery_method?: string },
    @Req() req: any,
  ) {
    this.assertOwner(req.user, userId);
    if (isGuestCartId(userId) && (body?.voucher_code || body?.delivery_mode)) {
      throw new ForbiddenException({ code: 'LOGIN_REQUIRED', message: 'Vui lòng đăng nhập để dùng voucher hoặc đặt hàng' });
    }
    return this.cartService.quote(userId, body?.voucher_code, body?.delivery_mode, body?.delivery_method);
  }

  @Post('merge-guest')
  @HttpCode(200)
  async mergeGuestCart(
    @Body() body: { guest_session_id?: string },
    @Headers('x-guest-session-id') guestId: string,
    @Headers('x-idempotency-key') operationId: string,
    @Req() req: any,
  ) {
    if (req.user?.role === 'GUEST' || req.user?.username === 'internal-service') {
      throw new ForbiddenException({ code: 'LOGIN_REQUIRED', message: 'Vui lòng đăng nhập để chuyển giỏ' });
    }
    if (!isGuestCartId(guestId) || body?.guest_session_id !== guestId || !operationId) {
      throw new BadRequestException('Thiếu phiên giỏ khách hoặc mã đồng bộ');
    }
    return this.cartService.mergeGuestCart(guestId, String(req.user.sub), operationId);
  }

  @Post()
  async addToCart(
    @Body() dto: any,
    @Headers('x-idempotency-key') headerOperationId: string | undefined,
    @Req() req: any,
  ) {
    this.assertOwner(req.user, String(dto?.ma_nguoi_dung || ''));
    return this.cartService.themVaoGiỏ(
      dto,
      headerOperationId || dto?.operation_id,
    );
  }

  /**
   * Canonical, absolute update for exactly one cart row.  The client must use
   * the row id returned by GET /cart; product/size matching is ambiguous when
   * a customer has two variants of the same product.
   */
  @Patch(':id')
  async updateItem(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-idempotency-key') operationId: string | undefined,
    @Headers('x-cart-user-id') internalCartUserId: string | undefined,
    @Req() req: any,
  ) {
    const itemId = Number(id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new BadRequestException('Id giỏ hàng không hợp lệ');
    }
    const userId = this.mutationOwner(req.user, internalCartUserId);
    if (!userId) {
      throw new BadRequestException(
        'X-Cart-User-Id la bat buoc cho internal cart mutation',
      );
    }
    return this.cartService.capNhatMucGio(
      itemId,
      body || {},
      userId,
      operationId || body?.operation_id,
    );
  }

  @Delete('clear/:userId')
  async clearCart(
    @Param('userId') userId: string,
    @Headers('x-idempotency-key') operationId: string | undefined,
    @Req() req: any,
  ) {
    this.assertOwner(req.user, userId);
    return this.cartService.xoaToanBoGio(userId, operationId);
  }

  @Delete('users/:userId/products/:productId')
  async removeProduct(
    @Param('userId') userId: string,
    @Param('productId') productId: string,
    @Query('size') size: string | undefined,
    @Headers('x-idempotency-key') operationId: string | undefined,
    @Req() req: any,
  ) {
    // Deprecated compatibility adapter for existing web clients.  A
    // product+size selector can match multiple option configurations; new
    // clients and all AI writes must call DELETE /cart/:line_id instead.
    this.assertOwner(req.user, userId);
    const productIdNumber = Number(productId);
    if (!Number.isInteger(productIdNumber) || productIdNumber <= 0) {
      throw new BadRequestException('Ma san pham khong hop le');
    }
    return this.cartService.xoaSanPhamKhoiGio(
      userId,
      productIdNumber,
      size,
      operationId,
    );
  }

  @Delete(':id')
  async removeItem(
    @Param('id') id: number,
    @Headers('x-idempotency-key') operationId: string | undefined,
    @Headers('x-cart-user-id') internalCartUserId: string | undefined,
    @Req() req: any,
  ) {
    const userId = this.mutationOwner(req.user, internalCartUserId);
    if (!userId) {
      throw new BadRequestException(
        'X-Cart-User-Id la bat buoc cho internal cart mutation',
      );
    }
    return this.cartService.xoaKhoiGiỏ(id, userId, operationId);
  }
}
