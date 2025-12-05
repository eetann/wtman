import { readFile } from "node:fs/promises";
import { parseYAML } from "confbox";
import { defu } from "defu";
import * as v from "valibot";
import { getMainTreePath } from "../git";
import {
  type Config,
  ConfigSchema,
  DEFAULT_CONFIG,
  type HookStep,
  type RawConfig,
  RawConfigSchema,
  type WorktreeSettings,
} from "./schema";

type HookName =
  | "pre-worktree-add"
  | "post-worktree-add"
  | "pre-worktree-remove"
  | "post-worktree-remove";

/**
 * Load a single config file from the specified path.
 * Returns undefined if the file does not exist.
 */
export async function loadSingleConfig(
  filePath: string,
): Promise<RawConfig | undefined> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYAML(content);
  } catch (error) {
    throw new Error(
      `Failed to parse ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  const result = v.safeParse(RawConfigSchema, parsed);
  if (!result.success) {
    const issues = result.issues
      .map(
        (issue) =>
          `  - ${issue.path?.map((p) => p.key).join(".")}: ${issue.message}`,
      )
      .join("\n");
    throw new Error(`Invalid configuration in ${filePath}:\n${issues}`);
  }

  return result.output;
}

/**
 * Merge worktree settings from multiple configs.
 * Later configs override earlier ones.
 */
export function mergeWorktreeSettings(configs: RawConfig[]): WorktreeSettings {
  // Reverse so that later configs take priority in defu
  const worktreeSettings = configs
    .map((c) => c.worktree)
    .filter((w): w is WorktreeSettings => w !== undefined)
    .reverse();

  return defu({}, ...worktreeSettings);
}

/**
 * Merge hooks from multiple configs.
 * Hooks are concatenated in order: config.yaml -> user.yaml -> user.worktree.yaml
 */
export function mergeHooks(
  hookName: HookName,
  configs: RawConfig[],
): HookStep[] {
  return configs.flatMap((c) => c[hookName] ?? []);
}

export interface LoadConfigOptions {
  cwd?: string;
  mainTreePath?: string;
}

/**
 * Load and merge configuration from all config files.
 */
export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<Config> {
  const cwd = options.cwd ?? process.cwd();
  const mainTreePath = options.mainTreePath ?? getMainTreePath();

  // Load config files in order
  const configs: RawConfig[] = [];

  // 1. Team config from cwd (git-managed, same across worktrees)
  const teamConfig = await loadSingleConfig(`${cwd}/.wtman/config.yaml`);
  if (teamConfig) configs.push(teamConfig);

  // 2. User config from main tree
  const userConfig = await loadSingleConfig(
    `${mainTreePath}/.wtman/config.user.yaml`,
  );
  if (userConfig) configs.push(userConfig);

  // 3. Worktree-specific config from cwd
  const worktreeConfig = await loadSingleConfig(
    `${cwd}/.wtman/config.user.worktree.yaml`,
  );
  if (worktreeConfig) configs.push(worktreeConfig);

  // Merge worktree settings
  const worktreeSettings = mergeWorktreeSettings(configs);

  // Merge hooks
  const mergedConfig = {
    worktree: worktreeSettings,
    "pre-worktree-add": mergeHooks("pre-worktree-add", configs),
    "post-worktree-add": mergeHooks("post-worktree-add", configs),
    "pre-worktree-remove": mergeHooks("pre-worktree-remove", configs),
    "post-worktree-remove": mergeHooks("post-worktree-remove", configs),
  };

  // Apply defaults
  const configWithDefaults = defu(mergedConfig, DEFAULT_CONFIG);

  // Validate final config
  return v.parse(ConfigSchema, configWithDefaults);
}
