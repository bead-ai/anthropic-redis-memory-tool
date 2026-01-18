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

This project uses [release-please](https://github.com/googleapis/release-please) for automated versioning and CHANGELOG generation based on Conventional Commits.

### How It Works

1. **Push commits to `main`** following the conventional commit format
2. **Release Please** automatically creates/updates a Release PR with:
   - Version bump based on commit types
   - Updated CHANGELOG.md
   - Updated package.json version
3. **Merge the Release PR** to trigger:
   - GitHub Release creation
   - npm publish

### Version Bump Rules

| Commit Type       | Version Bump |
| ----------------- | ------------ |
| `fix`             | Patch        |
| `feat`            | Minor        |
| `BREAKING CHANGE` | Major        |

## CI/CD

### GitHub Actions Workflows

- **CI** (`ci.yml`): Runs on push/PR to main
  - Linting and type checking
  - Build verification

- **Release Please** (`release-please.yml`): Runs on push to main
  - Creates/updates Release PR with changelog and version bump

- **Publish** (`release.yml`): Runs when a release is published
  - Publishes to npm

### Required Setup

**Repository Settings** (Settings → Actions → General → Workflow permissions):
- ☑️ Allow GitHub Actions to create and approve pull requests

### Required Secrets

| Secret                 | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `NPM_TOKEN`            | npm automation token for publishing                    |
| `RELEASE_PLEASE_TOKEN` | (Optional) PAT with `contents:write` and `pull-requests:write` scopes. Use if you can't enable the workflow permission above. |

## License

MIT
