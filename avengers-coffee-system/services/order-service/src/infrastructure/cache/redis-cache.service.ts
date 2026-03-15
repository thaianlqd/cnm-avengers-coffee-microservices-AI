import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private ready = false;

  async onModuleInit() {
    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      await this.client.connect();
      this.ready = true;
    } catch (error) {
      this.ready = false;
      this.client = null;
      console.warn('[redis] Khong the ket noi Redis, he thong se tiep tuc khong dung cache.');
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
    this.client = null;
    this.ready = false;
  }

  isAvailable() {
    return this.ready && Boolean(this.client);
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client || !this.ready) return null;
    const raw = await this.client.get(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds = 60) {
    if (!this.client || !this.ready) return;
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async getNumber(key: string) {
    if (!this.client || !this.ready) return 0;
    const raw = await this.client.get(key);
    return Number(raw || 0);
  }

  async increment(key: string, amount = 1, ttlSeconds = 3600) {
    if (!this.client || !this.ready) return 0;
    const result = await this.client.incrbyfloat(key, amount);
    if (ttlSeconds > 0) {
      await this.client.expire(key, ttlSeconds);
    }
    return Number(result || 0);
  }

  async delete(key: string) {
    if (!this.client || !this.ready) return;
    await this.client.del(key);
  }

  async deleteByPrefix(prefix: string) {
    if (!this.client || !this.ready) return;

    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length) {
        await this.client.del(keys);
      }
    } while (cursor !== '0');
  }
}
