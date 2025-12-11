import { normalize, relative } from "node:path";
import { confirm, select } from "@inquirer/prompts";
import { define } from "gunshi";
import { loadConfig } from "../config";
import {
  deleteBranch,
  getMainTreePath,
  getWorktreeByBranchName,
  getWorktreeByPath,
  hasUncommittedChanges,
  hasUnpushedCommits,
  listWorktrees,
  removeWorktree,
  type WorktreeInfo,
} from "../git";
import { spinner } from "../spinner";

/**
 * Get target worktree by branch name, path, or through interactive selection.
 */
async function getTargetWorktree(
  branchName: string | undefined,
  worktreePath: string | undefined,
  worktrees: WorktreeInfo[],
  mainTreePath: string,
  currentDir: string,
  force: boolean,
): Promise<WorktreeInfo> {
  if (branchName) {
    // Branch name specified: find worktree by branch name
    const found = getWorktreeByBranchName(branchName, worktrees);
    if (!found) {
      console.error(`Worktree not found for branch: ${branchName}`);
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
      console.error(`  wtman remove -b ${branchName}`);
      process.exit(1);
    }

    return found;
  }

  if (worktreePath) {
    // Path specified: find worktree by path
    const found = getWorktreeByPath(worktreePath, worktrees);
    if (!found) {
      console.error(`Worktree not found: ${worktreePath}`);
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
      console.error(`  wtman remove -w ${worktreePath}`);
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
    const deleteResult = await spinner({
      message: `Deleting branch "${branch}"...`,
      task: async () => {
        await deleteBranch(branch, force, mainTreePath);
      },
    });

    if (!deleteResult.success) {
      console.error(
        `Warning: Failed to delete branch: ${deleteResult.error?.message ?? "Unknown error"}`,
      );
    } else {
      console.log(`Deleted branch: ${branch}`);
    }
  }
}

export const removeCommand = define({
  name: "remove",
  description: "Remove a worktree by name or interactively select one",
  examples: `
# Remove worktree by branch name
wtman remove -b feature/my-branch

# Remove worktree by branch name with force and delete branch
wtman remove -b feature/my-branch --force --delete-branch

# Remove worktree by path (full path)
wtman remove -w /path/to/worktree

# Remove worktree by path (basename)
wtman remove -w my-worktree --force

# Interactive selection (no options)
wtman remove
`.trim(),
  args: {
    "branch-name": {
      type: "string",
      short: "b",
      description: "Branch name of the worktree to remove",
      conflicts: "worktree-path",
    },
    "worktree-path": {
      type: "string",
      short: "w",
      description: "Path of the worktree to remove (full path or basename)",
      conflicts: "branch-name",
    },
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
    const ctxBranchName = ctx.values["branch-name"];
    const ctxWorktreePath = ctx.values["worktree-path"];
    const force = ctx.values.force ?? false;
    const deleteBranchOption = ctx.values["delete-branch"] ?? false;
    const keepBranchOption = ctx.values["keep-branch"] ?? false;

    const worktrees = listWorktrees();
    const mainTreePath = getMainTreePath();
    const currentDir = normalize(process.cwd());

    // Get target worktree (by branch name, path, or interactive selection)
    const targetWorktree = await getTargetWorktree(
      ctxBranchName,
      ctxWorktreePath,
      worktrees,
      mainTreePath,
      currentDir,
      force,
    );
    const { path: worktreePath, branch } = targetWorktree;

    // Safety checks
    await checkSafetyAndConfirm(worktreePath, force);

    // Remove worktree with spinner
    const removeResult = await spinner({
      message: "Removing worktree...",
      task: async () => {
        await removeWorktree(worktreePath, force, mainTreePath);
      },
    });

    if (!removeResult.success) {
      console.error(
        `Failed to remove worktree: ${removeResult.error?.message ?? "Unknown error"}`,
      );
      process.exit(1);
    }
    console.log(`Removed worktree: ${worktreePath}`);

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
