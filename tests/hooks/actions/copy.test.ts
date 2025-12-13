import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyAction } from "../../../src/hooks/actions/copy";

describe("copyAction", () => {
  let originalDir: string;
  let worktreeDir: string;

  beforeEach(() => {
    const baseDir = join(tmpdir(), `copy-test-${Date.now()}`);
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

  test("copies a file from original to worktree", async () => {
    // Create source file
    const sourceFile = join(originalDir, ".env");
    writeFileSync(sourceFile, "KEY=value");
    expect(existsSync(sourceFile)).toBe(true);

    const result = await copyAction([".env"], {
      originalPath: originalDir,
      worktreePath: worktreeDir,
    });

    expect(result.success).toBe(true);
    const destFile = join(worktreeDir, ".env");
    expect(existsSync(destFile)).toBe(true);
    expect(readFileSync(destFile, "utf-8")).toBe("KEY=value");
  });

  test("copies a directory recursively", async () => {
    // Create source directory with nested files
    const sourceDir = join(originalDir, "config");
    mkdirSync(join(sourceDir, "subdir"), { recursive: true });
    writeFileSync(join(sourceDir, "settings.json"), '{"key":"value"}');
    writeFileSync(join(sourceDir, "subdir", "nested.txt"), "nested content");
    expect(existsSync(sourceDir)).toBe(true);

    const result = await copyAction(["config"], {
      originalPath: originalDir,
      worktreePath: worktreeDir,
    });

    expect(result.success).toBe(true);
    const destDir = join(worktreeDir, "config");
    expect(existsSync(destDir)).toBe(true);
    expect(readFileSync(join(destDir, "settings.json"), "utf-8")).toBe(
      '{"key":"value"}',
    );
    expect(readFileSync(join(destDir, "subdir", "nested.txt"), "utf-8")).toBe(
      "nested content",
    );
  });

  test("overwrites existing file in destination", async () => {
    // Create source file
    const sourceFile = join(originalDir, ".env");
    writeFileSync(sourceFile, "NEW_VALUE=new");

    // Create existing destination file
    const destFile = join(worktreeDir, ".env");
    writeFileSync(destFile, "OLD_VALUE=old");
    expect(readFileSync(destFile, "utf-8")).toBe("OLD_VALUE=old");

    const result = await copyAction([".env"], {
      originalPath: originalDir,
      worktreePath: worktreeDir,
    });

    expect(result.success).toBe(true);
    expect(readFileSync(destFile, "utf-8")).toBe("NEW_VALUE=new");
  });

  test("returns error when source does not exist", async () => {
    const result = await copyAction(["non-existent.txt"], {
      originalPath: originalDir,
      worktreePath: worktreeDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain("ENOENT");
  });
});
