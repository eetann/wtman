import { access, symlink } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { ActionResult, WorktreeActionContext } from "./index";

/**
 * Create symbolic links from worktree to original.
 * Links are created with relative paths.
 * Error if source (original) does not exist.
 * Error if destination (worktree) already exists.
 */
export async function linkAction(
  targets: string[],
  context: WorktreeActionContext,
): Promise<ActionResult> {
  try {
    for (const target of targets) {
      const sourcePath = join(context.originalPath, target);
      const linkPath = join(context.worktreePath, target);

      // Check if source exists
      await access(sourcePath);

      // Calculate relative path from link location to source
      const relativePath = relative(dirname(linkPath), sourcePath);

      // Create symlink (throws if destination already exists)
      await symlink(relativePath, linkPath);
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
