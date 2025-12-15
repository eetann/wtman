import { normalize, relative } from "node:path";
import type { WorktreeInfo } from "../git";

/**
 * Format the worktree path for display.
 * - Returns "." for current directory
 * - Returns relative path for paths within 2 levels
 * - Returns absolute path for paths 3+ levels away
 */
export function formatPath(absolutePath: string, cwd: string): string {
  const normalizedPath = normalize(absolutePath);
  const normalizedCwd = normalize(cwd);

  // Current directory
  if (normalizedPath === normalizedCwd) {
    return ".";
  }

  const relativePath = relative(normalizedCwd, normalizedPath);

  // Count the number of "../" in the relative path
  const parentDirCount = (relativePath.match(/\.\.\//g) || []).length;

  // If 3+ levels up, return absolute path
  if (parentDirCount >= 3) {
    return absolutePath;
  }

  return relativePath;
}

/**
 * Format the branch information for display.
 * - Returns "[branch-name]" for normal branches
 * - Returns "(YYYY-MM-DD message)" for detached HEAD
 */
export function formatBranch(info: WorktreeInfo): string {
  if (info.isDetached) {
    return `${info.commitDate} ${info.commitMessage}`;
  }
  return info.branch;
}

/**
 * Display information for a worktree.
 */
export interface WorktreeDisplayInfo {
  path: string;
  branch: string;
  isCurrent: boolean;
  // Change 9 fields (empty for now)
  tags: string;
  description: string;
}

/**
 * Format worktrees for display.
 * Converts WorktreeInfo[] to WorktreeDisplayInfo[] with relative paths and current marker.
 */
export function formatWorktrees(
  worktrees: WorktreeInfo[],
  cwd: string,
): WorktreeDisplayInfo[] {
  const normalizedCwd = normalize(cwd);

  return worktrees.map((info) => {
    const isCurrent = normalize(info.path) === normalizedCwd;
    return {
      path: formatPath(info.path, cwd),
      branch: formatBranch(info),
      isCurrent,
      tags: "",
      description: "",
    };
  });
}
