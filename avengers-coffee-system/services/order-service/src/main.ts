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
    await app.listen(port, '0.0.0.0');
    console.log(`Order-service dang chay tai: http://0.0.0.0:${port}`);
  } catch (err) {
    fs.appendFileSync('/app/error.log', 'BOOTSTRAP ERROR: ' + String(err?.stack || err) + '\n');
    console.error('Bootstrap error', err);
    process.exit(1);
  }
}
bootstrap();