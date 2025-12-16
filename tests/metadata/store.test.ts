import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteWorktreeMetadata,
  filterWorktreesByTags,
  getWorktreeMetadata,
  loadMetadata,
  parseTags,
  saveMetadata,
  setWorktreeMetadata,
} from "../../src/metadata/store";

describe("loadMetadata", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `metadata-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("returns empty object when file does not exist", async () => {
    const result = await loadMetadata(testDir);
    expect(result).toEqual({});
  });

  test("loads YAML file correctly", async () => {
    const wtmanDir = join(testDir, ".wtman");
    mkdirSync(wtmanDir, { recursive: true });
    writeFileSync(
      join(wtmanDir, "worktrees.yaml"),
      `/path/to/worktree1:
  description: "Test description"
  tags:
    - feature
    - urgent
`,
    );

    const result = await loadMetadata(testDir);
    expect(result).toEqual({
      "/path/to/worktree1": {
        description: "Test description",
        tags: ["feature", "urgent"],
      },
    });
  });
});

describe("saveMetadata", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `metadata-save-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  test("creates new file when it does not exist", async () => {
    const metadata = {
      "/path/to/worktree": {
        description: "New worktree",
        tags: ["test"],
      },
    };

    await saveMetadata(testDir, metadata);

    const filePath = join(testDir, ".wtman", "worktrees.yaml");
    expect(existsSync(filePath)).toBe(true);

    const loaded = await loadMetadata(testDir);
    expect(loaded).toEqual(metadata);
  });

  test("overwrites existing file", async () => {
    const oldMetadata = {
      "/path/to/old": {
        description: "Old worktree",
        tags: ["old"],
      },
    };
    await saveMetadata(testDir, oldMetadata);

    const newMetadata = {
      "/path/to/new": {
        description: "New worktree",
        tags: ["new"],
      },
    };
    await saveMetadata(testDir, newMetadata);

    const loaded = await loadMetadata(testDir);
    expect(loaded).toEqual(newMetadata);
  });
});

describe("getWorktreeMetadata", () => {
  test("returns metadata for existing key", () => {
    const metadata = {
      "/path/to/worktree1": {
        description: "First worktree",
        tags: ["feature"],
      },
      "/path/to/worktree2": {
        description: "Second worktree",
        tags: ["bugfix"],
      },
    };

    const result = getWorktreeMetadata(metadata, "/path/to/worktree1");
    expect(result).toEqual({
      description: "First worktree",
      tags: ["feature"],
    });
  });

  test("returns undefined for non-existing key", () => {
    const metadata = {
      "/path/to/worktree1": {
        description: "First worktree",
        tags: ["feature"],
      },
    };

    const result = getWorktreeMetadata(metadata, "/path/to/non-existent");
    expect(result).toBeUndefined();
  });
});

describe("setWorktreeMetadata", () => {
  test("adds new entry", () => {
    const metadata = {};

    const result = setWorktreeMetadata(metadata, "/path/to/worktree", {
      description: "New worktree",
      tags: ["feature"],
    });

    expect(result).toEqual({
      "/path/to/worktree": {
        description: "New worktree",
        tags: ["feature"],
      },
    });
  });

  test("updates existing entry", () => {
    const metadata = {
      "/path/to/worktree": {
        description: "Old description",
        tags: ["old"],
      },
    };

    const result = setWorktreeMetadata(metadata, "/path/to/worktree", {
      description: "New description",
      tags: ["new"],
    });

    expect(result).toEqual({
      "/path/to/worktree": {
        description: "New description",
        tags: ["new"],
      },
    });
  });
});

describe("deleteWorktreeMetadata", () => {
  test("deletes existing entry", () => {
    const metadata = {
      "/path/to/worktree1": {
        description: "First worktree",
        tags: ["feature"],
      },
      "/path/to/worktree2": {
        description: "Second worktree",
        tags: ["bugfix"],
      },
    };

    const result = deleteWorktreeMetadata(metadata, "/path/to/worktree1");

    expect(result).toEqual({
      "/path/to/worktree2": {
        description: "Second worktree",
        tags: ["bugfix"],
      },
    });
  });

  test("does not error when deleting non-existing key", () => {
    const metadata = {
      "/path/to/worktree": {
        description: "A worktree",
        tags: ["test"],
      },
    };

    const result = deleteWorktreeMetadata(metadata, "/path/to/non-existent");

    expect(result).toEqual(metadata);
  });
});

describe("parseTags", () => {
  test("parses comma-separated string into array", () => {
    const result = parseTags("foo,bar,baz");
    expect(result).toEqual(["foo", "bar", "baz"]);
  });

  test("trims whitespace from tags", () => {
    const result = parseTags("foo , bar , baz");
    expect(result).toEqual(["foo", "bar", "baz"]);
  });

  test("filters out empty strings", () => {
    const result = parseTags("foo,,bar,");
    expect(result).toEqual(["foo", "bar"]);
  });

  test("returns single tag for non-comma string", () => {
    const result = parseTags("single");
    expect(result).toEqual(["single"]);
  });

  test("returns empty array for empty string", () => {
    const result = parseTags("");
    expect(result).toEqual([]);
  });
});

describe("filterWorktreesByTags", () => {
  const metadata = {
    "/path/to/wt1": {
      description: "Worktree 1",
      tags: ["review", "urgent"],
    },
    "/path/to/wt2": {
      description: "Worktree 2",
      tags: ["review"],
    },
    "/path/to/wt3": {
      description: "Worktree 3",
      tags: ["feature"],
    },
    "/path/to/wt4": {
      description: "Worktree 4",
      tags: [],
    },
  };

  test("filters by single tag", () => {
    const result = filterWorktreesByTags(metadata, ["review"]);
    expect(result).toEqual(["/path/to/wt1", "/path/to/wt2"]);
  });

  test("filters by multiple tags with AND condition", () => {
    const result = filterWorktreesByTags(metadata, ["review", "urgent"]);
    expect(result).toEqual(["/path/to/wt1"]);
  });

  test("returns empty array when no match", () => {
    const result = filterWorktreesByTags(metadata, ["nonexistent"]);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty tags input", () => {
    const result = filterWorktreesByTags(metadata, []);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty metadata", () => {
    const result = filterWorktreesByTags({}, ["review"]);
    expect(result).toEqual([]);
  });
});
