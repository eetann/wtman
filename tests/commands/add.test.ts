import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { cli } from "gunshi";
import { addCommand } from "../../src/commands/add";

/**
 * Helper to create a test git repository with wtman config
 */
function createTestRepo(): string {
	const testDir = mkdtempSync(join(tmpdir(), "wtman-add-test-"));

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
		`worktree:
  template: "../\${{ original.basename }}-\${{ worktree.branch }}"
  separator: hyphen
`,
	);

	return testDir;
}

describe("wtman add command", () => {
	let testDir: string;
	let originalCwd: string;
	const createdWorktrees: string[] = [];

	beforeAll(() => {
		originalCwd = process.cwd();
		testDir = createTestRepo();
		// Change to test directory so getMainTreePath works correctly
		process.chdir(testDir);
	});

	afterAll(() => {
		// Restore original cwd
		process.chdir(originalCwd);

		// Clean up worktrees first
		for (const wt of createdWorktrees) {
			try {
				execSync(`git worktree remove "${wt}" --force`, { cwd: testDir });
			} catch {
				// Ignore errors during cleanup
			}
			rmSync(wt, { recursive: true, force: true });
		}
		// Clean up test directory
		rmSync(testDir, { recursive: true, force: true });
	});

	test("creates worktree with new branch", async () => {
		// Mock console.log to capture output
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = mock((...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		});

		try {
			await cli(["feature/new-feature"], addCommand, {
				name: "wtman add",
			});

			// Verify output
			expect(logs.some((log) => log.includes("Created worktree at:"))).toBe(true);

			// Get the expected worktree path
			const baseName = basename(testDir);
			const expectedWorktreePath = join(testDir, "..", `${baseName}-feature-new-feature`);
			createdWorktrees.push(expectedWorktreePath);

			// Verify worktree was created
			expect(existsSync(expectedWorktreePath)).toBe(true);

			// Verify git worktree list shows the new worktree
			const worktreeList = execSync("git worktree list", {
				cwd: testDir,
				encoding: "utf-8",
			});
			expect(worktreeList).toContain("feature/new-feature");
		} finally {
			console.log = originalLog;
		}
	});

	test("creates worktree with existing branch", async () => {
		// Create a branch first
		execSync("git branch existing-branch", { cwd: testDir });

		// Mock console.log
		const logs: string[] = [];
		const originalLog = console.log;
		console.log = mock((...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		});

		try {
			await cli(["existing-branch"], addCommand, {
				name: "wtman add",
			});

			// Verify output
			expect(logs.some((log) => log.includes("Created worktree at:"))).toBe(true);

			// Get the expected worktree path
			const baseName = basename(testDir);
			const expectedWorktreePath = join(testDir, "..", `${baseName}-existing-branch`);
			createdWorktrees.push(expectedWorktreePath);

			// Verify worktree was created
			expect(existsSync(expectedWorktreePath)).toBe(true);
		} finally {
			console.log = originalLog;
		}
	});

	test("fails when branch is already checked out in another worktree", async () => {
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
			// Try to create worktree with already used branch
			await cli(["existing-branch"], addCommand, {
				name: "wtman add",
			});
		} catch (e) {
			// Expected to throw due to mocked process.exit
		} finally {
			console.error = originalError;
			process.exit = originalExit;
		}

		// Verify error was reported
		expect(errors.some((err) => err.includes("Failed to create worktree"))).toBe(true);
		expect(exitCode).toBe(1);
	});
});
