import { BeforeApplicationShutdown, Controller, Get, ServiceUnavailableException } from '@nestjs/common';

@Controller('health')
export class HealthController implements BeforeApplicationShutdown {
  private draining = false;
  beforeApplicationShutdown() { this.draining = true; }
  @Get('live')
  live() { return { status: 'ok' }; }
  @Get('ready')
  ready() {
    if (this.draining) throw new ServiceUnavailableException({ status: 'not_ready' });
    return { status: 'ok' };
  }
}
