import { normalize, relative } from "node:path";
import { confirm, select } from "@inquirer/prompts";
import { define } from "gunshi";
import { loadConfig } from "../config";
import {
  deleteBranch,
  getMainTreePath,
  getWorktreeByName,
  hasUncommittedChanges,
  hasUnpushedCommits,
  listWorktrees,
  removeWorktree,
  type WorktreeInfo,
} from "../git";

/**
 * Get target worktree by name or through interactive selection.
 */
async function getTargetWorktree(
  worktreeName: string | undefined,
  worktrees: WorktreeInfo[],
  mainTreePath: string,
  currentDir: string,
  force: boolean,
): Promise<WorktreeInfo> {
  if (worktreeName) {
    // Name specified: find worktree by name
    const found = getWorktreeByName(worktreeName, worktrees);
    if (!found) {
      console.error(`Worktree not found: ${worktreeName}`);
      process.exit(1);
    }

    // Check if it's the main worktree
    if (normalize(found.path) === normalize(mainTreePath)) {
      console.error("Cannot remove main worktree");
      process.exit(1);
    }

    // Check if it's the current directory
    if (normalize(found.path) === currentDir) {
      console.error("Cannot remove the worktree you are currently in.");
      console.error("Please move to another directory first, then run:");
      console.error(`  wtman remove ${found.branch || worktreeName}`);
      process.exit(1);
    }

    return found;
  }

  // No name specified: interactive selection
  // Filter out main worktree and current directory
  const removableWorktrees = worktrees.filter((wt) => {
    const isMain = normalize(wt.path) === normalize(mainTreePath);
    const isCurrent = normalize(wt.path) === currentDir;
    return !isMain && !isCurrent;
  });

  if (removableWorktrees.length === 0) {
    console.log("No removable worktrees available.");
    process.exit(0);
  }

  // Build choices for select
  const choices = removableWorktrees.map((wt) => {
    const relativePath = relative(mainTreePath, wt.path);
    const label = wt.branch ? `${relativePath} [${wt.branch}]` : relativePath;
    return {
      name: label,
      value: wt,
    };
  });

  const selected = await select({
    message: "Select worktree to remove:",
    choices,
    theme: {
      keybindings: ["vim", "emacs"],
    },
  });

  // Confirm removal (skip if --force)
  if (!force) {
    const relativePath = relative(mainTreePath, selected.path);
    const label = selected.branch
      ? `${relativePath} [${selected.branch}]`
      : relativePath;
    const proceed = await confirm({
      message: `Remove worktree "${label}"?`,
      default: true,
    });
    if (!proceed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  return selected;
}

/**
 * Check for uncommitted changes and unpushed commits.
 * Prompts user for confirmation if issues are found (unless force is true).
 */
async function checkSafetyAndConfirm(
  worktreePath: string,
  force: boolean,
): Promise<void> {
  if (force) return;

  if (hasUncommittedChanges(worktreePath)) {
    const proceed = await confirm({
      message: "The worktree has uncommitted changes. Proceed anyway?",
      default: false,
    });
    if (!proceed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  if (hasUnpushedCommits(worktreePath)) {
    const proceed = await confirm({
      message: "The worktree has unpushed commits. Proceed anyway?",
      default: false,
    });
    if (!proceed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }
}

/**
 * Handle branch deletion based on options and config.
 */
async function handleBranchDeletion(
  branch: string,
  force: boolean,
  deleteBranchOption: boolean,
  keepBranchOption: boolean,
  mainTreePath: string,
): Promise<void> {
  if (!branch) return;

  let shouldDelete = false;

  if (deleteBranchOption) {
    shouldDelete = true;
  } else if (keepBranchOption) {
    shouldDelete = false;
  } else {
    const config = await loadConfig();
    const deleteBranchConfig = config.worktree.deleteBranch;

    if (deleteBranchConfig === "always") {
      shouldDelete = true;
    } else if (deleteBranchConfig === "never") {
      shouldDelete = false;
    } else {
      // "ask" - default behavior
      if (force) {
        shouldDelete = true;
      } else {
        shouldDelete = await confirm({
          message: `Delete branch "${branch}"?`,
          default: true,
        });
      }
    }
  }

  if (shouldDelete) {
    try {
      deleteBranch(branch, force, mainTreePath);
      console.log(`Deleted branch: ${branch}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Warning: Failed to delete branch: ${error.message}`);
      } else {
        console.error("Warning: Failed to delete branch");
      }
    }
  }
}

export const removeCommand = define({
  name: "remove",
  description: "Remove a worktree by name or interactively select one",
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
    // Get worktree name from positional argument (optional)
    const worktreeName = ctx.positionals[1] as string | undefined;
    const force = ctx.values.force ?? false;
    const deleteBranchOption = ctx.values["delete-branch"] ?? false;
    const keepBranchOption = ctx.values["keep-branch"] ?? false;

    const worktrees = listWorktrees();
    const mainTreePath = getMainTreePath();
    const currentDir = normalize(process.cwd());

    // Get target worktree (by name or interactive selection)
    const targetWorktree = await getTargetWorktree(
      worktreeName,
      worktrees,
      mainTreePath,
      currentDir,
      force,
    );
    const { path: worktreePath, branch } = targetWorktree;

    // Safety checks
    await checkSafetyAndConfirm(worktreePath, force);

    // Remove worktree
    try {
      removeWorktree(worktreePath, force, mainTreePath);
      console.log(`Removed worktree: ${worktreePath}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to remove worktree: ${error.message}`);
      } else {
        console.error("Failed to remove worktree");
      }
      process.exit(1);
    }

    // Handle branch deletion
    await handleBranchDeletion(
      branch,
      force,
      deleteBranchOption,
      keepBranchOption,
      mainTreePath,
    );
  },
});
