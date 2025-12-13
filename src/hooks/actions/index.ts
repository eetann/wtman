// Common types for all actions
export interface ActionResult {
  success: boolean;
  error?: Error;
}

// Context for actions that require worktree to exist (copy, link)
export interface WorktreeActionContext {
  originalPath: string;
  worktreePath: string;
}

// Context for actions that use default working directory (mkdir, remove)
export interface DirectoryActionContext {
  workingDirectory: string;
}

// Normalize string | string[] to string[]
export function normalizeTargets(targets: string | string[]): string[] {
  return Array.isArray(targets) ? targets : [targets];
}
