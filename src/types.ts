import type { Redis, RedisOptions } from "ioredis";

/**
 * Configuration options for the Redis memory store
 */
export interface RedisMemoryStoreOptions {
  /**
   * Redis client instance or connection options
   */
  redis: Redis | RedisOptions;

  /**
   * Key prefix for all memory entries
   * @default "anthropic:memory:"
   */
  keyPrefix?: string;

  /**
   * Default TTL for memory entries in seconds
   * @default undefined (no expiration)
   */
  defaultTTL?: number;
}

/**
 * A memory entry stored in Redis
 */
export interface MemoryEntry {
  /**
   * Unique identifier for the memory
   */
  id: string;

  /**
   * The content of the memory
   */
  content: string;

  /**
   * Optional metadata associated with the memory
   */
  metadata?: Record<string, unknown>;

  /**
   * Timestamp when the memory was created
   */
  createdAt: string;

  /**
   * Timestamp when the memory was last updated
   */
  updatedAt: string;
}
