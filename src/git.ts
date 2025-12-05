import { execSync, type ExecSyncOptions } from "node:child_process";
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

/**
 * Check if a branch exists in the repository.
 * @param branch - The branch name to check
 * @param cwd - Optional working directory (defaults to process.cwd())
 * @returns true if the branch exists, false otherwise
 */
export function branchExists(branch: string, cwd?: string): boolean {
  const options: ExecSyncOptions = {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (cwd) {
    options.cwd = cwd;
  }

  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branch}`, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Add a new worktree.
 * If the branch does not exist, it will be created.
 * @param path - The path where the worktree will be created
 * @param branch - The branch name for the worktree
 * @param cwd - Optional working directory (defaults to process.cwd())
 */
export function addWorktree(path: string, branch: string, cwd?: string): void {
  const options: ExecSyncOptions = {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (cwd) {
    options.cwd = cwd;
  }

  const exists = branchExists(branch, cwd);

  if (exists) {
    // Branch exists: use existing branch
    execSync(`git worktree add "${path}" "${branch}"`, options);
  } else {
    // Branch doesn't exist: create new branch
    execSync(`git worktree add -b "${branch}" "${path}"`, options);
  }
}
