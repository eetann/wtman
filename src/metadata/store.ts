import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseYAML, stringifyYAML } from "confbox";
import * as v from "valibot";
import {
  type WorktreeMetadata,
  type WorktreesMetadata,
  WorktreesMetadataSchema,
} from "./schema";

const METADATA_FILENAME = "worktrees.yaml";

/**
 * Get the path to the metadata file.
 */
export function getMetadataFilePath(mainTreePath: string): string {
  return join(mainTreePath, ".wtman", METADATA_FILENAME);
}

/**
 * Load all worktrees metadata from the metadata file.
 * Returns empty object if file does not exist.
 */
export async function loadMetadata(
  mainTreePath: string,
): Promise<WorktreesMetadata> {
  const filePath = getMetadataFilePath(mainTreePath);

  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }

  const parsed = parseYAML(content);
  return v.parse(WorktreesMetadataSchema, parsed);
}

/**
 * Save worktrees metadata to the metadata file.
 * Creates the .wtman directory if it doesn't exist.
 */
export async function saveMetadata(
  mainTreePath: string,
  metadata: WorktreesMetadata,
): Promise<void> {
  const filePath = getMetadataFilePath(mainTreePath);
  const dir = dirname(filePath);

  await mkdir(dir, { recursive: true });
  const content = stringifyYAML(metadata);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Get metadata for a specific worktree.
 * Returns undefined if not found.
 */
export function getWorktreeMetadata(
  metadata: WorktreesMetadata,
  worktreePath: string,
): WorktreeMetadata | undefined {
  return metadata[worktreePath];
}

/**
 * Set metadata for a specific worktree.
 * Returns a new metadata object (does not mutate the original).
 */
export function setWorktreeMetadata(
  metadata: WorktreesMetadata,
  worktreePath: string,
  data: WorktreeMetadata,
): WorktreesMetadata {
  return {
    ...metadata,
    [worktreePath]: data,
  };
}

/**
 * Delete metadata for a specific worktree.
 * Returns a new metadata object (does not mutate the original).
 */
export function deleteWorktreeMetadata(
  metadata: WorktreesMetadata,
  worktreePath: string,
): WorktreesMetadata {
  const { [worktreePath]: _, ...rest } = metadata;
  return rest;
}
