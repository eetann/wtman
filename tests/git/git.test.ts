import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addWorktree, branchExists } from "../../src/git";

describe("branchExists", () => {
  let testDir: string;

  beforeAll(() => {
    // Create a temporary directory for testing
    testDir = mkdtempSync(join(tmpdir(), "wtman-test-"));
    // Initialize a git repository
    execSync("git init", { cwd: testDir });
    execSync("git config user.email 'test@example.com'", { cwd: testDir });
    execSync("git config user.name 'Test User'", { cwd: testDir });
    // Create an initial commit
    execSync("touch README.md", { cwd: testDir });
    execSync("git add .", { cwd: testDir });
    execSync("git commit -m 'initial commit'", { cwd: testDir });
    // Create a test branch
    execSync("git branch test-branch", { cwd: testDir });
  });

  afterAll(() => {
    // Clean up the temporary directory
    rmSync(testDir, { recursive: true, force: true });
  });

  test("returns true for existing branch", () => {
    expect(branchExists("test-branch", testDir)).toBe(true);
  });

  test("returns true for main/master branch", () => {
    // The default branch might be main or master depending on git config
    const isMain = branchExists("main", testDir);
    const isMaster = branchExists("master", testDir);
    expect(isMain || isMaster).toBe(true);
  });

  test("returns false for non-existing branch", () => {
    expect(branchExists("non-existing-branch", testDir)).toBe(false);
  });
});

describe("addWorktree", () => {
  let testDir: string;
  let worktreePath: string;

  beforeAll(() => {
    // Create a temporary directory for testing
    testDir = mkdtempSync(join(tmpdir(), "wtman-test-"));
    // Initialize a git repository
    execSync("git init", { cwd: testDir });
    execSync("git config user.email 'test@example.com'", { cwd: testDir });
    execSync("git config user.name 'Test User'", { cwd: testDir });
    // Create an initial commit
    execSync("touch README.md", { cwd: testDir });
    execSync("git add .", { cwd: testDir });
    execSync("git commit -m 'initial commit'", { cwd: testDir });
  });

  afterAll(() => {
    // Clean up the temporary directory and worktree
    rmSync(testDir, { recursive: true, force: true });
    if (worktreePath) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  test("creates worktree with new branch", () => {
    worktreePath = join(tmpdir(), "wtman-worktree-new-branch");
    addWorktree(worktreePath, "new-feature-branch", testDir);

    // Verify worktree was created
    const result = execSync("git worktree list", {
      cwd: testDir,
      encoding: "utf-8",
    });
    expect(result).toContain("new-feature-branch");
    expect(result).toContain(worktreePath);

    // Clean up
    execSync(`git worktree remove "${worktreePath}"`, { cwd: testDir });
    rmSync(worktreePath, { recursive: true, force: true });
  });

  test("creates worktree with existing branch", () => {
    // Create a branch first
    execSync("git branch existing-branch", { cwd: testDir });

    worktreePath = join(tmpdir(), "wtman-worktree-existing-branch");
    addWorktree(worktreePath, "existing-branch", testDir);

    // Verify worktree was created
    const result = execSync("git worktree list", {
      cwd: testDir,
      encoding: "utf-8",
    });
    expect(result).toContain("existing-branch");
    expect(result).toContain(worktreePath);

    // Clean up
    execSync(`git worktree remove "${worktreePath}"`, { cwd: testDir });
    rmSync(worktreePath, { recursive: true, force: true });
  });
});
