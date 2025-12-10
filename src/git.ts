import {
  type ExecSyncOptionsWithStringEncoding,
  execSync,
} from "node:child_process";
import { basename, dirname, normalize, resolve } from "node:path";

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
  const options: ExecSyncOptionsWithStringEncoding = {
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
  const options: ExecSyncOptionsWithStringEncoding = {
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

/**
 * Check if the current directory is the main worktree.
 * @param cwd - Optional working directory (defaults to process.cwd())
 * @returns true if the current directory is the main worktree
 */
export function isMainWorktree(cwd?: string): boolean {
  const currentDir = cwd ?? process.cwd();
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf-8",
    cwd: currentDir,
  };

  const gitCommonDir = execSync(
    "git rev-parse --path-format=relative --git-common-dir",
    options,
  ).trim();

  const relativeMainTreePath = dirname(gitCommonDir);
  const mainTreePath = resolve(currentDir, relativeMainTreePath);

  return normalize(mainTreePath) === normalize(currentDir);
}

export interface WorktreeInfo {
  path: string;
  branch: string;
}

/**
 * List all worktrees in the repository.
 * @param cwd - Optional working directory (defaults to process.cwd())
 * @returns Array of worktree information
 */
export function listWorktrees(cwd?: string): WorktreeInfo[] {
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf-8",
    cwd: cwd ?? process.cwd(),
  };

  const output = execSync("git worktree list --porcelain", options).trim();
  const worktreeBlocks = output.split("\n\n");
  const worktrees: WorktreeInfo[] = [];

  for (const block of worktreeBlocks) {
    const lines = block.split("\n");
    let path = "";
    let branch = "";

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("branch refs/heads/")) {
        branch = line.slice("branch refs/heads/".length);
      }
    }

    if (path) {
      worktrees.push({ path, branch });
    }
  }

  return worktrees;
}

/**
 * Get information about the current worktree.
 * @param worktrees - Pre-fetched worktree list from listWorktrees()
 * @param cwd - Optional working directory (defaults to process.cwd())
 * @returns Object containing path and branch of the current worktree
 */
export function getCurrentWorktreeInfo(
  worktrees: WorktreeInfo[],
  cwd?: string,
): WorktreeInfo {
  const currentDir = normalize(cwd ?? process.cwd());

  for (const worktree of worktrees) {
    if (normalize(worktree.path) === currentDir) {
      return worktree;
    }
  }

  throw new Error("Current directory is not a git worktree");
}

/**
 * Get worktree by name (branch name or path basename).
 * @param name - The name to search for (branch name or path basename)
 * @param worktrees - Pre-fetched worktree list from listWorktrees()
 * @returns Worktree info if found, undefined otherwise
 */
export function getWorktreeByName(
  name: string,
  worktrees: WorktreeInfo[],
): WorktreeInfo | undefined {
  for (const worktree of worktrees) {
    // Match by branch name
    if (worktree.branch === name) {
      return worktree;
    }
    // Match by path basename
    if (basename(worktree.path) === name) {
      return worktree;
    }
  }

  return undefined;
}

/**
 * Check if there are uncommitted changes in the working directory.
 * @param cwd - Optional working directory (defaults to process.cwd())
 * @returns true if there are uncommitted changes
 */
export function hasUncommittedChanges(cwd?: string): boolean {
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (cwd) {
    options.cwd = cwd;
  }

  const output = execSync("git status --porcelain", options).trim();
  return output.length > 0;
}

/**
 * Check if there are unpushed commits on the current branch.
 * @param cwd - Optional working directory (defaults to process.cwd())
 * @returns true if there are unpushed commits, false if no upstream or no unpushed commits
 */
export function hasUnpushedCommits(cwd?: string): boolean {
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (cwd) {
    options.cwd = cwd;
  }

  try {
    const output = execSync(
      "git log @{upstream}..HEAD --oneline",
      options,
    ).trim();
    return output.length > 0;
  } catch {
    // No upstream configured, consider as no unpushed commits
    return false;
  }
}

/**
 * Remove a worktree.
 * @param worktreePath - The path of the worktree to remove
 * @param force - If true, force removal even with uncommitted changes
 * @param cwd - Optional working directory (defaults to process.cwd())
 */
export function removeWorktree(
  worktreePath: string,
  force?: boolean,
  cwd?: string,
): void {
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (cwd) {
    options.cwd = cwd;
  }

  const forceFlag = force ? " --force" : "";
  execSync(`git worktree remove "${worktreePath}"${forceFlag}`, options);
}

/**
 * Delete a local branch.
 * @param branch - The branch name to delete
 * @param force - If true, use -D to force delete even if not fully merged
 * @param cwd - Optional working directory (defaults to process.cwd())
 */
export function deleteBranch(
  branch: string,
  force?: boolean,
  cwd?: string,
): void {
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (cwd) {
    options.cwd = cwd;
  }

  const deleteFlag = force ? "-D" : "-d";
  execSync(`git branch ${deleteFlag} "${branch}"`, options);
}
