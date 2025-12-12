import { spawn } from "node:child_process";

export interface RunStepOptions {
  command: string;
  workingDirectory: string;
}

export interface RunStepResult {
  success: boolean;
  error?: Error;
}

/**
 * Execute a single hook step command.
 * Uses the user's default shell ($SHELL) or falls back to /bin/sh.
 */
export function runStep(options: RunStepOptions): Promise<RunStepResult> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/sh";

    const child = spawn(shell, ["-c", options.command], {
      cwd: options.workingDirectory,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: new Error(`Command failed with exit code ${code}`),
        });
      }
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        error: err,
      });
    });
  });
}
