import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThanhToanService } from './thanh-toan.service';

@Controller('customers/:customerId/thanh-toan')
export class ThanhToanController {
  constructor(private readonly thanhToanService: ThanhToanService) {}

  @Post('khoi-tao')
  khoiTao(
    @Param('customerId') customerId: string,
    @Req() req: Request,
    @Body()
    payload: {
      phuong_thuc_thanh_toan: 'VNPAY' | 'NGAN_HANG_QR' | 'THANH_TOAN_KHI_NHAN_HANG';
      dia_chi_giao_hang: string;
      khung_gio_giao?: string;
      ghi_chu?: string;
      branch_code?: string;
    },
  ) {
    return this.thanhToanService.khoiTaoThanhToan(customerId, payload, req.ip || '127.0.0.1');
  }

  @Get('vnpay/ket-qua')
  async ketQuaVnpay(
    @Param('customerId') customerId: string,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const result = await this.thanhToanService.ketQuaVnpayThat(customerId, query);
    const redirectUrl = this.thanhToanService.taoUrlRedirectFrontEnd(
      customerId,
      result.don_hang.ma_don_hang,
      result.don_hang.trang_thai_thanh_toan === 'DA_THANH_TOAN',
    );
    return res.redirect(302, redirectUrl);
  }

  @Get('don-hang/:maDonHang/trang-thai')
  layTrangThai(@Param('customerId') customerId: string, @Param('maDonHang') maDonHang: string) {
    return this.thanhToanService.layTrangThaiDonHang(customerId, maDonHang);
  }
}

@Controller('customers/thanh-toan/he-thong')
export class ThanhToanHeThongController {
  constructor(private readonly thanhToanService: ThanhToanService) {}

  @Get('vnpay/ipn')
  vnpayIpn(@Query() query: Record<string, string>) {
    return this.thanhToanService.xuLyVnpayIpn(query);
  }

  @Post('sepay/webhook')
  @HttpCode(200)
  sepayWebhook(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
  ) {
    const rawBody = JSON.stringify(payload || req.body || {});
    return this.thanhToanService.xuLyWebhookSepay(payload, headers, rawBody);
  }
}

@Controller()
export class ThanhToanLegacyWebhookController {
  constructor(private readonly thanhToanService: ThanhToanService) {}

  private xuLyWebhook(payload: Record<string, any>, headers: Record<string, string | string[] | undefined>, req: Request) {
    const rawBody = JSON.stringify(payload || req.body || {});
    return this.thanhToanService.xuLyWebhookSepay(payload, headers, rawBody);
  }

  @Post('sepay_webhook.php')
  @HttpCode(200)
  sepayWebhookRoot(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
  ) {
    return this.xuLyWebhook(payload, headers, req);
  }

  @Post('ANTHAI_TEST/sepay_webhook.php')
  @HttpCode(200)
  sepayWebhookAnthai(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
  ) {
    return this.xuLyWebhook(payload, headers, req);
  }

  @Post('GD_Full_ChucNang/public/sepay_webhook.php')
  @HttpCode(200)
  sepayWebhookLegacyPublic(
    @Body() payload: Record<string, any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: Request,
  ) {
    return this.xuLyWebhook(payload, headers, req);
  }
}
