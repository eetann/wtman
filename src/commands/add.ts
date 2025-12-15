import { basename, resolve } from "node:path";
import { define } from "gunshi";
import { loadConfig } from "../config";
import { addWorktree, getMainTreePath } from "../git";
import { executeHooks } from "../hooks";
import { loadMetadata, saveMetadata, setWorktreeMetadata } from "../metadata";
import {
  expandWorktreeTemplate,
  type HookContext,
  type WorktreeTemplateContext,
} from "../template";

export const addCommand = define({
  name: "add",
  description: "Add a new worktree",
  args: {
    branch: {
      type: "positional",
      required: true,
      description: "Branch name for the new worktree",
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
    const branch = ctx.values.branch;
    const desc = ctx.values.desc;
    const tag = ctx.values.tag;

    // Load configuration
    const config = await loadConfig();

    // Get main repository path
    const mainTreePath = getMainTreePath();

    // Build template context
    const templateContext: WorktreeTemplateContext = {
      original: {
        path: mainTreePath,
        basename: basename(mainTreePath),
      },
      worktree: {
        branch,
      },
    };

    // Expand template to get worktree path (relative to main repo)
    const worktreePath = expandWorktreeTemplate(
      config.worktree.template,
      templateContext,
      config.worktree.separator,
    );

    // Resolve absolute path for worktree
    const worktreeAbsolutePath = resolve(mainTreePath, worktreePath);

    // Build pre-hook context (worktree.path/basename not available yet)
    // For pre-worktree-add, we use the expected path even though worktree doesn't exist yet
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
      addWorktree(worktreePath, branch, mainTreePath);
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
        const tags = tag
          ? tag
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t.length > 0)
          : [];
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
  },
});
