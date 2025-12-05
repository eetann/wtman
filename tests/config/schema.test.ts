import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import {
	ConfigSchema,
	HookStepSchema,
	RawConfigSchema,
	SeparatorSchema,
	WorktreeSettingsSchema,
} from "../../src/config/schema";

describe("SeparatorSchema", () => {
	test("accepts hyphen, underscore, slash", () => {
		expect(v.parse(SeparatorSchema, "hyphen")).toBe("hyphen");
		expect(v.parse(SeparatorSchema, "underscore")).toBe("underscore");
		expect(v.parse(SeparatorSchema, "slash")).toBe("slash");
	});

	test("rejects invalid values", () => {
		expect(() => v.parse(SeparatorSchema, "invalid")).toThrow();
		expect(() => v.parse(SeparatorSchema, "")).toThrow();
		expect(() => v.parse(SeparatorSchema, 123)).toThrow();
	});
});

describe("WorktreeSettingsSchema", () => {
	test("accepts valid settings", () => {
		const result = v.parse(WorktreeSettingsSchema, {
			path: "../${{ original.basename }}-${{ branch }}",
			separator: "hyphen",
		});
		expect(result.path).toBe("../${{ original.basename }}-${{ branch }}");
		expect(result.separator).toBe("hyphen");
	});
});

describe("HookStepSchema", () => {
	test("accepts run action", () => {
		const result = v.parse(HookStepSchema, {
			name: "Install dependencies",
			run: "bun install",
		});
		expect(result.name).toBe("Install dependencies");
		expect(result.run).toBe("bun install");
	});

	test("accepts copy action (string)", () => {
		const result = v.parse(HookStepSchema, {
			name: "Copy env file",
			copy: ".env",
		});
		expect(result.name).toBe("Copy env file");
		expect(result.copy).toBe(".env");
	});

	test("accepts copy action (array)", () => {
		const result = v.parse(HookStepSchema, {
			name: "Copy env files",
			copy: [".env", ".env.local"],
		});
		expect(result.name).toBe("Copy env files");
		expect(result.copy).toEqual([".env", ".env.local"]);
	});

	test("rejects when name is missing", () => {
		expect(() =>
			v.parse(HookStepSchema, {
				run: "bun install",
			}),
		).toThrow();
	});
});

describe("RawConfigSchema", () => {
	test("accepts complete config", () => {
		const result = v.parse(RawConfigSchema, {
			worktree: {
				path: "../${{ original.basename }}-${{ branch }}",
				separator: "hyphen",
			},
			"pre-worktree-add": [{ name: "Pre add", run: "echo pre" }],
			"post-worktree-add": [{ name: "Post add", run: "bun install" }],
			"pre-worktree-remove": [{ name: "Pre remove", run: "echo pre remove" }],
			"post-worktree-remove": [
				{ name: "Post remove", run: "echo post remove" },
			],
		});
		expect(result.worktree?.path).toBe("../${{ original.basename }}-${{ branch }}");
		expect(result["post-worktree-add"]?.[0]?.name).toBe("Post add");
	});

	test("accepts empty object", () => {
		const result = v.parse(RawConfigSchema, {});
		expect(result.worktree).toBeUndefined();
		expect(result["pre-worktree-add"]).toBeUndefined();
	});
});

describe("ConfigSchema", () => {
	test("accepts merged config", () => {
		const result = v.parse(ConfigSchema, {
			worktree: {
				path: "../${{ original.basename }}-${{ branch }}",
				separator: "hyphen",
			},
			"pre-worktree-add": [],
			"post-worktree-add": [{ name: "Install", run: "bun install" }],
			"pre-worktree-remove": [],
			"post-worktree-remove": [],
		});
		expect(result.worktree.path).toBe("../${{ original.basename }}-${{ branch }}");
		expect(result.worktree.separator).toBe("hyphen");
	});

	test("rejects when worktree.path is missing", () => {
		expect(() =>
			v.parse(ConfigSchema, {
				worktree: {
					separator: "hyphen",
				},
				"pre-worktree-add": [],
				"post-worktree-add": [],
				"pre-worktree-remove": [],
				"post-worktree-remove": [],
			}),
		).toThrow();
	});
});
