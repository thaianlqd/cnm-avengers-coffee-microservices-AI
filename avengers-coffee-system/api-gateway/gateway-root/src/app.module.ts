import { HealthController } from './health.controller';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [HealthController, AppController],
  providers: [AppService],
})
export class AppModule {}
