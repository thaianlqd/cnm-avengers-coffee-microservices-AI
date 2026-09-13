import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SanPham } from './modules/menu/san-pham.entity';
import { DanhMuc } from './modules/menu/danh-muc.entity';
import { ThuocTinh } from './modules/menu/thuoc-tinh.entity';
import { BienTheSanPham } from './modules/menu/bien-the-san-pham.entity';
import { MenuModule } from './modules/menu/menu.module';

const menuSchema = process.env.DB_SCHEMA || 'menu';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: async () => {
        const host = process.env.DB_HOST || 'localhost';
        const port = Number(process.env.DB_PORT || 5432);
        const username = process.env.DB_USER || 'admin';
        const password = process.env.DB_PASSWORD || '123';
        const database = process.env.DB_NAME || 'avengers_coffee';

        const sslConfig = process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false;

        const client = new Client({
          host,
          port,
          user: username,
          password,
          database,
          ssl: sslConfig,
        });

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          ssl: sslConfig,
          schema: menuSchema,
          entities: [SanPham, DanhMuc, ThuocTinh, BienTheSanPham],
          extra: {
            max: 2,
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 5000,
          },
          synchronize: false,
        };
      },
    }),
    TypeOrmModule.forFeature([SanPham, DanhMuc, ThuocTinh, BienTheSanPham]),
    MenuModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }