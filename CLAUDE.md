Default to using Bun instead of Node.js.

- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`

## APIs

- It will be distributed as a CLI, and since users who do not use Bun will also execute it, the use of Bun APIs is prohibited. Bun APIs may only be used in tests.
    - Example: Prefer `node:fs`'s readFile/writeFile over `Bun.file`

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

### Code Quality
- Format and lint using Biome (configured in `biome.jsonc`)
- The project uses tab indentation and double quotes
- No explicit lint/format commands in package.json - use your editor's Biome integration
-  **Use English for all comments and commit messages** 
