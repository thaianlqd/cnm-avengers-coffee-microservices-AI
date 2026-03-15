import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { Branch } from './modules/user/branch.entity';
import { DeliveryAddress } from './modules/user/delivery-address.entity';
import { Promotion } from './modules/user/promotion.entity';
import { PromotionUsage } from './modules/user/promotion-usage.entity';
import { User } from './modules/user/user.entity';
import { UserModule } from './modules/user/user.module';

const identitySchema = process.env.DB_SCHEMA || 'identity';
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || '7d') as StringValue;

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
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${identitySchema}"`);
        await client.end();

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          schema: identitySchema,
          entities: [User, DeliveryAddress, Branch, Promotion, PromotionUsage],
          synchronize: true,
        };
      },
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'avengers-jwt-secret',
      signOptions: {
        expiresIn: jwtExpiresIn,
      },
    }),
    UserModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}