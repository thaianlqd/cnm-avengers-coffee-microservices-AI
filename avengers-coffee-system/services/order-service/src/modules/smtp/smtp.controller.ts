import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { SmtpService } from './smtp.service';

@Controller('smtp')
export class SmtpController {
  constructor(private readonly smtpService: SmtpService) {}

  @Get('config')
  async getConfig() {
    return this.smtpService.getPublicConfig();
  }

  @Put('config')
  async updateConfig(
    @Body()
    dto: {
      host?: string;
      port?: number;
      secure?: boolean;
      auth_user?: string;
      auth_pass?: string;
      from_email?: string;
      from_name?: string;
      is_active?: boolean;
    },
  ) {
    await this.smtpService.updateConfig(dto);
    return {
      success: true,
      message: 'Cập nhật cấu hình SMTP thành công',
      data: await this.smtpService.getPublicConfig(),
    };
  }

  @Post('test')
  async sendTestEmail(
    @Body()
    dto: {
      to_email: string;
      host?: string;
      port?: number;
      secure?: boolean;
      auth_user?: string;
      auth_pass?: string;
      from_email?: string;
      from_name?: string;
    },
  ) {
    const customConfig = (dto.host || dto.auth_user) ? {
      host: dto.host,
      port: dto.port ? Number(dto.port) : undefined,
      secure: dto.secure,
      auth_user: dto.auth_user,
      auth_pass: dto.auth_pass,
      from_email: dto.from_email,
      from_name: dto.from_name,
    } : undefined;

    return this.smtpService.sendTestEmail(dto.to_email, customConfig);
  }
}
