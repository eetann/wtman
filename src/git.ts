import {
  type ExecSyncOptionsWithStringEncoding,
  exec,
  execSync,
} from "node:child_process";
import { basename, dirname, normalize, resolve } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

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
  isDetached: boolean;
  commit?: string;
  commitDate?: string;
  commitMessage?: string;
}

/**
 * Get commit information (date and message) for a given commit hash.
 * @param commit - The commit hash
 * @param cwd - Optional working directory
 * @returns Object containing commitDate and commitMessage
 */
function getCommitInfo(
  commit: string,
  cwd?: string,
): { commitDate: string; commitMessage: string } {
  const options: ExecSyncOptionsWithStringEncoding = {
    encoding: "utf-8",
    cwd: cwd ?? process.cwd(),
  };

  const output = execSync(`git log -1 --format="%cs %s" ${commit}`, options)
    .trim()
    .replace(/^"/, "")
    .replace(/"$/, "");

  const spaceIndex = output.indexOf(" ");
  const commitDate = output.slice(0, spaceIndex);
  let commitMessage = output.slice(spaceIndex + 1);

  // Truncate message to 20 characters
  if (commitMessage.length > 20) {
    commitMessage = `${commitMessage.slice(0, 17)}...`;
  }

  return { commitDate, commitMessage };
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
    let commit = "";
    let isDetached = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("branch refs/heads/")) {
        branch = line.slice("branch refs/heads/".length);
      } else if (line.startsWith("HEAD ")) {
        commit = line.slice("HEAD ".length);
      } else if (line === "detached") {
        isDetached = true;
      }
    }

    if (path) {
      if (isDetached && commit) {
        const { commitDate, commitMessage } = getCommitInfo(commit, cwd);
        worktrees.push({
          path,
          branch: "",
          isDetached: true,
          commit,
          commitDate,
          commitMessage,
        });
      } else {
        worktrees.push({ path, branch, isDetached: false });
      }
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
 * Get worktree by branch name.
 * @param branchName - The branch name to search for
 * @param worktrees - Pre-fetched worktree list from listWorktrees()
 * @returns Worktree info if found, undefined otherwise
 */
export function getWorktreeByBranchName(
  branchName: string,
  worktrees: WorktreeInfo[],
): WorktreeInfo | undefined {
  for (const worktree of worktrees) {
    if (worktree.branch === branchName) {
      return worktree;
    }
  }
  return undefined;
}

/**
 * Get worktree by path (full path or basename).
 * @param path - The path to search for (full path or basename)
 * @param worktrees - Pre-fetched worktree list from listWorktrees()
 * @returns Worktree info if found, undefined otherwise
 */
export function getWorktreeByPath(
  path: string,
  worktrees: WorktreeInfo[],
): WorktreeInfo | undefined {
  // First, try to match by full path
  for (const worktree of worktrees) {
    if (normalize(worktree.path) === normalize(path)) {
      return worktree;
    }
  }
  // If not found, try to match by basename
  for (const worktree of worktrees) {
    if (basename(worktree.path) === path) {
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
export async function removeWorktree(
  worktreePath: string,
  force?: boolean,
  cwd?: string,
): Promise<void> {
  const forceFlag = force ? " --force" : "";
  await execAsync(`git worktree remove "${worktreePath}"${forceFlag}`, {
    cwd: cwd ?? process.cwd(),
  });
}

/**
 * Delete a local branch.
 * @param branch - The branch name to delete
 * @param force - If true, use -D to force delete even if not fully merged
 * @param cwd - Optional working directory (defaults to process.cwd())
 */
export async function deleteBranch(
  branch: string,
  force?: boolean,
  cwd?: string,
): Promise<void> {
  const deleteFlag = force ? "-D" : "-d";
  await execAsync(`git branch ${deleteFlag} "${branch}"`, {
    cwd: cwd ?? process.cwd(),
  });
}
