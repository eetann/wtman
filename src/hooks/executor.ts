import type { HookStep } from "../config/schema";
import { expandHookCommand, type HookContext } from "../template/expander";
import { runStep } from "./runner";

export type HookType =
  | "pre-worktree-add"
  | "post-worktree-add"
  | "pre-worktree-remove"
  | "post-worktree-remove";

export interface ExecuteHooksOptions {
  hookType: HookType;
  steps: HookStep[];
  context: HookContext;
}

export interface ExecuteHooksResult {
  success: boolean;
  failedStep?: string;
  error?: Error;
}

/**
 * Get the default working directory based on hook type.
 * - post-worktree-add: worktree path (worktree is created)
 * - pre-worktree-remove: worktree path (worktree still exists)
 * - pre-worktree-add: original path (worktree not yet created)
 * - post-worktree-remove: original path (worktree is deleted)
 */
function getDefaultWorkingDirectory(
  hookType: HookType,
  context: HookContext,
): string {
  if (hookType === "post-worktree-add" || hookType === "pre-worktree-remove") {
    return context.worktree.path;
  }
  return context.original.path;
}

/**
 * Execute all hook steps sequentially.
 * Stops execution on first failure.
 */
export async function executeHooks(
  options: ExecuteHooksOptions,
): Promise<ExecuteHooksResult> {
  const { hookType, steps, context } = options;

  for (const step of steps) {
    // Skip steps without run action (will be handled in Change 7)
    if (!step.run) {
      continue;
    }

    // Expand template variables in working directory
    const workingDirectory = step["working-directory"]
      ? expandHookCommand(step["working-directory"], context)
      : getDefaultWorkingDirectory(hookType, context);

    // Expand template variables in command
    const command = expandHookCommand(step.run, context);

    // Display step name as separator
    console.log(`-- ${step.name} --`);

    // Execute step
    const result = await runStep({
      command,
      workingDirectory,
    });

    if (!result.success) {
      return {
        success: false,
        failedStep: step.name,
        error: result.error,
      };
    }
  }

  return { success: true };
}
