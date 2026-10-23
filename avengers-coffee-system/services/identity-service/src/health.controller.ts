import { BeforeApplicationShutdown, Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { Public } from './auth/auth.decorators';

export function dbProbeConnectionTimeoutMs(raw = process.env.DB_PROBE_CONNECTION_TIMEOUT_MS): number {
  const configured = Number(raw);
  // Keep the local default; bound the AWS network allowance to two seconds.
  return Number.isInteger(configured) && configured >= 1000 && configured <= 2000 ? configured : 1000;
}

/** Process liveness is independent of DB/provider availability. */
@Controller('health')
@Public()
export class HealthController implements BeforeApplicationShutdown {
  private draining = false;
  constructor(private readonly dataSource: DataSource) {}

  beforeApplicationShutdown() { this.draining = true; }

  @Get('live')
  live() { return { status: 'ok' }; }

  @Get('ready')
  async ready() {
    if (this.draining || !this.dataSource.isInitialized) {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    }
    // A bounded, read-only dependency probe, never a provider/payment call.
    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'admin',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'avengers_coffee',
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: dbProbeConnectionTimeoutMs(),
      query_timeout: 1000,
    });
    client.on('error', () => undefined);
    try {
      await client.connect();
      await client.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready' });
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
