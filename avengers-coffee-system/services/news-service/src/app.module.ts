import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
import { NewsModule } from './modules/news/news.module';
import { Article } from './modules/news/entities/article.entity';

const newsSchema = process.env.DB_SCHEMA || 'news';
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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${newsSchema}"`);
        await client.end();

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          schema: newsSchema,
          entities: [Article],
          synchronize: true,
          logging: false,
        };
      },
    }),
    NewsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
