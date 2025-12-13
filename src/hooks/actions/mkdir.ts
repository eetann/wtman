import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ActionResult, DirectoryActionContext } from "./index";

/**
 * Create directories in the working directory.
 * Skips if directory already exists (no error).
 */
export async function mkdirAction(
  targets: string[],
  context: DirectoryActionContext,
): Promise<ActionResult> {
  try {
    for (const target of targets) {
      const fullPath = join(context.workingDirectory, target);
      await mkdir(fullPath, { recursive: true });
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
