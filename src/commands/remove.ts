import { basename, normalize, relative } from "node:path";
import { confirm, search } from "@inquirer/prompts";
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
import { executeHooks } from "../hooks";
import {
  deleteWorktreeMetadata,
  loadMetadata,
  saveMetadata,
} from "../metadata";
import { spinner } from "../spinner";
import type { HookContext } from "../template/expander";

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

  const selected = await search({
    message: "Select worktree to remove:",
    source: async (input) => {
      if (!input) {
        return choices;
      }
      const lowerInput = input.toLowerCase();
      return choices.filter(
        (choice) =>
          choice.name.toLowerCase().includes(lowerInput) ||
          choice.value.branch?.toLowerCase().includes(lowerInput),
      );
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
 * Returns true if force mode should be used (either already forced or user confirmed).
 */
async function checkSafetyAndConfirm(
  worktreePath: string,
  force: boolean,
): Promise<boolean> {
  if (force) return true;

  let shouldForce = false;

  if (hasUncommittedChanges(worktreePath)) {
    const proceed = await confirm({
      message: "The worktree has uncommitted changes. Proceed anyway?",
      default: false,
    });
    if (!proceed) {
      console.log("Aborted.");
      process.exit(0);
    }
    shouldForce = true;
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
    shouldForce = true;
  }

  return shouldForce;
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

    // Safety checks (returns updated force flag)
    const effectiveForce = await checkSafetyAndConfirm(worktreePath, force);

    // Load config for hooks
    const config = await loadConfig();

    // Build hook context
    const hookContext: HookContext = {
      original: {
        path: mainTreePath,
        basename: basename(mainTreePath),
      },
      worktree: {
        path: worktreePath,
        basename: basename(worktreePath),
        branch,
      },
    };

    // Execute pre-worktree-remove hooks
    if (config["pre-worktree-remove"].length > 0) {
      const preResult = await executeHooks({
        hookType: "pre-worktree-remove",
        steps: config["pre-worktree-remove"],
        context: hookContext,
      });

      if (!preResult.success) {
        console.error(
          `Hook failed at step "${preResult.failedStep}": ${preResult.error?.message ?? "Unknown error"}`,
        );
        process.exit(1);
      }
    }

    // Remove worktree with spinner
    const removeResult = await spinner({
      message: "Removing worktree...",
      task: async () => {
        await removeWorktree(worktreePath, effectiveForce, mainTreePath);
      },
    });

    if (!removeResult.success) {
      console.error(
        `Failed to remove worktree: ${removeResult.error?.message ?? "Unknown error"}`,
      );
      process.exit(1);
    }
    console.log(`Removed worktree: ${worktreePath}`);

    // Execute post-worktree-remove hooks
    if (config["post-worktree-remove"].length > 0) {
      const postResult = await executeHooks({
        hookType: "post-worktree-remove",
        steps: config["post-worktree-remove"],
        context: hookContext,
      });

      if (!postResult.success) {
        console.error(
          `Hook failed at step "${postResult.failedStep}": ${postResult.error?.message ?? "Unknown error"}`,
        );
        process.exit(1);
      }
    }

    // Delete metadata for the removed worktree
    try {
      const metadata = await loadMetadata(mainTreePath);
      const updated = deleteWorktreeMetadata(metadata, worktreePath);
      await saveMetadata(mainTreePath, updated);
    } catch (error) {
      // Metadata deletion failure should not fail the worktree removal
      console.error(
        `Warning: Failed to delete metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    // Handle branch deletion
    await handleBranchDeletion(
      branch,
      effectiveForce,
      deleteBranchOption,
      keepBranchOption,
      mainTreePath,
    );
  },
});
