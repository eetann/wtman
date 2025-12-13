import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirAction } from "../../../src/hooks/actions/mkdir";

describe("mkdirAction", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `mkdir-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("creates a single directory", async () => {
    const result = await mkdirAction(["target"], {
      workingDirectory: testDir,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(testDir, "target"))).toBe(true);
  });

  test("creates nested directories", async () => {
    const result = await mkdirAction(["logs/app/debug"], {
      workingDirectory: testDir,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(testDir, "logs/app/debug"))).toBe(true);
  });

  test("skips existing directory without error", async () => {
    // Create directory first
    const targetPath = join(testDir, "existing");
    mkdirSync(targetPath);
    expect(existsSync(targetPath)).toBe(true);

    // Try to create same directory
    const result = await mkdirAction(["existing"], {
      workingDirectory: testDir,
    });

    expect(result.success).toBe(true);
    expect(existsSync(targetPath)).toBe(true);
  });
});
