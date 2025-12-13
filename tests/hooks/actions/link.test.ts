import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { linkAction } from "../../../src/hooks/actions/link";

describe("linkAction", () => {
  let originalDir: string;
  let worktreeDir: string;

  beforeEach(() => {
    const baseDir = join(tmpdir(), `link-test-${Date.now()}`);
    originalDir = join(baseDir, "original");
    worktreeDir = join(baseDir, "worktree");
    mkdirSync(originalDir, { recursive: true });
    mkdirSync(worktreeDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up the base directory
    const baseDir = join(originalDir, "..");
    rmSync(baseDir, { recursive: true, force: true });
  });

  test("creates a symbolic link with relative path", async () => {
    // Create source directory
    const sourceDir = join(originalDir, "node_modules");
    mkdirSync(sourceDir);
    writeFileSync(join(sourceDir, "package.json"), "{}");
    expect(existsSync(sourceDir)).toBe(true);

    const result = await linkAction(["node_modules"], {
      originalPath: originalDir,
      worktreePath: worktreeDir,
    });

    expect(result.success).toBe(true);
    const linkPath = join(worktreeDir, "node_modules");
    expect(existsSync(linkPath)).toBe(true);
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);

    // Verify it's a relative path
    const linkTarget = readlinkSync(linkPath);
    const expectedRelativePath = relative(worktreeDir, sourceDir);
    expect(linkTarget).toBe(expectedRelativePath);
  });

  test("returns error when source does not exist", async () => {
    const result = await linkAction(["non-existent"], {
      originalPath: originalDir,
      worktreePath: worktreeDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain("ENOENT");
  });

  test("returns error when destination already exists", async () => {
    // Create source directory
    const sourceDir = join(originalDir, "node_modules");
    mkdirSync(sourceDir);
    expect(existsSync(sourceDir)).toBe(true);

    // Create existing file in destination
    const destPath = join(worktreeDir, "node_modules");
    mkdirSync(destPath);
    expect(existsSync(destPath)).toBe(true);

    const result = await linkAction(["node_modules"], {
      originalPath: originalDir,
      worktreePath: worktreeDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain("EEXIST");
  });
});
