import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteWorktreeMetadata,
  getWorktreeMetadata,
  loadMetadata,
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
