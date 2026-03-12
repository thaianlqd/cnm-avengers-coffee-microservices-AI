import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InventoryItem } from './modules/inventory/inventory-item.entity';

const inventorySchema = process.env.DB_SCHEMA || 'inventory';

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
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${inventorySchema}"`);
        await client.end();

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          schema: inventorySchema,
          entities: [InventoryItem],
          synchronize: true,
        };
      },
    }),
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
