import { define } from "gunshi";
import { listWorktrees } from "../git";
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
  },
  async run(ctx) {
    const format = ctx.values.format as string;

    // Validate format
    if (!VALID_FORMATS.includes(format as OutputFormat)) {
      console.error(
        `Error: Invalid format "${format}". Valid formats: ${VALID_FORMATS.join(", ")}`,
      );
      process.exit(1);
    }

    // Get worktree list
    const worktrees = listWorktrees();

    // Format for display
    const cwd = process.cwd();
    const displayData = formatWorktrees(worktrees, cwd);

    // Render output
    render(displayData, format as OutputFormat);
  },
});
