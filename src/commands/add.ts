import { basename } from "node:path";
import { define } from "gunshi";
import { loadConfig } from "../config";
import { addWorktree, getMainTreePath } from "../git";
import {
  expandWorktreeTemplate,
  type WorktreeTemplateContext,
} from "../template";

export const addCommand = define({
  name: "add",
  description: "Add a new worktree",
  args: {
    branch: {
      type: "positional",
      required: true,
      description: "Branch name for the new worktree",
    },
  },
  async run(ctx) {
    const branch = ctx.values.branch;

    // Load configuration
    const config = await loadConfig();

    // Get main repository path
    const mainTreePath = getMainTreePath();

    // Build template context
    const templateContext: WorktreeTemplateContext = {
      original: {
        path: mainTreePath,
        basename: basename(mainTreePath),
      },
      worktree: {
        branch,
      },
    };

    // Expand template to get worktree path (relative to main repo)
    const worktreePath = expandWorktreeTemplate(
      config.worktree.template,
      templateContext,
      config.worktree.separator,
    );

    try {
      // Create worktree (execute from main repo directory)
      addWorktree(worktreePath, branch, mainTreePath);
      console.log(`Created worktree at: ${worktreePath}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to create worktree: ${error.message}`);
      } else {
        console.error("Failed to create worktree");
      }
      process.exit(1);
    }
  },
});
