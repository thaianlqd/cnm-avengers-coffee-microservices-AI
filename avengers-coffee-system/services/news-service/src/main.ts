import { NestFactory } from '@nestjs/core';
import express from 'express';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  const uploadRoot = process.env.UPLOAD_ROOT_DIR || join(process.cwd(), 'uploads');
  const newsUploadDir = join(uploadRoot, 'news');
  if (!existsSync(newsUploadDir)) {
    mkdirSync(newsUploadDir, { recursive: true });
  }

  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.use('/uploads', express.static(uploadRoot));

  const port = process.env.PORT || 3004;
  await app.listen(port);
  console.log(`News Service running on port ${port}`);
}

bootstrap();
