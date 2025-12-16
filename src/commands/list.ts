import { define } from "gunshi";
import { getMainTreePath, listWorktrees } from "../git";
import { filterWorktreesByTags, loadMetadata, parseTags } from "../metadata";
import { formatWorktrees, type OutputFormat, render } from "../output";

const VALID_FORMATS = ["table", "json", "tsv"] as const;

export const listCommand = define({
  name: "list",
  description: "List all worktrees",
  args: {
    format: {
      type: "string",
      short: "f",
      description: "Output format: table, json, tsv (default: table)",
      default: "table",
    },
    tag: {
      type: "string",
      short: "t",
      description: "Filter by tags (comma-separated, AND condition)",
    },
  },
  async run(ctx) {
    const format = ctx.values.format as string;
    const tagOption = ctx.values.tag;

    // Validate format
    if (!VALID_FORMATS.includes(format as OutputFormat)) {
      console.error(
        `Error: Invalid format "${format}". Valid formats: ${VALID_FORMATS.join(", ")}`,
      );
      process.exit(1);
    }

    // Get worktree list
    let worktrees = listWorktrees();

    // Load metadata
    const mainTreePath = getMainTreePath();
    let metadata = {};
    try {
      metadata = await loadMetadata(mainTreePath);
    } catch {
      // Ignore metadata load errors, just use empty metadata
    }

    // Filter by tags if specified
    if (tagOption) {
      const tags = parseTags(tagOption);
      if (tags.length > 0) {
        const matchingPaths = filterWorktreesByTags(metadata, tags);
        worktrees = worktrees.filter((wt) => matchingPaths.includes(wt.path));
      }
    }

    // Format for display
    const cwd = process.cwd();
    const displayData = formatWorktrees(worktrees, cwd, metadata);

    // Render output
    render(displayData, format as OutputFormat);
  },
});
