import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeAction } from "../../../src/hooks/actions/remove";

describe("removeAction", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `remove-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("removes a file", async () => {
    // Create a file
    const filePath = join(testDir, "target.txt");
    writeFileSync(filePath, "content");
    expect(existsSync(filePath)).toBe(true);

    const result = await removeAction(["target.txt"], {
      workingDirectory: testDir,
    });

    expect(result.success).toBe(true);
    expect(existsSync(filePath)).toBe(false);
  });

  test("removes a directory recursively", async () => {
    // Create a directory with nested files
    const dirPath = join(testDir, "targetDir");
    mkdirSync(join(dirPath, "subdir"), { recursive: true });
    writeFileSync(join(dirPath, "file.txt"), "content");
    writeFileSync(join(dirPath, "subdir", "nested.txt"), "nested content");
    expect(existsSync(dirPath)).toBe(true);

    const result = await removeAction(["targetDir"], {
      workingDirectory: testDir,
    });

    expect(result.success).toBe(true);
    expect(existsSync(dirPath)).toBe(false);
  });

  test("skips non-existent target without error", async () => {
    const nonExistentPath = join(testDir, "non-existent");
    expect(existsSync(nonExistentPath)).toBe(false);

    const result = await removeAction(["non-existent"], {
      workingDirectory: testDir,
    });

    expect(result.success).toBe(true);
  });
});
