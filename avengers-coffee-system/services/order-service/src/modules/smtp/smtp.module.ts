import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmtpConfig } from './smtp-config.entity';
import { SmtpService } from './smtp.service';
import { SmtpController } from './smtp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SmtpConfig])],
  controllers: [SmtpController],
  providers: [SmtpService],
  exports: [SmtpService],
})
export class SmtpModule {}
