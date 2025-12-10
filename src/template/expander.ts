import type { Separator } from "../config/schema";

/**
 * Transform branch name by replacing / with the specified separator
 */
export function transformBranch(branch: string, separator: Separator): string {
  if (separator === "hyphen") {
    return branch.replace(/\//g, "-");
  }
  if (separator === "underscore") {
    return branch.replace(/\//g, "_");
  }
  return branch;
}

/**
 * Expand template variables in a string
 */
export function expandTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\$\{\{\s*([^}]+)\s*\}\}/g, (_, key) => {
    const trimmedKey = key.trim();
    return variables[trimmedKey] ?? "";
  });
}

/**
 * Flatten context to a flat key-value map for template expansion
 */
function flattenContext(
  context: WorktreeTemplateContext,
  transformedBranch: string,
): Record<string, string> {
  return {
    "original.path": context.original.path,
    "original.basename": context.original.basename,
    "worktree.branch": transformedBranch,
  };
}

/**
 * Expand worktree.template with separator transformation applied to branch
 */
export function expandWorktreeTemplate(
  template: string,
  context: WorktreeTemplateContext,
  separator: Separator,
): string {
  const transformedBranch = transformBranch(context.worktree.branch, separator);
  const variables = flattenContext(context, transformedBranch);
  return expandTemplate(template, variables);
}

/**
 * Flatten HookContext to a flat key-value map for template expansion
 */
function flattenHookContext(context: HookContext): Record<string, string> {
  return {
    "original.path": context.original.path,
    "original.basename": context.original.basename,
    "worktree.path": context.worktree.path,
    "worktree.basename": context.worktree.basename,
    "worktree.branch": context.worktree.branch,
  };
}

/**
 * Expand hook command template (branch is kept as raw value, not transformed)
 */
export function expandHookCommand(
  template: string,
  context: HookContext,
): string {
  const variables = flattenHookContext(context);
  return expandTemplate(template, variables);
}

// Context for worktree.template expansion (base)
export interface WorktreeTemplateContext {
  original: {
    path: string; // Full path of main repository
    basename: string; // Directory name of main repository
  };
  worktree: {
    branch: string; // Raw branch name (separator conversion applied during expansion)
  };
}

// Context for hook command expansion (extends WorktreeTemplateContext)
export interface HookContext extends Omit<WorktreeTemplateContext, "worktree"> {
  worktree: WorktreeTemplateContext["worktree"] & {
    path: string; // Full path of worktree
    basename: string; // Directory name of worktree
  };
}
