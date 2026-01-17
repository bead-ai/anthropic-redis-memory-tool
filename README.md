# anthropic-redis-memory-tool

Redis implementation for Anthropic Agent SDK memory tool handlers. This package provides a persistent, distributed memory backend for AI agents using the Anthropic SDK's beta memory tool feature.

## Installation

```bash
npm install anthropic-redis-memory-tool ioredis @anthropic-ai/sdk
```

## Usage

### Basic Usage

```typescript
import Redis from "ioredis";
import Anthropic from "@anthropic-ai/sdk";
import { betaMemoryTool } from "@anthropic-ai/sdk/helpers/beta/memory";
import { RedisMemoryTool } from "anthropic-redis-memory-tool";

// Create Redis client
const redis = new Redis();

// Create memory tool with Redis backend
const memoryTool = new RedisMemoryTool(redis);

// Use with Anthropic SDK
const client = new Anthropic();
const memory = betaMemoryTool(memoryTool);

const runner = client.beta.messages.toolRunner({
  messages: [{ role: "user", content: "Remember that I prefer TypeScript" }],
  tools: [memory],
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
});

for await (const message of runner) {
  console.log(message);
}
```

### With Agent Context and TTL

Use `agentContext` to namespace memories for different agent sessions, and `ttl` to automatically expire memories:

```typescript
import Redis from "ioredis";
import { RedisMemoryTool } from "anthropic-redis-memory-tool";

const redis = new Redis({
  host: "localhost",
  port: 6379,
});

const memoryTool = new RedisMemoryTool(redis, {
  // Namespace for this agent instance
  agentContext: "user-123-session-456",
  // Memories expire after 1 hour (in seconds)
  ttl: 3600,
  // Custom key prefix (default: "memory")
  keyPrefix: "my-app",
});
```

### Configuration Options

| Option         | Type     | Default     | Description                              |
| -------------- | -------- | ----------- | ---------------------------------------- |
| `keyPrefix`    | `string` | `"memory"`  | Prefix for all Redis keys                |
| `agentContext` | `string` | `undefined` | Agent/session identifier for namespacing |
| `ttl`          | `number` | `undefined` | Time-to-live in seconds for stored items |

### Key Structure

Redis keys are structured as: `{keyPrefix}:{agentContext}:{path}`

For example, with `keyPrefix: "memory"` and `agentContext: "agent-1"`:

- `/memories/notes.txt` becomes `memory:agent-1:/memories/notes.txt`

### Utility Methods

```typescript
// Clear all memories for this agent context
await memoryTool.clearAll();

// Get all stored paths (useful for debugging)
const paths = await memoryTool.getAllPaths();
console.log(paths); // ['/memories/notes.txt', '/memories/projects/todo.md']
```

### With Context Management

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { betaMemoryTool } from "@anthropic-ai/sdk/helpers/beta/memory";
import Redis from "ioredis";
import { RedisMemoryTool } from "anthropic-redis-memory-tool";

const redis = new Redis();
const memoryTool = new RedisMemoryTool(redis, { agentContext: "my-agent" });
const memory = betaMemoryTool(memoryTool);

const client = new Anthropic();

const runner = client.beta.messages.toolRunner({
  messages: [{ role: "user", content: "Remember my preferences" }],
  tools: [memory],
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  context_management: {
    edits: [
      {
        type: "clear_tool_uses_20250919",
        trigger: { type: "input_tokens", value: 30000 },
        keep: { type: "tool_uses", value: 3 },
      },
    ],
  },
  betas: ["context-management-2025-06-27"],
});

const result = await runner.runUntilDone();
```

## API Reference

### `RedisMemoryTool`

Implements the `MemoryToolHandlers` interface from the Anthropic SDK.

#### Constructor

```typescript
new RedisMemoryTool(redis: Redis, config?: RedisMemoryToolConfig)
```

#### Methods

| Method                 | Description                               |
| ---------------------- | ----------------------------------------- |
| `view(command)`        | View a file or directory contents         |
| `create(command)`      | Create a new file                         |
| `str_replace(command)` | Replace text in a file                    |
| `insert(command)`      | Insert text at a specific line            |
| `delete(command)`      | Delete a file or directory                |
| `rename(command)`      | Rename/move a file or directory           |
| `clearAll()`           | Clear all memories for this agent context |
| `getAllPaths()`        | Get all stored paths                      |

## Development

### Prerequisites

- Node.js >= 18
- npm

### Setup

```bash
npm install
```

### Scripts

```bash
npm run build        # Build the package
npm run dev          # Build with watch mode
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm run format       # Format code with Prettier
npm run format:check # Check code formatting
npm run typecheck    # Run TypeScript type checking
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) specification. Commit messages are enforced via [commitlint](https://commitlint.js.org/).

### Commit Message Format

```
<type>(<scope>): <subject>
```

### Types

| Type       | Description                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only changes                              |
| `style`    | Code style changes (formatting, semicolons)             |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvements                                |
| `test`     | Adding or correcting tests                              |
| `build`    | Changes to build system or dependencies                 |
| `ci`       | Changes to CI configuration                             |
| `chore`    | Other changes that don't modify src or test             |
| `revert`   | Reverts a previous commit                               |

### Examples

```bash
feat: add redis connection pooling
fix: handle connection timeout errors
docs: update installation instructions
refactor(memory): simplify memory store logic
```

## Release Process

This project uses [standard-version](https://github.com/conventional-changelog/standard-version) for automated versioning and CHANGELOG generation based on Conventional Commits.

### Creating a Release

1. **Ensure all changes are committed** following the conventional commit format.

2. **Run the release command:**

   ```bash
   # Automatic version bump based on commits (recommended)
   npm run release

   # Or specify version type explicitly
   npm run release:patch  # 0.1.0 -> 0.1.1
   npm run release:minor  # 0.1.0 -> 0.2.0
   npm run release:major  # 0.1.0 -> 1.0.0

   # First release (won't bump version, just creates changelog)
   npm run release:first

   # Dry run to preview changes
   npm run release:dry
   ```

3. **Push the commit and tag:**

   ```bash
   git push --follow-tags origin main
   ```

4. **GitHub Actions** will automatically:
   - Create a GitHub Release
   - Publish to npm (requires `NPM_TOKEN` secret)

### Version Bump Rules

| Commit Type       | Version Bump |
| ----------------- | ------------ |
| `fix`             | Patch        |
| `feat`            | Minor        |
| `BREAKING CHANGE` | Major        |

### Manual Version Override

To release a specific version:

```bash
npx standard-version --release-as 1.0.0
```

## CI/CD

### GitHub Actions Workflows

- **CI** (`ci.yml`): Runs on push/PR to main
  - Linting and type checking
  - Build verification
  - Commit message validation (PRs only)

- **Release** (`release.yml`): Runs on version tags (`v*`)
  - Creates GitHub Release
  - Publishes to npm

### Required Secrets

| Secret      | Description                         |
| ----------- | ----------------------------------- |
| `NPM_TOKEN` | npm automation token for publishing |

## License

MIT
