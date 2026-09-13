import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';

@Catch()
class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    console.error('[EXCEPTION]', new Date().toISOString(), String(exception?.stack || exception));
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

    // All database columns are already migrated in PostgreSQL schema.
    // Avoid running blocking DDL queries on bootstrap over Supabase connection pooler.

    await app.listen(port, '0.0.0.0');
    console.log(`Order-service da san sang tai: http://0.0.0.0:${port}`);
  } catch (err) {
    console.error('Bootstrap error', err);
    process.exit(1);
  }
}
bootstrap();