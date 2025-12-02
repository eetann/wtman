import { define } from "gunshi";

export const removeCommand = define({
  name: "remove",
  description: "Remove a worktree",
  args: {},
  async run() {
    console.log("remove command - not implemented yet");
  },
});
