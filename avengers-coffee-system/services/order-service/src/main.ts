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
      const existingColsRes = await dataSource.query(`
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE table_schema = '${schema}' 
          AND table_name IN ('chi_tiet_don_hang', 'gio_hang', 'don_hang')
      `);
      const existingCols = new Set(
        (existingColsRes || []).map((r: any) => `${r.table_name}.${r.column_name}`)
      );

      const addColIfNeeded = async (tableName: string, colName: string, colDef: string) => {
        if (!existingCols.has(`${tableName}.${colName}`)) {
          await dataSource.query(`ALTER TABLE ${schema}.${tableName} ADD COLUMN IF NOT EXISTS ${colName} ${colDef}`);
        }
      };

      await addColIfNeeded('chi_tiet_don_hang', 'toppings', "jsonb DEFAULT '[]'::jsonb");
      await addColIfNeeded('chi_tiet_don_hang', 'luong_da', "varchar");
      await addColIfNeeded('chi_tiet_don_hang', 'do_ngot', "varchar");
      await addColIfNeeded('chi_tiet_don_hang', 'ghi_chu', "varchar");
      await addColIfNeeded('chi_tiet_don_hang', 'loai_sua', "varchar");
      await addColIfNeeded('chi_tiet_don_hang', 'custom_attributes', "jsonb DEFAULT '{}'::jsonb");

      await addColIfNeeded('gio_hang', 'toppings', "jsonb DEFAULT '[]'::jsonb");
      await addColIfNeeded('gio_hang', 'luong_da', "varchar");
      await addColIfNeeded('gio_hang', 'do_ngot', "varchar");
      await addColIfNeeded('gio_hang', 'ghi_chu', "varchar");
      await addColIfNeeded('gio_hang', 'loai_sua', "varchar");
      await addColIfNeeded('gio_hang', 'custom_attributes', "jsonb DEFAULT '{}'::jsonb");

      await addColIfNeeded('don_hang', 'ma_ban', "varchar");
      console.log('Auto-migration column check successful');

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