import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SanPham } from './modules/menu/san-pham.entity';
import { DanhMuc } from './modules/menu/danh-muc.entity';
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

        const client = new Client({
          host,
          port,
          user: username,
          password,
          database,
        });

        await client.connect();
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${menuSchema}"`);
        await client.end();

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          schema: menuSchema,
          entities: [SanPham, DanhMuc],
          synchronize: true,
        };
      },
    }),
    TypeOrmModule.forFeature([SanPham, DanhMuc]),
    MenuModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}