import * as v from "valibot";

/**
 * Schema for a single worktree's metadata.
 */
export const WorktreeMetadataSchema = v.object({
  description: v.optional(v.string(), ""),
  tags: v.optional(v.array(v.string()), []),
});
export type WorktreeMetadata = v.InferOutput<typeof WorktreeMetadataSchema>;

/**
 * Schema for all worktrees' metadata.
 * Key is the absolute path of the worktree.
 */
export const WorktreesMetadataSchema = v.record(
  v.string(),
  WorktreeMetadataSchema,
);
export type WorktreesMetadata = v.InferOutput<typeof WorktreesMetadataSchema>;
