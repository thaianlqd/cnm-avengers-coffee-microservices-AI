import { Controller, Get, Post, Patch, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { SurveyService } from '../services/survey.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Controller('surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  // ═══════════════════════════════════════════════════════
  //  SURVEY FORM ENDPOINTS
  // ═══════════════════════════════════════════════════════

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('forms')
  async taoBieuMau(
    @CurrentUser() currentUser: AuthUser | null,
    @Body() body: { tieu_de: string; mo_ta?: string; cau_hoi: any[] },
  ) {
    return this.surveyService.taoBieuMau(body, currentUser?.username || currentUser?.email || 'manager');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('forms')
  async layDanhSachBieuMau() {
    return this.surveyService.layDanhSachBieuMau();
  }

  @Get('forms/active')
  async layBieuMauActive() {
    return this.surveyService.layBieuMauActive();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('forms/:id/activate')
  async kickHoatBieuMau(@Param('id') id: string) {
    return this.surveyService.kickHoatBieuMau(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Put('forms/:id')
  async suaBieuMau(
    @Param('id') id: string,
    @Body() body: { tieu_de?: string; mo_ta?: string; cau_hoi?: any[]; trang_thai?: boolean },
  ) {
    return this.surveyService.suaBieuMau(Number(id), body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('forms/:id')
  async xoaBieuMau(@Param('id') id: string) {
    return this.surveyService.xoaBieuMau(Number(id));
  }

  // ═══════════════════════════════════════════════════════
  //  SURVEY RESPONSE ENDPOINTS
  // ═══════════════════════════════════════════════════════

  @Post('responses')
  async guiPhanHoi(
    @Body()
    body: {
      ma_bieu_mau: number;
      ma_nguoi_dung?: string;
      ten_nguoi_dung?: string;
      so_dien_thoai?: string;
      ma_don_hang?: string;
      tra_loi: any[];
    },
  ) {
    return this.surveyService.guiPhanHoi(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('responses')
  async layDanhSachPhanHoi() {
    return this.surveyService.layDanhSachPhanHoi();
  }

  @Get('check-status')
  async checkStatus(@Query('userId') userId?: string) {
    return this.surveyService.checkStatus(userId || '');
  }
}
