#!/usr/bin/env node
import { cli } from "gunshi";
import * as pkg from "../package.json";
import { addCommand } from "./commands/add";
import { listCommand } from "./commands/list";
import { removeCommand } from "./commands/remove";

const argv = process.argv.slice(2);

await cli(
  argv,
  {
    name: "wtman",
    description: "A CLI tool that manage Git worktree",
    args: {},
    async run() {
      console.error("Error: Subcommand is required");
      console.error("");
      console.error("Available commands:");
      console.error("  wtman add     Add a new worktree");
      console.error("  wtman remove  Remove a worktree");
      console.error("  wtman list    List all worktrees");
      console.error("");
      console.error("Run 'wtman <command> --help' for more information.");
      process.exit(1);
    },
  },
  {
    name: "wtman",
    version: pkg.version,
    subCommands: {
      add: addCommand,
      remove: removeCommand,
      list: listCommand,
    },
    renderHeader: null,
  },
);
