import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('auth/register')
  register(
    @Body()
    payload: {
      ten_dang_nhap: string;
      mat_khau: string;
      ho_ten: string;
      email?: string;
      so_dien_thoai?: string;
      avatar_url?: string;
    },
  ) {
    return this.appService.register(payload);
  }

  @Post('auth/login')
  login(
    @Body()
    payload: {
      tai_khoan: string;
      mat_khau: string;
    },
  ) {
    return this.appService.login(payload);
  }

  @Patch('users/:id/profile')
  updateProfile(
    @Param('id') userId: string,
    @Body()
    payload: {
      ho_ten?: string;
      email?: string;
      so_dien_thoai?: string;
      avatar_url?: string;
    },
  ) {
    return this.appService.updateProfile(userId, payload);
  }

  @Patch('users/:id/password')
  changePassword(
    @Param('id') userId: string,
    @Body()
    payload: {
      mat_khau_cu: string;
      mat_khau_moi: string;
    },
  ) {
    return this.appService.changePassword(userId, payload);
  }
}
