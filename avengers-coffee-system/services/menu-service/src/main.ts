import { installDatabaseDiagnostics } from './database-diagnostics';
import { diagnosticMiddleware, startDiagnostics } from './capacity-diagnostics';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  installDatabaseDiagnostics();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.use(diagnosticMiddleware);
  startDiagnostics(app.getHttpServer());

  app.enableCors();

  const port = Number(process.env.PORT ?? 3003);
  await app.listen(port);
  console.log(`Menu service dang chay tai: http://localhost:${port}`);
}
bootstrap();