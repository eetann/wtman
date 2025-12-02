import { define } from "gunshi";

export const addCommand = define({
  name: "add",
  description: "Add a new worktree",
  args: {},
  async run() {
    console.log("add command - not implemented yet");
  },
});
