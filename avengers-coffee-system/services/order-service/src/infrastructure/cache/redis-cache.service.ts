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
        enableOfflineQueue: false,
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
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[Redis] getJson error for key ${key}:`, err);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds = 60) {
    if (!this.client || !this.ready) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      console.warn(`[Redis] setJson error for key ${key}:`, err);
    }
  }

  async getNumber(key: string) {
    if (!this.client || !this.ready) return 0;
    try {
      const raw = await this.client.get(key);
      return Number(raw || 0);
    } catch (err) {
      console.warn(`[Redis] getNumber error for key ${key}:`, err);
      return 0;
    }
  }

  async increment(key: string, amount = 1, ttlSeconds = 3600) {
    if (!this.client || !this.ready) return 0;
    try {
      const result = await this.client.incrbyfloat(key, amount);
      if (ttlSeconds > 0) {
        await this.client.expire(key, ttlSeconds);
      }
      return Number(result || 0);
    } catch (err) {
      console.warn(`[Redis] increment error for key ${key}:`, err);
      return 0;
    }
  }

  /** Atomically deduplicate and apply the two order-created counters. */
  async incrementOrderCreatedOnce(eventKey: string, ordersKey: string, revenueKey: string, amount: number) {
    if (!this.client || !this.ready) return false;
    const script = `
      if redis.call('SET', KEYS[1], '1', 'NX') then
        redis.call('INCRBYFLOAT', KEYS[2], 1)
        redis.call('INCRBYFLOAT', KEYS[3], ARGV[1])
        redis.call('EXPIRE', KEYS[2], 86400)
        redis.call('EXPIRE', KEYS[3], 86400)
        return 1
      end
      return 0`;
    try {
      return Number(await this.client.eval(script, 3, `analytics:seen:${eventKey}`, ordersKey, revenueKey, amount)) === 1;
    } catch (err) {
      console.warn('[Redis] order-created event dedupe failed:', err);
      throw err;
    }
  }

  async delete(key: string) {
    if (!this.client || !this.ready) return;
    try {
      await this.client.del(key);
    } catch (err) {
      console.warn(`[Redis] delete error for key ${key}:`, err);
    }
  }

  async deleteByPrefix(prefix: string) {
    if (!this.client || !this.ready) return;

    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length) {
          await this.client.del(keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      console.warn(`[Redis] deleteByPrefix error for prefix ${prefix}:`, err);
    }
  }
}
