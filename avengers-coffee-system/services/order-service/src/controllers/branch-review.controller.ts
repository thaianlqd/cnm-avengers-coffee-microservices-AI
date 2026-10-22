import { Controller, Get, Post, Body, Param, Query, Delete, UseGuards } from '@nestjs/common';
import { BranchReviewService, CreateBranchReviewDto } from '../services/branch-review.service';

import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Controller('branch-reviews')
export class BranchReviewController {
  constructor(private readonly branchReviewService: BranchReviewService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async taoDanhGia(@Body() body: CreateBranchReviewDto, @CurrentUser() user: AuthUser) {
    return this.branchReviewService.taoDanhGia(body, user.sub);
  }

  @Get('branch/:ma_chi_nhanh')
  async layDanhSachTheoChiNhanh(@Param('ma_chi_nhanh') ma_chi_nhanh: string) {
    return this.branchReviewService.layDanhSachDanhGiaChiNhanh(ma_chi_nhanh);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Delete(':id')
  async xoaDanhGia(@Param('id') id: string) {
    return this.branchReviewService.xoaDanhGia(Number(id));
  }

  @Get('stats')
  async layThongKeTatCa() {
    return this.branchReviewService.layThongKeTatCaChiNhanh();
  }

  @UseGuards(JwtAuthGuard)
  @Get('order/:orderId')
  async context(@Param('orderId') orderId: string, @CurrentUser() user: AuthUser) {
    return this.branchReviewService.layNguCanhDanhGia(orderId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    return this.branchReviewService.layDanhGiaCuaToi(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('check')
  async checkStatus(
    @Query('orderId') orderId?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.branchReviewService.checkDaDanhGia(orderId, user!.sub);
  }
}
