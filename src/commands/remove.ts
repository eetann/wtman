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
  filterWorktreesByTags,
  loadMetadata,
  parseTags,
  saveMetadata,
  type WorktreeMetadata,
  type WorktreesMetadata,
} from "../metadata";
import { spinner } from "../spinner";
import type { HookContext } from "../template/expander";

/**
 * Truncate description to specified length with ellipsis.
 */
function truncateDescription(desc: string, maxLength = 20): string {
  if (desc.length <= maxLength) {
    return desc;
  }
  return `${desc.slice(0, maxLength)}...`;
}

/**
 * Format worktree label for display with metadata.
 * Format: relativePath [branch] #tag1 #tag2 "description..."
 */
function formatWorktreeLabel(
  wt: WorktreeInfo,
  metadata: WorktreeMetadata | undefined,
  mainTreePath: string,
): string {
  const relativePath = relative(mainTreePath, wt.path);
  let label = wt.branch ? `${relativePath} [${wt.branch}]` : relativePath;

  if (metadata) {
    // Add tags
    if (metadata.tags && metadata.tags.length > 0) {
      const tagsStr = metadata.tags.map((t) => `#${t}`).join(" ");
      label += ` ${tagsStr}`;
    }
    // Add description
    if (metadata.description) {
      label += ` "${truncateDescription(metadata.description)}"`;
    }
  }

  return label;
}

/**
 * Get target worktree by branch name, path, or through interactive selection.
 */
async function getTargetWorktree(
  branchName: string | undefined,
  worktreePath: string | undefined,
  worktrees: WorktreeInfo[],
  mainTreePath: string,
  currentDir: string,
  metadata: WorktreesMetadata,
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

  // Build choices for select with metadata
  const choices = removableWorktrees.map((wt) => {
    const wtMetadata = metadata[wt.path];
    const label = formatWorktreeLabel(wt, wtMetadata, mainTreePath);
    return {
      name: label,
      value: wt,
      tags: wtMetadata?.tags ?? [],
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
          choice.value.branch?.toLowerCase().includes(lowerInput) ||
          choice.tags.some((tag) => tag.toLowerCase().includes(lowerInput)),
      );
    },
  });

  // Confirmation is handled in removeSingleWorktree

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
 * Remove a single worktree with confirmation, pre-hook, safety checks, branch deletion, and metadata update.
 * Does NOT execute post-hook (caller's responsibility).
 * Returns updated metadata and status ("skipped" if user declined, "success" if removed, "failed" if error).
 */
async function removeSingleWorktree(
  worktreePath: string,
  branch: string,
  mainTreePath: string,
  force: boolean,
  deleteBranchOption: boolean,
  keepBranchOption: boolean,
  config: Awaited<ReturnType<typeof loadConfig>>,
  metadata: WorktreesMetadata,
  label?: string,
): Promise<{
  status: "success" | "skipped" | "failed";
  metadata: WorktreesMetadata;
}> {
  // Confirm removal (skip if --force)
  if (!force) {
    const displayLabel = label ?? basename(worktreePath);
    const proceed = await confirm({
      message: `Remove worktree "${displayLabel}"?`,
      default: true,
    });
    if (!proceed) {
      console.log(`Skipped: ${worktreePath}`);
      return { status: "skipped", metadata };
    }
  }

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
      return { status: "failed", metadata };
    }
  }

  // Safety checks (uncommitted changes, unpushed commits)
  const effectiveForce = await checkSafetyAndConfirm(worktreePath, force);

  // Remove worktree with spinner
  const removeResult = await spinner({
    message: `Removing worktree ${basename(worktreePath)}...`,
    task: async () => {
      await removeWorktree(worktreePath, effectiveForce, mainTreePath);
    },
  });

  if (!removeResult.success) {
    console.error(
      `Failed to remove worktree ${worktreePath}: ${removeResult.error?.message ?? "Unknown error"}`,
    );
    return { status: "failed", metadata };
  }
  console.log(`Removed worktree: ${worktreePath}`);

  // Handle branch deletion
  await handleBranchDeletion(
    branch,
    effectiveForce,
    deleteBranchOption,
    keepBranchOption,
    mainTreePath,
  );

  // Update metadata
  const updatedMetadata = deleteWorktreeMetadata(metadata, worktreePath);

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
      return { status: "failed", metadata: updatedMetadata };
    }
  }

  // Save metadata
  try {
    await saveMetadata(mainTreePath, updatedMetadata);
  } catch (error) {
    console.error(
      `Warning: Failed to save metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return { status: "success", metadata: updatedMetadata };
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
      conflicts: ["worktree-path", "tag"],
    },
    "worktree-path": {
      type: "string",
      short: "w",
      description: "Path of the worktree to remove (full path or basename)",
      conflicts: ["branch-name", "tag"],
    },
    tag: {
      type: "string",
      short: "t",
      description: "Remove worktrees by tag (comma-separated, AND condition)",
      conflicts: ["branch-name", "worktree-path"],
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
    const ctxTag = ctx.values.tag;
    const force = ctx.values.force ?? false;
    const deleteBranchOption = ctx.values["delete-branch"] ?? false;
    const keepBranchOption = ctx.values["keep-branch"] ?? false;

    const worktrees = listWorktrees();
    const mainTreePath = getMainTreePath();
    const currentDir = normalize(process.cwd());

    // Load metadata for interactive selection display and tag filtering
    let metadata: WorktreesMetadata = {};
    try {
      metadata = await loadMetadata(mainTreePath);
    } catch {
      // Ignore metadata load errors, just use empty metadata
    }

    // Load config for hooks
    const config = await loadConfig();

    let currentMetadata = metadata;

    // Handle --tag option for batch removal
    if (ctxTag) {
      const tags = parseTags(ctxTag);
      if (tags.length === 0) {
        console.log("No tags specified.");
        process.exit(0);
      }

      // Find worktrees matching tags
      const matchingPaths = filterWorktreesByTags(metadata, tags);

      // Filter to removable worktrees (exclude main and current directory)
      const targetWorktrees = worktrees.filter((wt) => {
        if (!matchingPaths.includes(wt.path)) return false;
        if (normalize(wt.path) === normalize(mainTreePath)) return false;
        if (normalize(wt.path) === currentDir) {
          console.log(
            `Warning: Skipping current directory worktree: ${wt.path}`,
          );
          return false;
        }
        return true;
      });

      if (targetWorktrees.length === 0) {
        console.log(`No worktrees found with tag: ${tags.join(", ")}`);
        process.exit(0);
      }

      // Remove each worktree (confirm one by one inside removeSingleWorktree)
      for (const wt of targetWorktrees) {
        const wtMetadata = currentMetadata[wt.path];
        const label = formatWorktreeLabel(wt, wtMetadata, mainTreePath);

        const result = await removeSingleWorktree(
          wt.path,
          wt.branch,
          mainTreePath,
          force,
          deleteBranchOption,
          keepBranchOption,
          config,
          currentMetadata,
          label,
        );

        currentMetadata = result.metadata;
      }
    } else {
      // Single worktree removal
      const targetWorktree = await getTargetWorktree(
        ctxBranchName,
        ctxWorktreePath,
        worktrees,
        mainTreePath,
        currentDir,
        metadata,
      );
      const { path: worktreePath, branch } = targetWorktree;

      const wtMetadata = currentMetadata[worktreePath];
      const label = formatWorktreeLabel(
        targetWorktree,
        wtMetadata,
        mainTreePath,
      );

      const result = await removeSingleWorktree(
        worktreePath,
        branch,
        mainTreePath,
        force,
        deleteBranchOption,
        keepBranchOption,
        config,
        currentMetadata,
        label,
      );

      if (result.status === "failed") {
        process.exit(1);
      }
    }
  },
});
