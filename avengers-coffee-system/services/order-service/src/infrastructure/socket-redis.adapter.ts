import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

let activeAdapter: SocketRedisAdapter | undefined;

export function socketRedisReady(): boolean {
  return process.env.SOCKET_REDIS_ENABLED !== 'true' || Boolean(activeAdapter?.isReady());
}

/** All namespaces share the existing Redis infrastructure and room broadcast adapter. */
export class SocketRedisAdapter extends IoAdapter {
  private pub?: Redis;
  private sub?: Redis;
  private adapterFactory?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) { super(app); }

  async connect(): Promise<void> {
    this.pub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true, connectTimeout: 5000,
      maxRetriesPerRequest: 1, enableOfflineQueue: false,
      retryStrategy: (attempt) => Math.min(attempt * 250, 3000),
    });
    this.sub = this.pub.duplicate();
    // Do not log connection URLs/credentials on network failure.
    this.pub.on('error', () => undefined);
    this.sub.on('error', () => undefined);
    try {
      await Promise.all([this.pub.connect(), this.sub.connect()]);
      this.adapterFactory = createAdapter(this.pub, this.sub, {
        key: 'avengers-coffee:socket.io', publishOnSpecificResponseChannel: true,
      });
      activeAdapter = this;
    } catch {
      await this.disconnect();
      throw new Error('Socket.IO Redis unavailable; refusing an unsafe local adapter fallback');
    }
  }

  isReady(): boolean { return this.pub?.status === 'ready' && this.sub?.status === 'ready'; }

  createIOServer(port: number, options?: ServerOptions): Server {
    if (!this.adapterFactory) throw new Error('Connect Redis before starting Socket.IO');
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapterFactory);
    return server;
  }

  async close(server: Server): Promise<void> {
    await super.close(server);
    await this.disconnect();
  }

  async disconnect(): Promise<void> {
    const clients = [this.pub, this.sub];
    this.pub = undefined;
    this.sub = undefined;
    if (activeAdapter === this) activeAdapter = undefined;
    await Promise.all(clients.map(async (client) => {
      if (!client) return;
      // Immediate disconnect also stops reconnect timers after failed startup.
      client.disconnect();
    }));
  }
}
