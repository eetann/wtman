import { confirm } from "@inquirer/prompts";
import { define } from "gunshi";
import { loadConfig } from "../config";
import {
  deleteBranch,
  getCurrentWorktreeInfo,
  getMainTreePath,
  hasUncommittedChanges,
  hasUnpushedCommits,
  isMainWorktree,
  removeWorktree,
} from "../git";

export const removeCommand = define({
  name: "remove",
  description: "Remove the current worktree",
  args: {
    force: {
      type: "boolean",
      description: "Force removal without confirmation",
    },
    "delete-branch": {
      type: "boolean",
      description: "Delete the branch after removing worktree",
      conflicts: "keep-branch",
    },
    "keep-branch": {
      type: "boolean",
      description: "Keep the branch after removing worktree",
      conflicts: "delete-branch",
    },
  },
  async run(ctx) {
    const force = ctx.values.force ?? false;
    const deleteBranchOption = ctx.values["delete-branch"] ?? false;
    const keepBranchOption = ctx.values["keep-branch"] ?? false;

    // Check if current directory is main worktree
    if (isMainWorktree()) {
      console.error("Cannot remove main worktree");
      process.exit(1);
    }

    // Get current worktree info
    const worktreeInfo = getCurrentWorktreeInfo();
    const { path: worktreePath, branch } = worktreeInfo;

    // Safety checks (skip if --force)
    if (!force) {
      // Check for uncommitted changes
      if (hasUncommittedChanges()) {
        const proceed = await confirm({
          message: "You have uncommitted changes. Proceed anyway?",
          default: false,
        });
        if (!proceed) {
          console.log("Aborted.");
          process.exit(0);
        }
      }

      // Check for unpushed commits
      if (hasUnpushedCommits()) {
        const proceed = await confirm({
          message: "You have unpushed commits. Proceed anyway?",
          default: false,
        });
        if (!proceed) {
          console.log("Aborted.");
          process.exit(0);
        }
      }
    }

    // Move to main worktree before removal
    const mainTreePath = getMainTreePath();
    process.chdir(mainTreePath);

    // Remove worktree
    try {
      removeWorktree(worktreePath, force);
      console.log(`Removed worktree: ${worktreePath}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to remove worktree: ${error.message}`);
      } else {
        console.error("Failed to remove worktree");
      }
      process.exit(1);
    }

    // Determine if we should delete the branch
    let shouldDeleteBranch = false;

    if (deleteBranchOption) {
      shouldDeleteBranch = true;
    } else if (keepBranchOption) {
      shouldDeleteBranch = false;
    } else {
      // Check config
      const config = await loadConfig();
      const deleteBranchConfig = config.worktree.deleteBranch;

      if (deleteBranchConfig === "always") {
        shouldDeleteBranch = true;
      } else if (deleteBranchConfig === "never") {
        shouldDeleteBranch = false;
      } else {
        // "ask" - default behavior
        if (force) {
          // With --force, default to deleting branch
          shouldDeleteBranch = true;
        } else {
          shouldDeleteBranch = await confirm({
            message: `Delete branch "${branch}"?`,
            default: true,
          });
        }
      }
    }

    // Delete branch if requested
    if (shouldDeleteBranch && branch) {
      try {
        deleteBranch(branch, force);
        console.log(`Deleted branch: ${branch}`);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`Warning: Failed to delete branch: ${error.message}`);
        } else {
          console.error("Warning: Failed to delete branch");
        }
        // Don't exit with error - branch deletion failure is not critical
      }
    }
  },
});
