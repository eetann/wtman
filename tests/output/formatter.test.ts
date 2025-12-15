import { describe, expect, test } from "bun:test";
import type { WorktreeInfo } from "../../src/git";
import {
  formatBranch,
  formatPath,
  formatWorktrees,
} from "../../src/output/formatter";

describe("formatPath", () => {
  test("returns '.' for current directory", () => {
    const result = formatPath("/a/b/c", "/a/b/c");
    expect(result).toBe(".");
  });

  test("returns relative path for sibling directory", () => {
    const result = formatPath("/a/b/d", "/a/b/c");
    expect(result).toBe("../d");
  });

  test("returns relative path for 2 levels up", () => {
    const result = formatPath("/a/d", "/a/b/c");
    expect(result).toBe("../../d");
  });

  test("returns absolute path for 3+ levels up", () => {
    const result = formatPath("/x/y/z", "/a/b/c");
    expect(result).toBe("/x/y/z");
  });
});

describe("formatBranch", () => {
  test("returns branch name for normal branch", () => {
    const info: WorktreeInfo = {
      path: "/path/to/worktree",
      branch: "main",
      isDetached: false,
    };
    const result = formatBranch(info);
    expect(result).toBe("main");
  });

  test("returns date and message for detached HEAD", () => {
    const info: WorktreeInfo = {
      path: "/path/to/worktree",
      branch: "",
      isDetached: true,
      commit: "abc1234",
      commitDate: "2024-01-15",
      commitMessage: "fix: something",
    };
    const result = formatBranch(info);
    expect(result).toBe("2024-01-15 fix: something");
  });
});

describe("formatWorktrees", () => {
  test("marks current worktree", () => {
    const worktrees: WorktreeInfo[] = [
      { path: "/a/b/c", branch: "main", isDetached: false },
      { path: "/a/b/d", branch: "feature", isDetached: false },
    ];
    const cwd = "/a/b/c";

    const result = formatWorktrees(worktrees, cwd);

    expect(result.length).toBe(2);
    expect(result[0]?.isCurrent).toBe(true);
    expect(result[0]?.path).toBe(".");
    expect(result[1]?.isCurrent).toBe(false);
    expect(result[1]?.path).toBe("../d");
  });
});
