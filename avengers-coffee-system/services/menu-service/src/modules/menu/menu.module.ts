import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SanPham } from './san-pham.entity';
import { DanhMuc } from './danh-muc.entity';
import { MenuService } from './menu.service';
import { MenuController } from './menu.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SanPham, DanhMuc])],
  controllers: [MenuController],
  providers: [MenuService], // Đã xóa MenuSeeder ở đây
})
export class MenuModule {}