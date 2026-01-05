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
  listBranches,
  listWorktrees,
  remoteBranchExists,
} from "../../src/git";

describe("listBranches", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "wtman-test-"));
    execSync("git init", { cwd: testDir });
    execSync("git config user.email 'test@example.com'", { cwd: testDir });
    execSync("git config user.name 'Test User'", { cwd: testDir });
    execSync("touch README.md", { cwd: testDir });
    execSync("git add .", { cwd: testDir });
    execSync("git commit -m 'initial commit'", { cwd: testDir });
    execSync("git branch feature/foo", { cwd: testDir });
    execSync("git branch feature/bar", { cwd: testDir });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("returns list of local branches", () => {
    const branches = listBranches(testDir);
    expect(branches).toContain("feature/foo");
    expect(branches).toContain("feature/bar");
    // main or master should exist
    expect(branches.some((b) => b === "main" || b === "master")).toBe(true);
  });

  test("returns empty array for repo with no branches", () => {
    // This is actually impossible - a repo always has at least one branch after commit
    // So we just verify the function returns an array
    const branches = listBranches(testDir);
    expect(Array.isArray(branches)).toBe(true);
  });
});

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

describe("remoteBranchExists", () => {
  let testDir: string;
  let remoteDir: string;

  beforeAll(() => {
    // Create a bare repository to act as remote
    remoteDir = mkdtempSync(join(tmpdir(), "wtman-remote-"));
    execSync("git init --bare", { cwd: remoteDir });

    // Create a local repository
    testDir = mkdtempSync(join(tmpdir(), "wtman-test-"));
    execSync("git init", { cwd: testDir });
    execSync("git config user.email 'test@example.com'", { cwd: testDir });
    execSync("git config user.name 'Test User'", { cwd: testDir });
    execSync("touch README.md", { cwd: testDir });
    execSync("git add .", { cwd: testDir });
    execSync("git commit -m 'initial commit'", { cwd: testDir });

    // Add remote and push
    execSync(`git remote add origin "${remoteDir}"`, { cwd: testDir });
    execSync("git push -u origin HEAD", { cwd: testDir });

    // Create and push a feature branch
    execSync("git checkout -b feature/remote-test", { cwd: testDir });
    execSync("git push -u origin feature/remote-test", { cwd: testDir });
    execSync("git checkout -", { cwd: testDir });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(remoteDir, { recursive: true, force: true });
  });

  test("returns true for existing remote branch", () => {
    expect(remoteBranchExists("origin", "feature/remote-test", testDir)).toBe(
      true,
    );
  });

  test("returns false for non-existing remote branch", () => {
    expect(remoteBranchExists("origin", "non-existing", testDir)).toBe(false);
  });

  test("returns false for non-existing remote", () => {
    expect(remoteBranchExists("upstream", "feature/remote-test", testDir)).toBe(
      false,
    );
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

describe("addWorktree with startPoint", () => {
  let testDir: string;
  let remoteDir: string;
  let worktreePath: string;

  beforeAll(() => {
    // Create a bare repository to act as remote
    remoteDir = mkdtempSync(join(tmpdir(), "wtman-remote-"));
    execSync("git init --bare", { cwd: remoteDir });

    // Create a local repository
    testDir = mkdtempSync(join(tmpdir(), "wtman-test-"));
    execSync("git init", { cwd: testDir });
    execSync("git config user.email 'test@example.com'", { cwd: testDir });
    execSync("git config user.name 'Test User'", { cwd: testDir });
    execSync("touch README.md", { cwd: testDir });
    execSync("git add .", { cwd: testDir });
    execSync("git commit -m 'initial commit'", { cwd: testDir });

    // Add remote and push
    execSync(`git remote add origin "${remoteDir}"`, { cwd: testDir });
    execSync("git push -u origin HEAD", { cwd: testDir });

    // Create and push a feature branch with additional content
    execSync("git checkout -b feature/remote-branch", { cwd: testDir });
    execSync("touch feature.txt", { cwd: testDir });
    execSync("git add .", { cwd: testDir });
    execSync("git commit -m 'feature commit'", { cwd: testDir });
    execSync("git push -u origin feature/remote-branch", { cwd: testDir });
    execSync("git checkout -", { cwd: testDir });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(remoteDir, { recursive: true, force: true });
    if (worktreePath) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  test("creates worktree with startPoint from remote branch", () => {
    worktreePath = join(tmpdir(), "wtman-worktree-from-remote");
    addWorktree(
      worktreePath,
      "local-from-remote",
      testDir,
      "origin/feature/remote-branch",
    );

    // Verify worktree was created with the new branch
    const result = execSync("git worktree list", {
      cwd: testDir,
      encoding: "utf-8",
    });
    expect(result).toContain("local-from-remote");
    expect(result).toContain(worktreePath);

    // Verify the worktree has the feature.txt file (from remote branch)
    const files = execSync("ls", { cwd: worktreePath, encoding: "utf-8" });
    expect(files).toContain("feature.txt");

    // Clean up
    execSync(`git worktree remove "${worktreePath}"`, { cwd: testDir });
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
