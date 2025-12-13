import { cp } from "node:fs/promises";
import { join } from "node:path";
import type { ActionResult, WorktreeActionContext } from "./index";

/**
 * Copy files/directories from original to worktree.
 * Overwrites if destination exists.
 * Error if source does not exist.
 */
export async function copyAction(
  targets: string[],
  context: WorktreeActionContext,
): Promise<ActionResult> {
  try {
    for (const target of targets) {
      const sourcePath = join(context.originalPath, target);
      const destPath = join(context.worktreePath, target);
      await cp(sourcePath, destPath, { recursive: true, force: true });
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
