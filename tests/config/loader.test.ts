import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	loadConfig,
	loadSingleConfig,
	mergeHooks,
	mergeWorktreeSettings,
} from "../../src/config/loader";
import { DEFAULT_CONFIG } from "../../src/config/schema";

const fixturesPath = join(import.meta.dir, "../fixtures/config-loader");

describe("loadSingleConfig", () => {
	test("loads existing file", async () => {
		const result = await loadSingleConfig(
			join(fixturesPath, "valid/.wtman/config.yaml"),
		);
		expect(result).toBeDefined();
		expect(result?.worktree?.path).toBe(
			"../${{ original.basename }}-${{ branch }}",
		);
		expect(result?.worktree?.separator).toBe("hyphen");
		expect(result?.["post-worktree-add"]?.[0]?.name).toBe(
			"Install dependencies",
		);
	});

	test("returns undefined for non-existent file", async () => {
		const result = await loadSingleConfig(
			join(fixturesPath, "non-existent.yaml"),
		);
		expect(result).toBeUndefined();
	});

	test("throws on YAML parse error", async () => {
		await expect(
			loadSingleConfig(join(fixturesPath, "invalid-yaml/config.yaml")),
		).rejects.toThrow(/Failed to parse/);
	});

	test("throws on validation error", async () => {
		await expect(
			loadSingleConfig(join(fixturesPath, "invalid-schema/config.yaml")),
		).rejects.toThrow(/Invalid configuration/);
	});
});

describe("mergeWorktreeSettings", () => {
	test("later config overrides earlier config", () => {
		const result = mergeWorktreeSettings([
			{ worktree: { path: "../base-${{ branch }}", separator: "hyphen" } },
			{
				worktree: {
					path: "../override-${{ branch }}",
					separator: "underscore",
				},
			},
		]);
		expect(result.path).toBe("../override-${{ branch }}");
		expect(result.separator).toBe("underscore");
	});

	test("keeps earlier values when later config has partial definition", () => {
		const result = mergeWorktreeSettings([
			{ worktree: { path: "../base-${{ branch }}", separator: "hyphen" } },
			{ worktree: { separator: "underscore" } },
		]);
		expect(result.path).toBe("../base-${{ branch }}");
		expect(result.separator).toBe("underscore");
	});
});

describe("mergeHooks", () => {
	test("concatenates arrays", () => {
		const result = mergeHooks("post-worktree-add", [
			{ "post-worktree-add": [{ name: "Step 1", run: "echo 1" }] },
			{ "post-worktree-add": [{ name: "Step 2", run: "echo 2" }] },
		]);
		expect(result).toHaveLength(2);
		expect(result[0]?.name).toBe("Step 1");
		expect(result[1]?.name).toBe("Step 2");
	});

	test("concatenates in order: config -> user -> worktree", () => {
		const result = mergeHooks("post-worktree-add", [
			{ "post-worktree-add": [{ name: "Config step", run: "echo config" }] },
			{ "post-worktree-add": [{ name: "User step", run: "echo user" }] },
			{
				"post-worktree-add": [{ name: "Worktree step", run: "echo worktree" }],
			},
		]);
		expect(result).toHaveLength(3);
		expect(result[0]?.name).toBe("Config step");
		expect(result[1]?.name).toBe("User step");
		expect(result[2]?.name).toBe("Worktree step");
	});
});

describe("loadConfig", () => {
	test("returns default values when no config files exist", async () => {
		const result = await loadConfig({
			cwd: join(fixturesPath, "empty"),
			mainTreePath: join(fixturesPath, "empty"),
		});
		expect(result).toEqual(DEFAULT_CONFIG);
	});

	test("loads single config file", async () => {
		const result = await loadConfig({
			cwd: join(fixturesPath, "valid"),
			mainTreePath: join(fixturesPath, "valid"),
		});
		expect(result.worktree.path).toBe("../${{ original.basename }}-${{ branch }}");
		expect(result.worktree.separator).toBe("hyphen");
		expect(result["post-worktree-add"]).toHaveLength(1);
		expect(result["post-worktree-add"][0]?.name).toBe("Install dependencies");
	});

	test("merges multiple config files", async () => {
		const result = await loadConfig({
			cwd: join(fixturesPath, "merge"),
			mainTreePath: join(fixturesPath, "merge"),
		});
		// worktree.path comes from config.yaml, separator overridden by user.yaml
		expect(result.worktree.path).toBe("../team-${{ branch }}");
		expect(result.worktree.separator).toBe("underscore");
		// hooks are concatenated
		expect(result["post-worktree-add"]).toHaveLength(2);
		expect(result["post-worktree-add"][0]?.name).toBe("Team step");
		expect(result["post-worktree-add"][1]?.name).toBe("User step");
	});
});
