import { dirname, resolve } from "node:path";

/**
 * Get the absolute path of the main worktree.
 * Uses `git rev-parse --path-format=relative --git-common-dir` to find the common git directory,
 * then resolves to the main tree path.
 */
export function getMainTreePath(): string {
  // TODO: Implement
  throw new Error("Not implemented");
}
