import { Table } from "console-table-printer";
import type { WorktreeDisplayInfo } from "./formatter";

/**
 * Render worktrees as JSON string.
 */
export function renderJson(data: WorktreeDisplayInfo[]): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Render worktrees as TSV string with header.
 * Branch names are raw (without brackets) for easier parsing.
 */
export function renderTsv(data: WorktreeDisplayInfo[]): string {
  const header = "Path\tBranch\tCurrent\tTags\tDescription";
  const rows = data.map((item) => {
    const current = item.isCurrent ? "current" : "-";
    return `${item.path}\t${item.branch}\t${current}\t${item.tags}\t${item.description}`;
  });
  return [header, ...rows].join("\n");
}

/**
 * Render worktrees as a table using console-table-printer.
 */
export function renderTable(data: WorktreeDisplayInfo[]): void {
  const table = new Table({
    columns: [
      { name: "path", title: "Path", alignment: "left" },
      { name: "branch", title: "Branch", alignment: "left" },
      { name: "current", title: "Current", alignment: "left" },
    ],
  });

  for (const item of data) {
    table.addRow({
      path: item.path,
      branch: item.branch,
      current: item.isCurrent ? "(current)" : "-",
    });
  }

  table.printTable();
}

export type OutputFormat = "table" | "json" | "tsv";

/**
 * Render worktrees in the specified format.
 */
export function render(
  data: WorktreeDisplayInfo[],
  format: OutputFormat,
): void {
  switch (format) {
    case "json":
      console.log(renderJson(data));
      break;
    case "tsv":
      console.log(renderTsv(data));
      break;
    default:
      renderTable(data);
      break;
  }
}
