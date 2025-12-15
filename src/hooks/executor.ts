import path from "node:path";
import type { HookStep } from "../config/schema";
import { expandHookCommand, type HookContext } from "../template/expander";
import { copyAction } from "./actions/copy";
import { normalizeTargets } from "./actions/index";
import { linkAction } from "./actions/link";
import { mkdirAction } from "./actions/mkdir";
import { removeAction } from "./actions/remove";
import { runStep } from "./runner";

export type HookType =
  | "pre-worktree-add"
  | "post-worktree-add"
  | "pre-worktree-remove"
  | "post-worktree-remove";

/**
 * Check if worktree is available for the given hook type.
 * - post-worktree-add: true (worktree is created)
 * - pre-worktree-remove: true (worktree still exists)
 * - pre-worktree-add: false (worktree not yet created)
 * - post-worktree-remove: false (worktree is deleted)
 */
export function isWorktreeAvailable(hookType: HookType): boolean {
  return hookType === "post-worktree-add" || hookType === "pre-worktree-remove";
}

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
    // Get default working directory for this hook type
    const defaultWorkingDirectory = getDefaultWorkingDirectory(hookType, context);
    let workingDirectory: string;

    if (step["working-directory"]) {
      const expandedWorkingDirectory = expandHookCommand(
        step["working-directory"],
        context,
      );
      // If relative path, resolve from default working directory
      workingDirectory = path.isAbsolute(expandedWorkingDirectory)
        ? expandedWorkingDirectory
        : path.join(defaultWorkingDirectory, expandedWorkingDirectory);
    } else {
      workingDirectory = defaultWorkingDirectory;
    }

    // Display step name as separator
    console.log(`-- ${step.name} --`);

    let result: { success: boolean; error?: Error };

    if (step.run) {
      // Run action (existing)
      const command = expandHookCommand(step.run, context);
      result = await runStep({
        command,
        workingDirectory,
      });
    } else if (step.mkdir) {
      // Mkdir action
      result = await mkdirAction(normalizeTargets(step.mkdir), {
        workingDirectory,
      });
    } else if (step.remove) {
      // Remove action
      result = await removeAction(normalizeTargets(step.remove), {
        workingDirectory,
      });
    } else if (step.copy) {
      // Copy action - requires worktree
      if (!isWorktreeAvailable(hookType)) {
        return {
          success: false,
          failedStep: step.name,
          error: new Error(
            `Cannot use 'copy' action in ${hookType} hook (worktree does not exist)`,
          ),
        };
      }
      result = await copyAction(normalizeTargets(step.copy), {
        originalPath: context.original.path,
        worktreePath: context.worktree.path,
      });
    } else if (step.link) {
      // Link action - requires worktree
      if (!isWorktreeAvailable(hookType)) {
        return {
          success: false,
          failedStep: step.name,
          error: new Error(
            `Cannot use 'link' action in ${hookType} hook (worktree does not exist)`,
          ),
        };
      }
      result = await linkAction(normalizeTargets(step.link), {
        originalPath: context.original.path,
        worktreePath: context.worktree.path,
      });
    } else {
      // No recognized action, skip
      continue;
    }

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
