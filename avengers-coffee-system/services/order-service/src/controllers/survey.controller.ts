import { Controller, Get, Post, Patch, Put, Delete, Param, Body, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { SurveyService } from '../services/survey.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

export function surveyScope(user: AuthUser | null): string | null {
  if (user?.role === 'ADMIN') return null;
  if (user?.role !== 'MANAGER' || !user.branchCode?.trim()) throw new ForbiddenException('Tài khoản chưa được gắn với chi nhánh.');
  return user.branchCode.trim().toUpperCase();
}

@Controller('surveys')
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN', 'MANAGER')
  @Post('forms')
  taoBieuMau(@CurrentUser() user: AuthUser | null, @Body() body: { tieu_de: string; mo_ta?: string; cau_hoi: any[] }) {
    return this.surveyService.taoBieuMau(body, user?.username || 'manager', surveyScope(user));
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN', 'MANAGER')
  @Get('forms')
  layDanhSachBieuMau(@CurrentUser() user: AuthUser | null) {
    return this.surveyService.layDanhSachBieuMau(surveyScope(user));
  }

  @Get('forms/active')
  layBieuMauActive() { return this.surveyService.layBieuMauActive(); }

  @Get('public/:id')
  publicForm(@Param('id') id: string) { return this.surveyService.layBieuMauCongKhai(Number(id)); }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN', 'MANAGER')
  @Patch('forms/:id/activate')
  kickHoatBieuMau(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    return this.surveyService.kickHoatBieuMau(Number(id), surveyScope(user));
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN', 'MANAGER')
  @Put('forms/:id')
  suaBieuMau(@Param('id') id: string, @CurrentUser() user: AuthUser | null, @Body() body: { tieu_de?: string; mo_ta?: string; cau_hoi?: any[]; trang_thai?: boolean }) {
    return this.surveyService.suaBieuMau(Number(id), body, surveyScope(user));
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN', 'MANAGER')
  @Delete('forms/:id')
  xoaBieuMau(@Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    return this.surveyService.xoaBieuMau(Number(id), surveyScope(user));
  }

  @Post('responses')
  guiPhanHoi(@Body() body: { ma_bieu_mau: number; ma_nguoi_dung?: string; ten_nguoi_dung?: string; so_dien_thoai?: string; ma_don_hang?: string; tra_loi: any[] }) {
    return this.surveyService.guiPhanHoi(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN', 'MANAGER')
  @Get('responses')
  layDanhSachPhanHoi(@CurrentUser() user: AuthUser | null) {
    return this.surveyService.layDanhSachPhanHoi(surveyScope(user));
  }

  @Get('check-status')
  checkStatus(@Query('userId') userId?: string) { return this.surveyService.checkStatus(userId || ''); }
}
