// Dependency-free, hidden (zero-echo) interactive terminal input for the
// pilot bootstrap admin password. Deliberately not asterisk-masked - masking
// still reveals password length; this reveals nothing at all.
//
// Uses only Node's built-in process.stdin raw-mode primitives (tty, backed
// by libuv) - no npm package needed, and this is the only place in the
// codebase that touches raw mode, so there is no risk of interfering with
// any other stdin consumer.
import { createInterface } from "node:readline";

export function isInteractiveTTY(): boolean {
  return Boolean(process.stdin.isTTY);
}

/**
 * Reads one line of input from the terminal with NOTHING echoed back -
 * not even asterisks. Guarantees raw mode is restored on every exit path
 * (normal resolution, Ctrl+C, or an unexpected stream error), via a
 * try/finally-equivalent cleanup that always runs exactly once.
 *
 * Throws immediately, before touching stdin at all, if stdin is not an
 * interactive TTY - piped/redirected input never falls back to reading a
 * plaintext password from anywhere else.
 */
export function readHiddenLine(promptText: string): Promise<string> {
  if (!isInteractiveTTY()) {
    return Promise.reject(
      new Error(
        "Refusing to read a password: stdin is not an interactive terminal. " +
          "This script must be run interactively by a human operator, never piped, " +
          "redirected, or invoked from an automated/CI context."
      )
    );
  }

  return new Promise<string>((resolve, reject) => {
    process.stdout.write(promptText);

    let settled = false;
    let password = "";

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("error", onError);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "") {
          // Ctrl+C
          finish(() => {
            process.stdout.write("\n");
            reject(new Error("Aborted by operator (Ctrl+C)."));
          });
          return;
        }
        if (char === "\r" || char === "\n") {
          finish(() => {
            process.stdout.write("\n");
            resolve(password);
          });
          return;
        }
        if (char === "" || char === "\b") {
          // Backspace/Delete
          password = password.slice(0, -1);
          continue;
        }
        password += char;
      }
    };

    const onError = (err: Error) => {
      finish(() => reject(err));
    };

    try {
      process.stdin.setRawMode(true);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.on("error", onError);
  });
}

/**
 * Reads one line of ordinary, visible (echoed) input - for non-secret
 * operator-supplied metadata such as tenant name/slug or admin email, where
 * hiding the input would only make the prompt harder to use correctly.
 */
export function readVisibleLine(promptText: string): Promise<string> {
  if (!isInteractiveTTY()) {
    return Promise.reject(
      new Error("Refusing to prompt: stdin is not an interactive terminal.")
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
