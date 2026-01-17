import type { Redis, RedisOptions } from "ioredis";
import IORedis from "ioredis";
import type { MemoryEntry, RedisMemoryStoreOptions } from "./types";

/**
 * Redis-based memory store for Anthropic Agent SDK
 */
export class RedisMemoryStore {
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly defaultTTL?: number;
  private readonly ownsConnection: boolean;

  constructor(options: RedisMemoryStoreOptions) {
    this.keyPrefix = options.keyPrefix ?? "anthropic:memory:";
    this.defaultTTL = options.defaultTTL;

    if (this.isRedisInstance(options.redis)) {
      this.redis = options.redis;
      this.ownsConnection = false;
    } else {
      this.redis = new IORedis(options.redis);
      this.ownsConnection = true;
    }
  }

  private isRedisInstance(redis: Redis | RedisOptions): redis is Redis {
    return typeof (redis as Redis).get === "function";
  }

  private getKey(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  /**
   * Store a memory entry
   */
  async set(
    id: string,
    content: string,
    metadata?: Record<string, unknown>,
    ttl?: number
  ): Promise<MemoryEntry> {
    const now = new Date().toISOString();
    const existing = await this.get(id);

    const entry: MemoryEntry = {
      id,
      content,
      metadata,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const key = this.getKey(id);
    const value = JSON.stringify(entry);
    const effectiveTTL = ttl ?? this.defaultTTL;

    if (effectiveTTL) {
      await this.redis.setex(key, effectiveTTL, value);
    } else {
      await this.redis.set(key, value);
    }

    return entry;
  }

  /**
   * Retrieve a memory entry by ID
   */
  async get(id: string): Promise<MemoryEntry | null> {
    const key = this.getKey(id);
    const value = await this.redis.get(key);

    if (!value) {
      return null;
    }

    return JSON.parse(value) as MemoryEntry;
  }

  /**
   * Delete a memory entry
   */
  async delete(id: string): Promise<boolean> {
    const key = this.getKey(id);
    const result = await this.redis.del(key);
    return result > 0;
  }

  /**
   * Check if a memory entry exists
   */
  async has(id: string): Promise<boolean> {
    const key = this.getKey(id);
    const result = await this.redis.exists(key);
    return result > 0;
  }

  /**
   * List all memory entry IDs matching the prefix
   */
  async list(): Promise<string[]> {
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);
    return keys.map((key) => key.slice(this.keyPrefix.length));
  }

  /**
   * Clear all memory entries matching the prefix
   */
  async clear(): Promise<number> {
    const pattern = `${this.keyPrefix}*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    return await this.redis.del(...keys);
  }

  /**
   * Close the Redis connection (only if owned by this instance)
   */
  async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.redis.quit();
    }
  }
}
