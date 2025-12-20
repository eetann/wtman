# wtman

A CLI tool for managing Git worktrees with metadata (descriptions and tags).

## Features

- `add` - Add a new worktree with optional description and tags
- `list` - List all worktrees (supports tag filtering)
- `remove` - Remove worktrees interactively or by name (supports batch operations)

## CLI Usage

This CLI uses a subcommand-based architecture. Run `--help` on any command for details:

```sh
wtman --help
wtman add --help
wtman list --help
wtman remove --help
```

## Project Structure

- `src/commands/` - Subcommand implementations using gunshi CLI framework
- `tests/` - Test files
- `docs/` - User documentation (configuration guide, etc.)

---

# Development

Use Bun instead of Node.js/npm/yarn/pnpm.

## Scripts

```sh
bun run lint       # Run linter (Biome)
bun run format     # Format code (Biome)
bun run typecheck  # Type check
bun run test       # Run tests
bun run build      # Build for production
```

## APIs

- It will be distributed as a CLI, and since users who do not use Bun will also execute it, the use of Bun APIs is prohibited. Bun APIs may only be used in tests.
    - Example: Prefer `node:fs`'s readFile/writeFile over `Bun.file`

## Testing

Use `bun test` to run tests.

```ts#tests/foo.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

## Code Quality

- Format and lint using Biome (configured in `biome.jsonc`)
- The project uses tab indentation and double quotes
- **Use English for all comments and commit messages** 
