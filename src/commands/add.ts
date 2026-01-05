import { basename, relative, resolve } from "node:path";
import { input, search } from "@inquirer/prompts";
import { define } from "gunshi";
import { loadConfig } from "../config";
import {
  addWorktree,
  getMainTreePath,
  getWorktreeByBranchName,
  listBranches,
  listWorktrees,
  remoteBranchExists,
} from "../git";
import { executeHooks } from "../hooks";
import {
  loadMetadata,
  parseTags,
  saveMetadata,
  setWorktreeMetadata,
} from "../metadata";
import { formatPath } from "../output/formatter";
import {
  expandTemplate,
  expandWorktreeTemplate,
  type HookContext,
  transformBranch,
  type WorktreeTemplateContext,
} from "../template";

interface BranchSpec {
  remote?: string;
  branch: string;
}

const CREATE_NEW_BRANCH = "__CREATE_NEW_BRANCH__";

/**
 * Parse branch specification string.
 * Supports "origin:feature/foo" format for remote branches.
 */
function parseBranchSpec(spec: string): BranchSpec {
  const colonIndex = spec.indexOf(":");
  if (colonIndex === -1) {
    return { branch: spec };
  }
  return {
    remote: spec.slice(0, colonIndex),
    branch: spec.slice(colonIndex + 1),
  };
}

/**
 * Interactive branch selection.
 * Returns the selected branch name, or exits if user selects existing worktree.
 */
async function selectBranch(mainTreePath: string): Promise<string> {
  const branches = listBranches(mainTreePath);
  const worktrees = listWorktrees(mainTreePath);

  // Build choices
  interface BranchChoice {
    name: string;
    value: string;
    hasWorktree: boolean;
    worktreePath?: string;
  }

  const choices: BranchChoice[] = [
    {
      name: "+ Create new branch",
      value: CREATE_NEW_BRANCH,
      hasWorktree: false,
    },
  ];

  for (const branch of branches) {
    const worktree = getWorktreeByBranchName(branch, worktrees);
    if (worktree) {
      const relativePath = formatPath(worktree.path, mainTreePath);
      choices.push({
        name: `✗ ${branch} (${relativePath})`,
        value: branch,
        hasWorktree: true,
        worktreePath: worktree.path,
      });
    } else {
      choices.push({
        name: branch,
        value: branch,
        hasWorktree: false,
      });
    }
  }

  const selected = await search({
    message: "Select branch:",
    source: async (input) => {
      if (!input) {
        return choices;
      }
      const lowerInput = input.toLowerCase();
      return choices.filter((choice) =>
        choice.name.toLowerCase().includes(lowerInput),
      );
    },
  });

  // Handle "Create new branch"
  if (selected === CREATE_NEW_BRANCH) {
    const newBranch = await input({
      message: "Enter new branch name:",
    });
    if (!newBranch.trim()) {
      console.error("Branch name cannot be empty");
      process.exit(1);
    }
    return newBranch.trim();
  }

  // Check if selected branch has existing worktree
  const selectedChoice = choices.find((c) => c.value === selected);
  if (selectedChoice?.hasWorktree && selectedChoice.worktreePath) {
    const relativePath = relative(mainTreePath, selectedChoice.worktreePath);
    console.log("Worktree already exists. To enter, run:\n");
    console.log(`cd ${relativePath}\n`);
    process.exit(0);
  }

  return selected;
}

export const addCommand = define({
  name: "add",
  description: "Add a new worktree",
  args: {
    "branch-name": {
      type: "string",
      short: "b",
      description:
        "Branch name for the new worktree (supports remote:branch format)",
    },
    "worktree-path": {
      type: "string",
      short: "w",
      description: "Custom worktree path (overrides template)",
    },
    desc: {
      type: "string",
      short: "d",
      description: "Description for the worktree",
    },
    tag: {
      type: "string",
      short: "t",
      description: "Tags for the worktree (comma-separated)",
    },
  },
  async run(ctx) {
    const branchNameOption = ctx.values["branch-name"];
    const worktreePathOption = ctx.values["worktree-path"];
    const desc = ctx.values.desc;
    const tag = ctx.values.tag;

    // Load configuration
    const config = await loadConfig();

    // Get main repository path
    const mainTreePath = getMainTreePath();

    // Determine branch and startPoint
    let branch: string;
    let startPoint: string | undefined;

    if (branchNameOption) {
      // Parse branch specification (supports "origin:feature/foo" format)
      const spec = parseBranchSpec(branchNameOption);
      branch = spec.branch;

      if (spec.remote) {
        // Validate remote branch exists
        if (!remoteBranchExists(spec.remote, spec.branch, mainTreePath)) {
          console.error(
            `Remote branch not found: ${spec.remote}/${spec.branch}`,
          );
          process.exit(1);
        }
        startPoint = `${spec.remote}/${spec.branch}`;
      }
    } else {
      // Interactive branch selection
      branch = await selectBranch(mainTreePath);
    }

    // Determine worktree path
    let worktreePath: string;
    if (worktreePathOption) {
      // Custom path specified - use expandTemplate with variables
      const variables: Record<string, string> = {
        "original.path": mainTreePath,
        "original.basename": basename(mainTreePath),
        "worktree.branch": transformBranch(branch, config.worktree.separator),
      };
      worktreePath = expandTemplate(worktreePathOption, variables);
    } else {
      // Use template from config
      const templateContext: WorktreeTemplateContext = {
        original: {
          path: mainTreePath,
          basename: basename(mainTreePath),
        },
        worktree: {
          branch,
        },
      };
      worktreePath = expandWorktreeTemplate(
        config.worktree.template,
        templateContext,
        config.worktree.separator,
      );
    }

    // Resolve absolute path for worktree
    const worktreeAbsolutePath = resolve(mainTreePath, worktreePath);

    // Build pre-hook context
    const preHookContext: HookContext = {
      original: {
        path: mainTreePath,
        basename: basename(mainTreePath),
      },
      worktree: {
        path: worktreeAbsolutePath,
        basename: basename(worktreeAbsolutePath),
        branch,
      },
    };

    // Execute pre-worktree-add hooks
    if (config["pre-worktree-add"].length > 0) {
      const preResult = await executeHooks({
        hookType: "pre-worktree-add",
        steps: config["pre-worktree-add"],
        context: preHookContext,
      });

      if (!preResult.success) {
        console.error(
          `Hook failed at step "${preResult.failedStep}": ${preResult.error?.message ?? "Unknown error"}`,
        );
        process.exit(1);
      }
    }

    try {
      // Create worktree (execute from main repo directory)
      addWorktree(worktreePath, branch, mainTreePath, startPoint);
      console.log(`Created worktree at: ${worktreePath}`);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to create worktree: ${error.message}`);
      } else {
        console.error("Failed to create worktree");
      }
      process.exit(1);
    }

    // Build post-hook context (worktree now exists)
    const postHookContext: HookContext = {
      original: {
        path: mainTreePath,
        basename: basename(mainTreePath),
      },
      worktree: {
        path: worktreeAbsolutePath,
        basename: basename(worktreeAbsolutePath),
        branch,
      },
    };

    // Execute post-worktree-add hooks
    if (config["post-worktree-add"].length > 0) {
      const postResult = await executeHooks({
        hookType: "post-worktree-add",
        steps: config["post-worktree-add"],
        context: postHookContext,
      });

      if (!postResult.success) {
        console.error(
          `Hook failed at step "${postResult.failedStep}": ${postResult.error?.message ?? "Unknown error"}`,
        );
        process.exit(1);
      }
    }

    // Save metadata if --desc or --tag is specified
    if (desc || tag) {
      try {
        const metadata = await loadMetadata(mainTreePath);
        const tags = tag ? parseTags(tag) : [];
        const updated = setWorktreeMetadata(metadata, worktreeAbsolutePath, {
          description: desc ?? "",
          tags,
        });
        await saveMetadata(mainTreePath, updated);
      } catch (error) {
        // Metadata save failure should not fail the worktree creation
        console.error(
          `Warning: Failed to save metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
    console.log(`\nTo enter the worktree, run:\n\ncd ${worktreePath}\n`);
  },
});
