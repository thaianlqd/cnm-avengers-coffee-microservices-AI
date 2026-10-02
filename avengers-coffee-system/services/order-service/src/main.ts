import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';

@Catch()
class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (statusCode: number) => { json: (body: unknown) => void };
    }>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    console.error(
      '[EXCEPTION]',
      new Date().toISOString(),
      exception instanceof Error ? exception.name : 'Error',
      status,
    );
    if (exception instanceof HttpException) {
      const detail = exception.getResponse();
      response
        .status(status)
        .json(typeof detail === 'object' ? detail : { message: detail });
      return;
    }
    response.status(500).json({ message: 'Internal server error' });
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
void bootstrap();
