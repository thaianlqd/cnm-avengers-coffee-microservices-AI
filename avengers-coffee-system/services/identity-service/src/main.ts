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

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`Identity-service da san sang tai: http://0.0.0.0:${port}`);
}
bootstrap();