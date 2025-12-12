import { describe, expect, test } from "bun:test";
import { runStep } from "../../src/hooks/runner";

describe("runStep", () => {
  test("executes a simple command successfully", async () => {
    const result = await runStep({
      command: "echo hello",
      workingDirectory: process.cwd(),
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("executes multiline commands in a single shell session", async () => {
    const result = await runStep({
      command: `export TEST_VAR=foo
echo $TEST_VAR`,
      workingDirectory: process.cwd(),
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("executes command in specified working directory", async () => {
    const result = await runStep({
      command: "pwd",
      workingDirectory: "/tmp",
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("returns failure for command with non-zero exit code", async () => {
    const result = await runStep({
      command: "exit 1",
      workingDirectory: process.cwd(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain("exit code 1");
  });
});
