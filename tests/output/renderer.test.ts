import { describe, expect, test } from "bun:test";
import type { WorktreeDisplayInfo } from "../../src/output/formatter";
import { renderJson, renderTsv } from "../../src/output/renderer";

describe("renderJson", () => {
  test("returns JSON string", () => {
    const data: WorktreeDisplayInfo[] = [
      {
        path: ".",
        branch: "main",
        isCurrent: true,
        tags: "",
        description: "",
      },
      {
        path: "../feature",
        branch: "feature/x",
        isCurrent: false,
        tags: "",
        description: "",
      },
    ];

    const result = renderJson(data);
    const parsed = JSON.parse(result);

    expect(parsed.length).toBe(2);
    expect(parsed[0].path).toBe(".");
    expect(parsed[0].isCurrent).toBe(true);
  });
});

describe("renderTsv", () => {
  test("returns TSV string with header", () => {
    const data: WorktreeDisplayInfo[] = [
      {
        path: ".",
        branch: "main",
        isCurrent: true,
        tags: "",
        description: "",
      },
      {
        path: "../feature",
        branch: "feature/x",
        isCurrent: false,
        tags: "",
        description: "",
      },
    ];

    const result = renderTsv(data);
    const lines = result.split("\n");

    expect(lines[0]).toBe("Path\tBranch\tCurrent\tTags\tDescription");
    expect(lines[1]).toBe(".\tmain\tcurrent\t\t");
    expect(lines[2]).toBe("../feature\tfeature/x\t-\t\t");
  });

  test("outputs detached HEAD branch as-is", () => {
    const data: WorktreeDisplayInfo[] = [
      {
        path: "/path/to/wt",
        branch: "2024-01-15 fix: something",
        isCurrent: false,
        tags: "",
        description: "",
      },
    ];

    const result = renderTsv(data);
    const lines = result.split("\n");

    expect(lines[1]).toBe("/path/to/wt\t2024-01-15 fix: something\t-\t\t");
  });
});
