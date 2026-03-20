import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { CartModule } from './modules/cart/cart.module';
import { CartItem } from './modules/cart/cart.entity';
import { ThanhToanModule } from './modules/thanh-toan/thanh-toan.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ThongBao } from './modules/notification/entities/thong-bao.entity';
import { DonHang } from './modules/thanh-toan/entities/don-hang.entity';
import { ChiTietDonHang } from './modules/thanh-toan/entities/chi-tiet-don-hang.entity';
import { GiaoDichThanhToan } from './modules/thanh-toan/entities/giao-dich-thanh-toan.entity';
import { CaDoiSoat } from './modules/thanh-toan/entities/ca-doi-soat.entity';
import { CaLamViecNhanVien } from './modules/thanh-toan/entities/ca-lam-viec-nhan-vien.entity';
import { Review } from './entities/review.entity';
import { ReviewService } from './services/review.service';
import { ReviewController } from './controllers/review.controller';
import { Voucher } from './modules/voucher/voucher.entity';
import { VoucherModule } from './modules/voucher/voucher.module';
import { ChatConversation } from './modules/chat/entities/chat-conversation.entity';
import { ChatMessage } from './modules/chat/entities/chat-message.entity';
import { ChatModule } from './modules/chat/chat.module';
import { FavoriteModule } from './modules/favorite/favorite.module';
import { FavoriteItem } from './modules/favorite/entities/favorite-item.entity';

const orderSchema = process.env.DB_SCHEMA || 'orders';
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '7d') as StringValue;

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'avengers-jwt-secret',
      signOptions: {
        expiresIn: jwtExpiresIn,
      },
    }),
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
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${orderSchema}"`);
        await client.end();

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          schema: orderSchema,
          entities: [
            CartItem,
            DonHang,
            ChiTietDonHang,
            GiaoDichThanhToan,
            CaDoiSoat,
            CaLamViecNhanVien,
            ThongBao,
            Review,
            Voucher,
            ChatConversation,
            ChatMessage,
            FavoriteItem,
          ],
          synchronize: true,
        };
      },
    }),
    TypeOrmModule.forFeature([Review]),
    InfrastructureModule,
    CartModule,
    NotificationModule,
    ThanhToanModule,
    VoucherModule,
    ChatModule,
    FavoriteModule,
  ],
  controllers: [AppController, ReviewController],
  providers: [AppService, ReviewService],
})
export class AppModule {}
