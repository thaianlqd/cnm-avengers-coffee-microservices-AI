import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { BranchReviewService, CreateBranchReviewDto } from '../services/branch-review.service';

@Controller('branch-reviews')
export class BranchReviewController {
  constructor(private readonly branchReviewService: BranchReviewService) {}

  @Post()
  async taoDanhGia(@Body() body: CreateBranchReviewDto) {
    return this.branchReviewService.taoDanhGia(body);
  }

  @Get('branch/:ma_chi_nhanh')
  async layDanhSachTheoChiNhanh(@Param('ma_chi_nhanh') ma_chi_nhanh: string) {
    return this.branchReviewService.layDanhSachDanhGiaChiNhanh(ma_chi_nhanh);
  }

  @Get('stats')
  async layThongKeTatCa() {
    return this.branchReviewService.layThongKeTatCaChiNhanh();
  }

  @Get('check')
  async checkStatus(
    @Query('orderId') orderId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.branchReviewService.checkDaDanhGia(orderId, userId);
  }
}
