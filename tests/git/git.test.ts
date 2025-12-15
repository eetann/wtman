import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import {
  addWorktree,
  branchExists,
  getWorktreeByBranchName,
  getWorktreeByPath,
  listWorktrees,
} from "../../src/git";

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

describe("listWorktrees", () => {
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
  });

  afterAll(() => {
    // Clean up the temporary directory
    rmSync(testDir, { recursive: true, force: true });
  });

  test("returns main worktree when only main exists", () => {
    const worktrees = listWorktrees(testDir);
    expect(worktrees.length).toBe(1);
    // biome-ignore lint/style/noNonNullAssertion: in test
    const worktree = worktrees[0]!;
    // Use realpathSync to handle symlinks (/var -> /private/var on macOS)
    expect(normalize(worktree.path)).toBe(normalize(realpathSync(testDir)));
    // Branch should be main or master
    expect(["main", "master"]).toContain(worktree.branch);
  });

  test("returns multiple worktrees when they exist", () => {
    // Create a worktree
    const worktreePath = join(testDir, "..", "test-worktree");
    execSync(`git worktree add "${worktreePath}" -b feature-branch`, {
      cwd: testDir,
    });

    try {
      const worktrees = listWorktrees(testDir);
      expect(worktrees.length).toBe(2);

      // Find main worktree
      const mainWorktree = worktrees.find((w) =>
        ["main", "master"].includes(w.branch),
      );
      expect(mainWorktree).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: in test
      expect(normalize(mainWorktree!.path)).toBe(
        normalize(realpathSync(testDir)),
      );

      // Find feature worktree
      const featureWorktree = worktrees.find(
        (w) => w.branch === "feature-branch",
      );
      expect(featureWorktree).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: in test
      expect(normalize(featureWorktree!.path)).toBe(
        normalize(realpathSync(worktreePath)),
      );
    } finally {
      // Clean up
      execSync(`git worktree remove "${worktreePath}"`, { cwd: testDir });
    }
  });

  test("returns isDetached=true for detached HEAD worktree", () => {
    // Get current commit hash
    const commitHash = execSync("git rev-parse HEAD", {
      cwd: testDir,
      encoding: "utf-8",
    }).trim();

    // Create a detached HEAD worktree
    const worktreePath = join(testDir, "..", "detached-worktree");
    execSync(`git worktree add --detach "${worktreePath}" ${commitHash}`, {
      cwd: testDir,
    });

    try {
      const worktrees = listWorktrees(testDir);
      const detachedWorktree = worktrees.find(
        (w) => normalize(w.path) === normalize(realpathSync(worktreePath)),
      );

      expect(detachedWorktree).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: in test
      expect(detachedWorktree!.isDetached).toBe(true);
      // biome-ignore lint/style/noNonNullAssertion: in test
      expect(detachedWorktree!.branch).toBe("");
      // biome-ignore lint/style/noNonNullAssertion: in test
      expect(detachedWorktree!.commit).toBe(commitHash);
      // biome-ignore lint/style/noNonNullAssertion: in test
      expect(detachedWorktree!.commitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // biome-ignore lint/style/noNonNullAssertion: in test
      expect(detachedWorktree!.commitMessage).toBe("initial commit");
    } finally {
      // Clean up
      execSync(`git worktree remove "${worktreePath}"`, { cwd: testDir });
    }
  });
});

describe("getWorktreeByBranchName", () => {
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
    // Create a worktree
    worktreePath = join(testDir, "..", "feature-worktree");
    execSync(`git worktree add "${worktreePath}" -b feature/test-branch`, {
      cwd: testDir,
    });
  });

  afterAll(() => {
    // Clean up worktree first
    execSync(`git worktree remove "${worktreePath}"`, { cwd: testDir });
    // Clean up the temporary directory
    rmSync(testDir, { recursive: true, force: true });
  });

  test("finds worktree by branch name", () => {
    const worktrees = listWorktrees(testDir);
    const worktree = getWorktreeByBranchName("feature/test-branch", worktrees);
    expect(worktree).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: in test
    expect(worktree!.branch).toBe("feature/test-branch");
    // biome-ignore lint/style/noNonNullAssertion: in test
    expect(normalize(worktree!.path)).toBe(
      normalize(realpathSync(worktreePath)),
    );
  });

  test("returns undefined for non-existing branch name", () => {
    const worktrees = listWorktrees(testDir);
    const worktree = getWorktreeByBranchName("non-existing-branch", worktrees);
    expect(worktree).toBeUndefined();
  });
});

describe("getWorktreeByPath", () => {
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
    // Create a worktree
    worktreePath = join(testDir, "..", "feature-worktree");
    execSync(`git worktree add "${worktreePath}" -b feature/test-branch`, {
      cwd: testDir,
    });
  });

  afterAll(() => {
    // Clean up worktree first
    execSync(`git worktree remove "${worktreePath}"`, { cwd: testDir });
    // Clean up the temporary directory
    rmSync(testDir, { recursive: true, force: true });
  });

  test("finds worktree by full path", () => {
    const worktrees = listWorktrees(testDir);
    const realWorktreePath = realpathSync(worktreePath);
    const worktree = getWorktreeByPath(realWorktreePath, worktrees);
    expect(worktree).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: in test
    expect(worktree!.branch).toBe("feature/test-branch");
    // biome-ignore lint/style/noNonNullAssertion: in test
    expect(normalize(worktree!.path)).toBe(normalize(realWorktreePath));
  });

  test("finds worktree by basename", () => {
    const worktrees = listWorktrees(testDir);
    const worktree = getWorktreeByPath("feature-worktree", worktrees);
    expect(worktree).toBeDefined();
    // biome-ignore lint/style/noNonNullAssertion: in test
    expect(worktree!.branch).toBe("feature/test-branch");
  });

  test("returns undefined for non-existing path", () => {
    const worktrees = listWorktrees(testDir);
    const worktree = getWorktreeByPath("/non/existing/path", worktrees);
    expect(worktree).toBeUndefined();
  });
});
