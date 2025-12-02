import { define } from "gunshi";

export const listCommand = define({
  name: "list",
  description: "List all worktrees",
  args: {},
  async run() {
    console.log("list command - not implemented yet");
  },
});
