import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

let browserEnsured = false;
let browserEnsurePromise: Promise<void> | null = null;

/**
 * Check if agent-browser CLI is available on the system.
 */
async function isAgentBrowserInstalled(): Promise<boolean> {
  try {
    await execAsync("agent-browser --version");
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure agent-browser CLI and its browser (Chromium) are installed.
 * Runs in the background — does not block application startup.
 * Failures are logged but do not affect the application.
 */
export async function ensureAgentBrowser(): Promise<void> {
  if (browserEnsured) return;
  if (browserEnsurePromise) return browserEnsurePromise;

  browserEnsurePromise = (async () => {
    try {
      const installed = await isAgentBrowserInstalled();

      if (!installed) {
        console.log("[agent-browser] CLI not found, installing globally...");
        try {
          await execAsync("npm install -g agent-browser", { timeout: 120_000 });
          console.log("[agent-browser] CLI installed successfully");
        } catch (error) {
          console.error("[agent-browser] Failed to install CLI:", error);
          return;
        }
      } else {
        console.log("[agent-browser] CLI already available");
      }

      try {
        await execAsync("agent-browser install", { timeout: 300_000 });
        console.log("[agent-browser] Browser (Chromium) is ready");
      } catch (error) {
        console.error("[agent-browser] Failed to install browser:", error);
      }

      browserEnsured = true;
    } finally {
      browserEnsurePromise = null;
    }
  })();

  return browserEnsurePromise;
}
