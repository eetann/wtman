import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "gunshi";
import { removeCommand } from "../../src/commands/remove";

/**
 * Helper to create a test git repository with wtman config
 */
function createTestRepo(): string {
  const testDir = mkdtempSync(join(tmpdir(), "wtman-remove-test-"));

  // Initialize git repository
  execSync("git init", { cwd: testDir });
  execSync("git config user.email 'test@example.com'", { cwd: testDir });
  execSync("git config user.name 'Test User'", { cwd: testDir });

  // Create initial commit
  writeFileSync(join(testDir, "README.md"), "# Test Repo\n");
  execSync("git add .", { cwd: testDir });
  execSync("git commit -m 'initial commit'", { cwd: testDir });

  // Create .wtman directory with config
  const wtmanDir = join(testDir, ".wtman");
  mkdirSync(wtmanDir);
  writeFileSync(
    join(wtmanDir, "config.yaml"),
    'worktree:\n  template: "../worktrees/${{ worktree.branch }}"\n  separator: hyphen\n  deleteBranch: ask\n',
  );

  return testDir;
}

/**
 * Helper to create a worktree in the test repo
 */
function createWorktree(
  mainTreePath: string,
  branch: string,
): { worktreePath: string; branch: string } {
  const worktreePath = join(mainTreePath, "..", "worktrees", branch);
  execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
    cwd: mainTreePath,
  });
  return { worktreePath, branch };
}

describe("wtman remove command", () => {
  let testDir: string;
  let originalCwd: string;

  beforeAll(() => {
    originalCwd = process.cwd();
    testDir = createTestRepo();
  });

  afterAll(() => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up test directory and worktrees
    try {
      // First remove any lingering worktrees
      const worktreeList = execSync("git worktree list --porcelain", {
        cwd: testDir,
        encoding: "utf-8",
      });
      const worktrees = worktreeList.split("\n\n");
      for (const wt of worktrees) {
        const match = wt.match(/^worktree (.+)$/m);
        const worktreePath = match?.[1];
        if (worktreePath && worktreePath !== testDir) {
          try {
            execSync(`git worktree remove "${worktreePath}" --force`, {
              cwd: testDir,
            });
          } catch {
            // Ignore errors
          }
          rmSync(worktreePath, { recursive: true, force: true });
        }
      }
    } catch {
      // Ignore errors
    }

    // Clean up test directory
    rmSync(testDir, { recursive: true, force: true });
    // Clean up worktrees directory
    const worktreesDir = join(testDir, "..", "worktrees");
    if (existsSync(worktreesDir)) {
      rmSync(worktreesDir, { recursive: true, force: true });
    }
  });

  test("removes worktree by name with --force --delete-branch", async () => {
    // Create a worktree
    const { worktreePath, branch } = createWorktree(testDir, "test-branch-1");

    // Stay in main worktree (not the worktree being deleted)
    process.chdir(testDir);

    // Mock console.log to capture output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = mock((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      await cli([branch, "--force", "--delete-branch"], removeCommand, {
        name: "wtman remove",
      });

      // Verify output contains success message
      expect(logs.some((log) => log.includes("Removed worktree:"))).toBe(true);
      expect(logs.some((log) => log.includes("Deleted branch:"))).toBe(true);

      // Verify worktree was removed
      expect(existsSync(worktreePath)).toBe(false);

      // Verify branch was deleted
      const branches = execSync("git branch", {
        cwd: testDir,
        encoding: "utf-8",
      });
      expect(branches).not.toContain(branch);
    } finally {
      console.log = originalLog;
    }
  });

  test("fails when trying to remove main worktree by name", async () => {
    // Stay in main worktree
    process.chdir(testDir);

    // Get the main branch name (main or master)
    const mainBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: testDir,
      encoding: "utf-8",
    }).trim();

    // Mock console.error to capture error output
    const errors: string[] = [];
    const originalError = console.error;
    console.error = mock((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    // Mock process.exit to prevent actual exit
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = mock((code?: number) => {
      exitCode = code;
      throw new Error("process.exit called");
    }) as never;

    try {
      await cli([mainBranch, "--force"], removeCommand, {
        name: "wtman remove",
      });
    } catch {
      // Expected to throw due to mocked process.exit
    } finally {
      console.error = originalError;
      process.exit = originalExit;
    }

    // Verify error message
    expect(
      errors.some((err) => err.includes("Cannot remove main worktree")),
    ).toBe(true);
    expect(exitCode).toBe(1);
  });

  test("keeps branch when --keep-branch is specified", async () => {
    // Create a worktree
    const { worktreePath, branch } = createWorktree(testDir, "test-branch-2");

    // Stay in main worktree
    process.chdir(testDir);

    // Mock console.log to capture output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = mock((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      await cli([branch, "--force", "--keep-branch"], removeCommand, {
        name: "wtman remove",
      });

      // Verify worktree was removed
      expect(logs.some((log) => log.includes("Removed worktree:"))).toBe(true);

      // Verify branch deletion message is NOT present
      expect(logs.some((log) => log.includes("Deleted branch:"))).toBe(false);

      // Verify worktree was removed
      expect(existsSync(worktreePath)).toBe(false);

      // Verify branch still exists
      const branches = execSync("git branch", {
        cwd: testDir,
        encoding: "utf-8",
      });
      expect(branches).toContain(branch);
    } finally {
      console.log = originalLog;
    }
  });

  test("automatically deletes branch when config deleteBranch is 'always'", async () => {
    // Update config to set deleteBranch to "always"
    const wtmanDir = join(testDir, ".wtman");
    writeFileSync(
      join(wtmanDir, "config.yaml"),
      'worktree:\n  template: "../worktrees/${{ worktree.branch }}"\n  separator: hyphen\n  deleteBranch: always\n',
    );

    // Create a worktree
    const { worktreePath, branch } = createWorktree(testDir, "test-branch-3");

    // Stay in main worktree
    process.chdir(testDir);

    // Mock console.log to capture output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = mock((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      await cli([branch, "--force"], removeCommand, {
        name: "wtman remove",
      });

      // Verify worktree was removed
      expect(logs.some((log) => log.includes("Removed worktree:"))).toBe(true);

      // Verify branch was deleted
      expect(logs.some((log) => log.includes("Deleted branch:"))).toBe(true);

      // Verify worktree was removed
      expect(existsSync(worktreePath)).toBe(false);

      // Verify branch was deleted
      const branches = execSync("git branch", {
        cwd: testDir,
        encoding: "utf-8",
      });
      expect(branches).not.toContain(branch);
    } finally {
      console.log = originalLog;
      // Reset config back to "ask"
      writeFileSync(
        join(wtmanDir, "config.yaml"),
        'worktree:\n  template: "../worktrees/${{ worktree.branch }}"\n  separator: hyphen\n  deleteBranch: ask\n',
      );
    }
  });

  test("keeps branch when config deleteBranch is 'never'", async () => {
    // Update config to set deleteBranch to "never"
    const wtmanDir = join(testDir, ".wtman");
    writeFileSync(
      join(wtmanDir, "config.yaml"),
      'worktree:\n  template: "../worktrees/${{ worktree.branch }}"\n  separator: hyphen\n  deleteBranch: never\n',
    );

    // Create a worktree
    const { worktreePath, branch } = createWorktree(testDir, "test-branch-4");

    // Stay in main worktree
    process.chdir(testDir);

    // Mock console.log to capture output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = mock((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      await cli([branch, "--force"], removeCommand, {
        name: "wtman remove",
      });

      // Verify worktree was removed
      expect(logs.some((log) => log.includes("Removed worktree:"))).toBe(true);

      // Verify branch deletion message is NOT present
      expect(logs.some((log) => log.includes("Deleted branch:"))).toBe(false);

      // Verify worktree was removed
      expect(existsSync(worktreePath)).toBe(false);

      // Verify branch still exists
      const branches = execSync("git branch", {
        cwd: testDir,
        encoding: "utf-8",
      });
      expect(branches).toContain(branch);
    } finally {
      console.log = originalLog;
      // Reset config back to "ask"
      writeFileSync(
        join(wtmanDir, "config.yaml"),
        'worktree:\n  template: "../worktrees/${{ worktree.branch }}"\n  separator: hyphen\n  deleteBranch: ask\n',
      );
    }
  });

  test("fails when non-existing worktree name is specified", async () => {
    // Stay in main worktree
    process.chdir(testDir);

    // Mock console.error to capture error output
    const errors: string[] = [];
    const originalError = console.error;
    console.error = mock((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    // Mock process.exit to prevent actual exit
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = mock((code?: number) => {
      exitCode = code;
      throw new Error("process.exit called");
    }) as never;

    try {
      await cli(["non-existing-branch", "--force"], removeCommand, {
        name: "wtman remove",
      });
    } catch {
      // Expected to throw due to mocked process.exit
    } finally {
      console.error = originalError;
      process.exit = originalExit;
    }

    // Verify error message
    expect(errors.some((err) => err.includes("Worktree not found:"))).toBe(
      true,
    );
    expect(exitCode).toBe(1);
  });

  test("fails when trying to remove current directory worktree", async () => {
    // Create a worktree
    const { worktreePath, branch } = createWorktree(testDir, "test-branch-5");

    // Move to the worktree
    process.chdir(worktreePath);

    // Mock console.error to capture error output
    const errors: string[] = [];
    const originalError = console.error;
    console.error = mock((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    // Mock process.exit to prevent actual exit
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = mock((code?: number) => {
      exitCode = code;
      throw new Error("process.exit called");
    }) as never;

    try {
      await cli([branch, "--force"], removeCommand, {
        name: "wtman remove",
      });
    } catch {
      // Expected to throw due to mocked process.exit
    } finally {
      console.error = originalError;
      process.exit = originalExit;
      // Move back to main worktree for cleanup
      process.chdir(testDir);
    }

    // Verify error message
    expect(
      errors.some((err) =>
        err.includes("Cannot remove the worktree you are currently in"),
      ),
    ).toBe(true);
    expect(exitCode).toBe(1);

    // Verify worktree still exists
    expect(existsSync(worktreePath)).toBe(true);
  });
});
