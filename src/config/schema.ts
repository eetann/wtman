import * as v from "valibot";

// Separator type for branch name transformation
export const SeparatorSchema = v.picklist(["hyphen", "underscore", "slash"]);
export type Separator = v.InferOutput<typeof SeparatorSchema>;

// Delete branch behavior type
export const DeleteBranchSchema = v.picklist(["ask", "always", "never"]);
export type DeleteBranch = v.InferOutput<typeof DeleteBranchSchema>;

// Worktree settings
export const WorktreeSettingsSchema = v.object({
  template: v.optional(v.string()),
  separator: v.optional(SeparatorSchema),
  deleteBranch: v.optional(DeleteBranchSchema),
});
export type WorktreeSettings = v.InferOutput<typeof WorktreeSettingsSchema>;

// Hook step (actions are mutually exclusive)
export const HookStepSchema = v.object({
  name: v.string(),
  run: v.optional(v.string()),
  copy: v.optional(v.union([v.string(), v.array(v.string())])),
  link: v.optional(v.union([v.string(), v.array(v.string())])),
  mkdir: v.optional(v.union([v.string(), v.array(v.string())])),
  remove: v.optional(v.union([v.string(), v.array(v.string())])),
});
export type HookStep = v.InferOutput<typeof HookStepSchema>;

// Raw config schema (for parsing, all fields optional)
export const RawConfigSchema = v.object({
  worktree: v.optional(WorktreeSettingsSchema),
  "pre-worktree-add": v.optional(v.array(HookStepSchema)),
  "post-worktree-add": v.optional(v.array(HookStepSchema)),
  "pre-worktree-remove": v.optional(v.array(HookStepSchema)),
  "post-worktree-remove": v.optional(v.array(HookStepSchema)),
});
export type RawConfig = v.InferOutput<typeof RawConfigSchema>;

// Config schema (after merge, required fields)
export const ConfigSchema = v.object({
  worktree: v.object({
    template: v.string(),
    separator: SeparatorSchema,
    deleteBranch: DeleteBranchSchema,
  }),
  "pre-worktree-add": v.array(HookStepSchema),
  "post-worktree-add": v.array(HookStepSchema),
  "pre-worktree-remove": v.array(HookStepSchema),
  "post-worktree-remove": v.array(HookStepSchema),
});
export type Config = v.InferOutput<typeof ConfigSchema>;

// Default configuration
export const DEFAULT_CONFIG: Config = {
  worktree: {
    template: "../${{ original.basename }}-${{ worktree.branch }}",
    separator: "hyphen",
    deleteBranch: "ask",
  },
  "pre-worktree-add": [],
  "post-worktree-add": [],
  "pre-worktree-remove": [],
  "post-worktree-remove": [],
};
