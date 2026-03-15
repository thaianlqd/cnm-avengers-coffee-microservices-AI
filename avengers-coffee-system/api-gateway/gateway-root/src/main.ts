import { NestFactory } from '@nestjs/core';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  const httpAdapter = app.getHttpAdapter().getInstance();

  httpAdapter.use(
    createProxyMiddleware({
      target: process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001',
      changeOrigin: true,
      pathFilter: ['/auth', '/users', '/promotions'],
    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      target: process.env.MENU_SERVICE_URL || 'http://localhost:3003',
      changeOrigin: true,
      pathFilter: ['/menu'],
    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      target: process.env.ORDER_SERVICE_URL || 'http://localhost:3005',
      changeOrigin: true,
      pathFilter: ['/cart', '/chat', '/customers', '/staff', '/manager', '/products', '/reviews', '/vouchers'],
    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      target: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3004',
      changeOrigin: true,
      pathFilter: ['/inventory'],
    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      target: process.env.AI_SERVICE_URL || 'http://localhost:8000',
      changeOrigin: true,
      pathFilter: ['/ai'],
      pathRewrite: { '^/ai': '' },
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API Gateway dang chay tai: http://localhost:${port}`);
}
bootstrap();
