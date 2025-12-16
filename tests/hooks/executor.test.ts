import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeHooks, isWorktreeAvailable } from "../../src/hooks/executor";
import type { HookContext } from "../../src/template/expander";

// Use real paths for testing
const mockContext: HookContext = {
  original: {
    path: process.cwd(),
    basename: "wtman",
  },
  worktree: {
    path: "/tmp",
    basename: "tmp",
    branch: "feature/test",
  },
};

describe("executeHooks", () => {
  test("executes multiple steps sequentially", async () => {
    const result = await executeHooks({
      hookType: "post-worktree-add",
      steps: [
        { name: "Step 1", run: "echo step1" },
        { name: "Step 2", run: "echo step2" },
      ],
      context: mockContext,
    });

    expect(result.success).toBe(true);
    expect(result.failedStep).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  test("stops execution on step failure", async () => {
    const result = await executeHooks({
      hookType: "post-worktree-add",
      steps: [
        { name: "Step 1", run: "echo step1" },
        { name: "Failing Step", run: "exit 1" },
        { name: "Step 3", run: "echo step3" },
      ],
      context: mockContext,
    });

    expect(result.success).toBe(false);
    expect(result.failedStep).toBe("Failing Step");
    expect(result.error).toBeDefined();
  });

  test("expands template variables in commands", async () => {
    const result = await executeHooks({
      hookType: "post-worktree-add",
      steps: [
        {
          name: "Echo branch",
          run: "echo ${{ worktree.branch }}",
        },
      ],
      context: mockContext,
    });

    expect(result.success).toBe(true);
  });

  test("uses worktree path as default for post-worktree-add", async () => {
    // post-worktree-add should run in worktree directory (/tmp)
    // Use pattern matching because /tmp is symlinked to /private/tmp on macOS
    const result = await executeHooks({
      hookType: "post-worktree-add",
      steps: [{ name: "Check pwd", run: "[[ $(pwd) == */tmp ]]" }],
      context: mockContext,
    });

    expect(result.success).toBe(true);
  });

  test("uses worktree path as default for pre-worktree-remove", async () => {
    // pre-worktree-remove should run in worktree directory (/tmp)
    // Use pattern matching because /tmp is symlinked to /private/tmp on macOS
    const result = await executeHooks({
      hookType: "pre-worktree-remove",
      steps: [{ name: "Check pwd", run: "[[ $(pwd) == */tmp ]]" }],
      context: mockContext,
    });

    expect(result.success).toBe(true);
  });

  test("uses original path as default for pre-worktree-add", async () => {
    // pre-worktree-add should run in original directory
    const result = await executeHooks({
      hookType: "pre-worktree-add",
      steps: [{ name: "Check pwd", run: `test $(pwd) = ${process.cwd()}` }],
      context: mockContext,
    });

    expect(result.success).toBe(true);
  });

  test("uses original path as default for post-worktree-remove", async () => {
    // post-worktree-remove should run in original directory
    const result = await executeHooks({
      hookType: "post-worktree-remove",
      steps: [{ name: "Check pwd", run: `test $(pwd) = ${process.cwd()}` }],
      context: mockContext,
    });

    expect(result.success).toBe(true);
  });
});

describe("isWorktreeAvailable", () => {
  test("returns true for post-worktree-add", () => {
    expect(isWorktreeAvailable("post-worktree-add")).toBe(true);
  });

  test("returns true for pre-worktree-remove", () => {
    expect(isWorktreeAvailable("pre-worktree-remove")).toBe(true);
  });

  test("returns false for pre-worktree-add", () => {
    expect(isWorktreeAvailable("pre-worktree-add")).toBe(false);
  });

  test("returns false for post-worktree-remove", () => {
    expect(isWorktreeAvailable("post-worktree-remove")).toBe(false);
  });
});

describe("executeHooks with actions", () => {
  let testDir: string;
  let originalDir: string;
  let worktreeDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `executor-action-test-${Date.now()}`);
    originalDir = join(testDir, "original");
    worktreeDir = join(testDir, "worktree");
    mkdirSync(originalDir, { recursive: true });
    mkdirSync(worktreeDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const createTestContext = (): HookContext => ({
    original: {
      path: originalDir,
      basename: "original",
    },
    worktree: {
      path: worktreeDir,
      basename: "worktree",
      branch: "feature/test",
    },
  });

  test("executes mkdir action", async () => {
    const context = createTestContext();
    const result = await executeHooks({
      hookType: "post-worktree-add",
      steps: [{ name: "Create temp dir", mkdir: "tmp" }],
      context,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(worktreeDir, "tmp"))).toBe(true);
  });

  test("executes remove action", async () => {
    const context = createTestContext();
    // Create file to be removed
    const filePath = join(worktreeDir, "to-remove.txt");
    writeFileSync(filePath, "content");
    expect(existsSync(filePath)).toBe(true);

    const result = await executeHooks({
      hookType: "pre-worktree-remove",
      steps: [{ name: "Remove file", remove: "to-remove.txt" }],
      context,
    });

    expect(result.success).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });

  test("executes copy action", async () => {
    const context = createTestContext();
    // Create source file
    const sourceFile = join(originalDir, ".env");
    writeFileSync(sourceFile, "KEY=value");
    expect(existsSync(sourceFile)).toBe(true);

    const result = await executeHooks({
      hookType: "post-worktree-add",
      steps: [{ name: "Copy env", copy: ".env" }],
      context,
    });

    expect(result.success).toBe(true);
    const destFile = join(worktreeDir, ".env");
    expect(existsSync(destFile)).toBe(true);
  });

  test("executes link action", async () => {
    const context = createTestContext();
    // Create source directory
    const sourceDir = join(originalDir, "node_modules");
    mkdirSync(sourceDir);
    expect(existsSync(sourceDir)).toBe(true);

    const result = await executeHooks({
      hookType: "post-worktree-add",
      steps: [{ name: "Link node_modules", link: "node_modules" }],
      context,
    });

    expect(result.success).toBe(true);
    const linkPath = join(worktreeDir, "node_modules");
    expect(existsSync(linkPath)).toBe(true);
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  });

  test("copy action fails in pre-worktree-add hook", async () => {
    const context = createTestContext();
    const result = await executeHooks({
      hookType: "pre-worktree-add",
      steps: [{ name: "Copy env", copy: ".env" }],
      context,
    });

    expect(result.success).toBe(false);
    expect(result.failedStep).toBe("Copy env");
    expect(result.error?.message).toContain("pre-worktree-add");
    expect(result.error?.message).toContain("worktree does not exist");
  });

  test("link action fails in post-worktree-remove hook", async () => {
    const context = createTestContext();
    const result = await executeHooks({
      hookType: "post-worktree-remove",
      steps: [{ name: "Link modules", link: "node_modules" }],
      context,
    });

    expect(result.success).toBe(false);
    expect(result.failedStep).toBe("Link modules");
    expect(result.error?.message).toContain("post-worktree-remove");
    expect(result.error?.message).toContain("worktree does not exist");
  });
});
