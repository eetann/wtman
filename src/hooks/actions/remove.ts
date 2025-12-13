import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ActionResult, DirectoryActionContext } from "./index";

/**
 * Remove files/directories in the working directory.
 * Skips if target does not exist (no error).
 */
export async function removeAction(
  targets: string[],
  context: DirectoryActionContext,
): Promise<ActionResult> {
  try {
    for (const target of targets) {
      const fullPath = join(context.workingDirectory, target);
      await rm(fullPath, { recursive: true, force: true });
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
