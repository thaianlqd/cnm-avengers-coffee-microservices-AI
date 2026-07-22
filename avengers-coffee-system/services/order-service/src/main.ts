import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as fs from 'fs';
import { Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';

@Catch()
class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    fs.appendFileSync('/app/error.log', new Date().toISOString() + ' ' + String(exception?.stack || exception) + '\n');
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception?.getStatus ? exception.getStatus() : 500;
    response.status(status).json({ message: String(exception), stack: exception?.stack });
  }
}

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
    app.enableCors();
    app.useGlobalFilters(new GlobalExceptionFilter());

    const port = Number(process.env.PORT ?? 3005);

    try {
      const { DataSource } = require('typeorm');
      const dataSource = app.get(DataSource);
      const schema = process.env.DB_SCHEMA || 'orders';
      await dataSource.query(`ALTER TABLE ${schema}.chi_tiet_don_hang ADD COLUMN IF NOT EXISTS toppings jsonb DEFAULT '[]'::jsonb`);
      await dataSource.query(`ALTER TABLE ${schema}.chi_tiet_don_hang ADD COLUMN IF NOT EXISTS luong_da varchar`);
      await dataSource.query(`ALTER TABLE ${schema}.chi_tiet_don_hang ADD COLUMN IF NOT EXISTS do_ngot varchar`);
      await dataSource.query(`ALTER TABLE ${schema}.chi_tiet_don_hang ADD COLUMN IF NOT EXISTS ghi_chu varchar`);
      await dataSource.query(`ALTER TABLE ${schema}.chi_tiet_don_hang ADD COLUMN IF NOT EXISTS loai_sua varchar`);
      await dataSource.query(`ALTER TABLE ${schema}.chi_tiet_don_hang ADD COLUMN IF NOT EXISTS custom_attributes jsonb DEFAULT '{}'::jsonb`);
      
      await dataSource.query(`ALTER TABLE ${schema}.gio_hang ADD COLUMN IF NOT EXISTS toppings jsonb DEFAULT '[]'::jsonb`);
      await dataSource.query(`ALTER TABLE ${schema}.gio_hang ADD COLUMN IF NOT EXISTS luong_da varchar`);
      await dataSource.query(`ALTER TABLE ${schema}.gio_hang ADD COLUMN IF NOT EXISTS do_ngot varchar`);
      await dataSource.query(`ALTER TABLE ${schema}.gio_hang ADD COLUMN IF NOT EXISTS ghi_chu varchar`);
      await dataSource.query(`ALTER TABLE ${schema}.gio_hang ADD COLUMN IF NOT EXISTS loai_sua varchar`);
      await dataSource.query(`ALTER TABLE ${schema}.gio_hang ADD COLUMN IF NOT EXISTS custom_attributes jsonb DEFAULT '{}'::jsonb`);
      
      await dataSource.query(`ALTER TABLE ${schema}.don_hang ADD COLUMN IF NOT EXISTS ma_ban varchar`);
      console.log('Auto-migration for chi_tiet_don_hang columns successful');
      
      const res = await dataSource.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'gio_hang'`);
      fs.appendFileSync('/app/error.log', '\n[DEBUG] COLUMNS IN gio_hang: ' + JSON.stringify(res) + '\n');

    } catch (e) {
      console.error('Auto-migration failed', e);
      fs.appendFileSync('/app/error.log', '\n[DEBUG] AUTO MIGRATION ERROR: ' + String(e?.stack || e) + '\n');
    }

    await app.listen(port, '0.0.0.0');
    console.log(`Order-service dang chay tai: http://0.0.0.0:${port}`);
  } catch (err) {
    fs.appendFileSync('/app/error.log', 'BOOTSTRAP ERROR: ' + String(err?.stack || err) + '\n');
    console.error('Bootstrap error', err);
    process.exit(1);
  }
}
bootstrap();