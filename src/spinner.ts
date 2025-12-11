import {
  createPrompt,
  type Status,
  useEffect,
  usePrefix,
  useState,
} from "@inquirer/core";

type SpinnerConfig = {
  message: string;
  task: () => Promise<void>;
};

type SpinnerResult = {
  success: boolean;
  error?: Error;
};

const spinnerPrompt = createPrompt<SpinnerResult, SpinnerConfig>(
  (config, done) => {
    const [status, setStatus] = useState<Status>("loading");
    const [error, setError] = useState<Error | null>(null);
    const prefix = usePrefix({ status });

    useEffect(() => {
      let cancelled = false;

      config
        .task()
        .then(() => {
          if (!cancelled) {
            setStatus("done");
            done({ success: true });
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            const errorObj =
              err instanceof Error ? err : new Error(String(err));
            setStatus("done");
            setError(errorObj);
            done({ success: false, error: errorObj });
          }
        });

      return () => {
        cancelled = true;
      };
    }, []);

    if (error) {
      return `${prefix} ${config.message} - Failed`;
    }

    return `${prefix} ${config.message}`;
  },
);

/**
 * A spinner that displays a loading animation while executing an async task.
 * The spinner automatically stops when the task completes or fails.
 * Returns a result object indicating success or failure with error details.
 *
 * When running in a non-TTY environment (e.g., tests, CI), the task is executed
 * directly without the spinner animation.
 */
export async function spinner(config: SpinnerConfig): Promise<SpinnerResult> {
  // In non-TTY environments, execute the task directly without spinner
  if (!process.stdout.isTTY) {
    try {
      await config.task();
      return { success: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return { success: false, error };
    }
  }

  return spinnerPrompt(config, { clearPromptOnDone: true });
}
