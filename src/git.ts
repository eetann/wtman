import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";

/**
 * Get the absolute path of the main worktree.
 * Uses `git rev-parse --path-format=relative --git-common-dir` to find the common git directory,
 * then resolves to the main tree path.
 */
export function getMainTreePath(): string {
  const gitCommonDir = execSync(
    "git rev-parse --path-format=relative --git-common-dir",
    { encoding: "utf-8" },
  ).trim();

  // Get the relative path to the main tree by taking dirname of the git common dir
  const relativeMainTreePath = dirname(gitCommonDir);

  // Resolve to absolute path
  return resolve(process.cwd(), relativeMainTreePath);
}
