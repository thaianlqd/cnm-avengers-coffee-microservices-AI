import { NestFactory } from '@nestjs/core';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { AppModule } from './app.module';
import { createRequestLogger } from './request-logging';
import { ProxyAgents } from './proxy-agents';
import { configureGatewayHttpServer } from './gateway-http-policy';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  app.enableCors();

  app.use(createRequestLogger(process.env));

  const httpAdapter = app.getHttpAdapter().getInstance();

  // Timeout configuration: 120 seconds to handle slow remote DB (Supabase) and external API calls
  const PROXY_TIMEOUT = 120000; // 120 seconds
  const proxyAgents = new ProxyAgents(process.env);
  const proxyResponseHook = configureGatewayHttpServer(app.getHttpServer(), process.env);
  const proxyResponseEvents = proxyResponseHook ? { proxyRes: proxyResponseHook } : {};
  const upstream = (target: string) => ({ target, agent: proxyAgents.forTarget(target) });
  app.getHttpServer().once('close', () => proxyAgents.destroy());

  httpAdapter.use(
    createProxyMiddleware({
      ...upstream(process.env.IDENTITY_SERVICE_URL || 'http://localhost:3001'),
      changeOrigin: true,
      on: { proxyReq: fixRequestBody, ...proxyResponseEvents },
          pathFilter: ['/auth', '/users', '/promotions', '/franchise', '/admin', '/wallet'],
          timeout: PROXY_TIMEOUT,
          proxyTimeout: PROXY_TIMEOUT,

    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      ...upstream(process.env.MENU_SERVICE_URL || 'http://localhost:3003'),
      changeOrigin: true,
      on: { proxyReq: fixRequestBody, ...proxyResponseEvents },
      pathFilter: ['/menu'],
      timeout: PROXY_TIMEOUT,
      proxyTimeout: PROXY_TIMEOUT,
    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      ...upstream(process.env.ORDER_SERVICE_URL || 'http://localhost:3005'),
      changeOrigin: true,
      on: { proxyReq: fixRequestBody, ...proxyResponseEvents },
      pathFilter: [
        '/cart',
        '/orders',
        '/chat',
        '/customers',
        '/staff',
        '/manager',
        '/products',
        '/reviews',
        '/branch-reviews',
        '/surveys',
        '/table-order',
        '/shippers',
        '/vouchers',
        '/sepay_webhook.php',
        '/ANTHAI_TEST',
        '/GD_Full_ChucNang',
        '/gift-cards',
        '/smtp',
      ],
      timeout: PROXY_TIMEOUT,
      proxyTimeout: PROXY_TIMEOUT,
    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      ...upstream(process.env.INVENTORY_SERVICE_URL || 'http://localhost:3004'),
      changeOrigin: true,
      on: { proxyReq: fixRequestBody, ...proxyResponseEvents },
      pathFilter: ['/inventory'],
      timeout: PROXY_TIMEOUT,
      proxyTimeout: PROXY_TIMEOUT,
    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      ...upstream(process.env.AI_SERVICE_URL || 'http://localhost:8000'),
      changeOrigin: true,
      on: { proxyReq: fixRequestBody, ...proxyResponseEvents },
      pathFilter: ['/ai'],
      timeout: PROXY_TIMEOUT,
      proxyTimeout: PROXY_TIMEOUT,
    }),
  );

  httpAdapter.use(
    createProxyMiddleware({
      ...upstream(process.env.NEWS_SERVICE_URL || 'http://localhost:3006'),
      changeOrigin: true,
      pathFilter: ['/news', '/uploads/news'],
      on: proxyResponseEvents,
      timeout: PROXY_TIMEOUT,
      proxyTimeout: PROXY_TIMEOUT,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API Gateway dang chay tai: http://localhost:${port}`);
}
bootstrap();
