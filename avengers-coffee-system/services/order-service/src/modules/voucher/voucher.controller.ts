import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { VoucherService } from './voucher.service';

@Controller('vouchers')
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  @Get()
  layDanhSach() {
    return this.voucherService.layDanhSachVoucher();
  }

  @Post('kiem-tra')
  async kiemTra(@Body() body: { ma_voucher?: string; tong_tien?: number }) {
    const maVoucher = body.ma_voucher?.trim();
    if (!maVoucher) {
      throw new BadRequestException('ma_voucher la bat buoc');
    }
    const { so_tien_giam, voucher } = await this.voucherService.kiemTraVoucher(
      maVoucher,
      Number(body.tong_tien || 0),
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
}
