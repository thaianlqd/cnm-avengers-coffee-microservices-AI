import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { assertAccountCheckoutOwner } from '../../auth/cart-auth.guard';
import { VoucherService } from './voucher.service';

@Controller('vouchers')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  @Get()
  layDanhSach() {
    return this.voucherService.layDanhSachVoucher();
  }

  @Get('admin')
  layDanhSachAdmin() {
    return this.voucherService.layDanhSachVoucherAdmin();
  }

  @Post('admin')
  taoVoucherAdmin(@Body() body: any) {
    return this.voucherService.taoVoucherAdmin(body);
  }

  @Patch('admin/:code')
  capNhatVoucherAdmin(@Param('code') code: string, @Body() body: any) {
    return this.voucherService.capNhatVoucherAdmin(code, body);
  }

  @Delete('admin/:code')
  xoaVoucherAdmin(@Param('code') code: string) {
    return this.voucherService.xoaVoucherAdmin(code);
  }

  @Get('templates')
  layTemplates(@Query('ngu_canh') nguCanh?: string, @Query('code') code?: string) {
    if (code) {
      return this.voucherService.layTemplateByCode(code);
    }
    return this.voucherService.layTemplatesTheoNguCanh(nguCanh);
  }

  @UseGuards(JwtAuthGuard)
  @Post('kiem-tra')
  async kiemTra(@Body() body: { ma_voucher?: string; tong_tien?: number; user_id?: string; has_toppings?: boolean; topping_price?: number }, @Req() req: any) {
    assertAccountCheckoutOwner(req.user, body?.user_id || '');
    const maVoucher = body.ma_voucher?.trim();
    if (!maVoucher) {
      throw new BadRequestException('ma_voucher la bat buoc');
    }
    const { so_tien_giam, voucher } = await this.voucherService.kiemTraVoucher(
      maVoucher,
      Number(body.tong_tien || 0),
      body.user_id,
      body.has_toppings,
      Number(body.topping_price || 0),
    );
    return {
      hop_le: true,
      ma_voucher: voucher.ma_voucher,
      mo_ta: voucher.mo_ta,
      loai: voucher.loai,
      gia_tri: Number(voucher.gia_tri),
      giam_toi_da: voucher.giam_toi_da !== null ? Number(voucher.giam_toi_da) : null,
      don_hang_toi_thieu: Number(voucher.don_hang_toi_thieu),
      so_tien_giam,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('eligible')
  async eligible(@Body() body: { tong_tien?: number; user_id?: string; has_toppings?: boolean; topping_price?: number }, @Req() req: any) {
    assertAccountCheckoutOwner(req.user, body?.user_id || '');
    return this.voucherService.layVoucherKhaDung(
      Number(body.tong_tien || 0),
      body.user_id,
      body.has_toppings,
      Number(body.topping_price || 0),
    );
  }
}
