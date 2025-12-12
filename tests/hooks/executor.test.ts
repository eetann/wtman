import { describe, expect, test } from "bun:test";
import { executeHooks } from "../../src/hooks/executor";
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
    const result = await executeHooks({
      hookType: "post-worktree-add",
      steps: [{ name: "Check pwd", run: "test $(pwd) = /private/tmp" }],
      context: mockContext,
    });

    expect(result.success).toBe(true);
  });

  test("uses worktree path as default for pre-worktree-remove", async () => {
    // pre-worktree-remove should run in worktree directory (/tmp)
    const result = await executeHooks({
      hookType: "pre-worktree-remove",
      steps: [{ name: "Check pwd", run: "test $(pwd) = /private/tmp" }],
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
