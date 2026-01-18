/**
 * Redis implementation for Anthropic Agent SDK memory tool handlers
 */

import type Redis from "ioredis";
import type {
  BetaMemoryTool20250818ViewCommand,
  BetaMemoryTool20250818CreateCommand,
  BetaMemoryTool20250818DeleteCommand,
  BetaMemoryTool20250818InsertCommand,
  BetaMemoryTool20250818RenameCommand,
  BetaMemoryTool20250818StrReplaceCommand,
} from "@anthropic-ai/sdk/resources/beta";

/**
 * Interface matching the MemoryToolHandlers from @anthropic-ai/sdk/helpers/beta/memory
 */
export interface MemoryToolHandlers {
  view(command: BetaMemoryTool20250818ViewCommand): Promise<string>;
  create(command: BetaMemoryTool20250818CreateCommand): Promise<string>;
  str_replace(
    command: BetaMemoryTool20250818StrReplaceCommand
  ): Promise<string>;
  insert(command: BetaMemoryTool20250818InsertCommand): Promise<string>;
  delete(command: BetaMemoryTool20250818DeleteCommand): Promise<string>;
  rename(command: BetaMemoryTool20250818RenameCommand): Promise<string>;
}

/**
 * Configuration options for the Redis memory tool
 */
export interface RedisMemoryToolConfig {
  /**
   * Prefix for all Redis keys. Useful for namespacing different agents/contexts.
   * @default "memory"
   */
  keyPrefix?: string;

  /**
   * TTL (time-to-live) in seconds for stored memory items.
   * If not set, items will not expire.
   */
  ttl?: number;

  /**
   * Agent context identifier. Used as part of the key prefix to separate
   * memories for different agent instances/sessions.
   */
  agentContext?: string;
}

/**
 * Redis-based implementation of memory tool handlers for the Anthropic SDK.
 *
 * This class provides persistent memory storage using Redis, allowing AI agents
 * to store, retrieve, and manipulate files and directories in a Redis-backed
 * virtual filesystem.
 *
 * @example
 * ```typescript
 * import Redis from "ioredis";
 * import { RedisMemoryTool } from "anthropic-redis-memory-tool";
 * import { betaMemoryTool } from "@anthropic-ai/sdk/helpers/beta/memory";
 *
 * const redis = new Redis();
 * const memoryTool = new RedisMemoryTool(redis, {
 *   agentContext: "my-agent",
 *   ttl: 3600, // 1 hour
 * });
 *
 * const tool = betaMemoryTool(memoryTool);
 * ```
 */
export class RedisMemoryTool implements MemoryToolHandlers {
  private redis: Redis;
  private keyPrefix: string;
  private ttl?: number;

  /**
   * Creates a new RedisMemoryTool instance.
   *
   * @param redis - An ioredis Redis client instance
   * @param config - Configuration options
   */
  constructor(redis: Redis, config: RedisMemoryToolConfig = {}) {
    this.redis = redis;
    this.ttl = config.ttl;

    // Build key prefix: base:agentContext or just base
    const base = config.keyPrefix ?? "memory";
    this.keyPrefix = config.agentContext
      ? `${base}:${config.agentContext}`
      : base;
  }

  /**
   * Converts a memory path to a Redis key.
   * Validates that the path starts with /memories.
   */
  private pathToKey(memoryPath: string): string {
    if (!memoryPath.startsWith("/memories")) {
      throw new Error(`Path must start with /memories, got: ${memoryPath}`);
    }

    // Normalize the path
    const normalized = memoryPath.replace(/\/+/g, "/").replace(/\/$/, "");
    return `${this.keyPrefix}:${normalized}`;
  }

  /**
   * Extracts the path from a Redis key.
   */
  private keyToPath(key: string): string {
    const prefixLen = this.keyPrefix.length + 1; // +1 for the colon
    return key.slice(prefixLen);
  }

  /**
   * Sets a key with optional TTL.
   */
  private async setWithTtl(key: string, value: string): Promise<void> {
    if (this.ttl) {
      await this.redis.setex(key, this.ttl, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  /**
   * Refreshes TTL for a key if TTL is configured.
   */
  private async refreshTtl(key: string): Promise<void> {
    if (this.ttl) {
      await this.redis.expire(key, this.ttl);
    }
  }

  /**
   * Checks if a path is a file (as opposed to a directory).
   */
  private async isFile(memoryPath: string): Promise<boolean> {
    const key = this.pathToKey(memoryPath);
    return (await this.redis.exists(key)) === 1;
  }

  /**
   * View a file or directory contents.
   */
  async view(command: BetaMemoryTool20250818ViewCommand): Promise<string> {
    const memoryPath = command.path;

    // Special case for /memories root
    if (memoryPath === "/memories") {
      const pattern = `${this.keyPrefix}:/memories/*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return `Directory: /memories\n(empty)`;
      }

      // Extract unique direct children
      const children = new Set<string>();
      const rootPrefix = `${this.keyPrefix}:/memories/`;

      for (const key of keys) {
        if (key.startsWith(rootPrefix)) {
          const relativePath = key.slice(rootPrefix.length);
          const firstSegment = relativePath.split("/")[0];
          if (firstSegment) {
            // Check if this is a file or has children (directory)
            const fullPath = `/memories/${firstSegment}`;
            const isFileCheck = await this.isFile(fullPath);
            children.add(isFileCheck ? firstSegment : `${firstSegment}/`);
          }
        }
      }

      const items = Array.from(children).sort();
      return (
        `Directory: /memories\n` + items.map((item) => `- ${item}`).join("\n")
      );
    }

    const key = this.pathToKey(memoryPath);

    // Check if it's a file
    const content = await this.redis.get(key);
    if (content !== null) {
      await this.refreshTtl(key);

      const lines = content.split("\n");
      let displayLines = lines;
      let startNum = 1;

      if (command.view_range && command.view_range.length === 2) {
        const rangeStart = command.view_range[0] ?? 1;
        const rangeEnd = command.view_range[1] ?? -1;
        const startLine = Math.max(1, rangeStart) - 1;
        const endLine = rangeEnd === -1 ? lines.length : rangeEnd;
        displayLines = lines.slice(startLine, endLine);
        startNum = startLine + 1;
      }

      const numberedLines = displayLines.map(
        (line, i) => `${String(i + startNum).padStart(4, " ")}: ${line}`
      );

      return numberedLines.join("\n");
    }

    // Check if it's a directory (has children)
    const pattern = `${key}/*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      throw new Error(`Path not found: ${memoryPath}`);
    }

    // Extract unique direct children
    const children = new Set<string>();
    const dirPrefix = `${key}/`;

    for (const childKey of keys) {
      if (childKey.startsWith(dirPrefix)) {
        const relativePath = childKey.slice(dirPrefix.length);
        const firstSegment = relativePath.split("/")[0];
        if (firstSegment) {
          // Check if this path is a file or directory
          const childPath = `${memoryPath}/${firstSegment}`;
          const isFileCheck = await this.isFile(childPath);
          children.add(isFileCheck ? firstSegment : `${firstSegment}/`);
        }
      }
    }

    const items = Array.from(children).sort();
    return (
      `Directory: ${memoryPath}\n` + items.map((item) => `- ${item}`).join("\n")
    );
  }

  /**
   * Create a new file.
   */
  async create(command: BetaMemoryTool20250818CreateCommand): Promise<string> {
    const memoryPath = command.path;
    const key = this.pathToKey(memoryPath);

    // Check if file already exists
    const exists = await this.redis.exists(key);
    if (exists) {
      throw new Error(`File already exists: ${memoryPath}`);
    }

    await this.setWithTtl(key, command.file_text);
    return `File created successfully at ${memoryPath}`;
  }

  /**
   * Replace text in a file.
   */
  async str_replace(
    command: BetaMemoryTool20250818StrReplaceCommand
  ): Promise<string> {
    const memoryPath = command.path;
    const key = this.pathToKey(memoryPath);

    const content = await this.redis.get(key);
    if (content === null) {
      throw new Error(`File not found: ${memoryPath}`);
    }

    const count = content.split(command.old_str).length - 1;

    if (count === 0) {
      throw new Error(`Text not found in ${memoryPath}`);
    } else if (count > 1) {
      throw new Error(
        `Text appears ${count} times in ${memoryPath}. Must be unique.`
      );
    }

    const newContent = content.replace(command.old_str, command.new_str);
    await this.setWithTtl(key, newContent);
    return `File ${memoryPath} has been edited`;
  }

  /**
   * Insert text at a specific line.
   */
  async insert(command: BetaMemoryTool20250818InsertCommand): Promise<string> {
    const memoryPath = command.path;
    const key = this.pathToKey(memoryPath);

    const content = await this.redis.get(key);
    if (content === null) {
      throw new Error(`File not found: ${memoryPath}`);
    }

    const lines = content.split("\n");

    if (command.insert_line < 0 || command.insert_line > lines.length) {
      throw new Error(
        `Invalid insert_line ${command.insert_line}. Must be 0-${lines.length}`
      );
    }

    lines.splice(
      command.insert_line,
      0,
      command.insert_text.replace(/\n$/, "")
    );
    await this.setWithTtl(key, lines.join("\n"));
    return `Text inserted at line ${command.insert_line} in ${memoryPath}`;
  }

  /**
   * Delete a file or directory.
   */
  async delete(command: BetaMemoryTool20250818DeleteCommand): Promise<string> {
    const memoryPath = command.path;

    if (memoryPath === "/memories") {
      throw new Error("Cannot delete the /memories directory itself");
    }

    const key = this.pathToKey(memoryPath);

    // Check if it's a file
    const isFile = await this.redis.exists(key);
    if (isFile) {
      await this.redis.del(key);
      return `File deleted: ${memoryPath}`;
    }

    // Check if it's a directory (has children)
    const pattern = `${key}/*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      throw new Error(`Path not found: ${memoryPath}`);
    }

    // Delete all children
    await this.redis.del(...keys);
    return `Directory deleted: ${memoryPath}`;
  }

  /**
   * Rename/move a file or directory.
   */
  async rename(command: BetaMemoryTool20250818RenameCommand): Promise<string> {
    const oldPath = command.old_path;
    const newPath = command.new_path;

    const oldKey = this.pathToKey(oldPath);
    const newKey = this.pathToKey(newPath);

    // Check if source is a file
    const content = await this.redis.get(oldKey);
    if (content !== null) {
      // Check if destination exists
      const destExists = await this.redis.exists(newKey);
      if (destExists) {
        throw new Error(`Destination already exists: ${newPath}`);
      }

      // Move the file
      await this.setWithTtl(newKey, content);
      await this.redis.del(oldKey);
      return `Renamed ${oldPath} to ${newPath}`;
    }

    // Check if source is a directory
    const pattern = `${oldKey}/*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      throw new Error(`Source path not found: ${oldPath}`);
    }

    // Check if any destination keys already exist
    for (const key of keys) {
      const relativePath = key.slice(oldKey.length);
      const destKey = newKey + relativePath;
      const exists = await this.redis.exists(destKey);
      if (exists) {
        throw new Error(
          `Destination already exists: ${newPath}${relativePath}`
        );
      }
    }

    // Move all children
    for (const key of keys) {
      const fileContent = await this.redis.get(key);
      if (fileContent !== null) {
        const relativePath = key.slice(oldKey.length);
        const destKey = newKey + relativePath;
        await this.setWithTtl(destKey, fileContent);
        await this.redis.del(key);
      }
    }

    return `Renamed ${oldPath} to ${newPath}`;
  }

  /**
   * Clear all memory for this agent context.
   * Useful for resetting state between sessions.
   */
  async clearAll(): Promise<void> {
    const pattern = `${this.keyPrefix}:/memories/*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Get all stored paths.
   * Useful for debugging or migration.
   */
  async getAllPaths(): Promise<string[]> {
    const pattern = `${this.keyPrefix}:/memories/*`;
    const keys = await this.redis.keys(pattern);
    return keys.map((key) => this.keyToPath(key)).sort();
  }
}
