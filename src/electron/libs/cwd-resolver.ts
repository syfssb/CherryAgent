import { access, constants, stat } from "node:fs/promises";

export type DirectoryValidator = (targetPath: string) => Promise<boolean>;

export type ResolveEffectiveCwdOptions = {
  sessionCwd?: string | null;
  fallbackCwd?: string | null;
  processCwd?: string;
  validateDirectory?: DirectoryValidator;
};

export type ResolvedCwd = {
  cwd: string;
  source: "session" | "fallback" | "process";
  reason?: "session-empty" | "session-invalid" | "fallback-invalid";
};

export async function isReadableDirectory(targetPath: string): Promise<boolean> {
  const trimmedPath = targetPath.trim();
  if (!trimmedPath) {
    return false;
  }

  try {
    await access(trimmedPath, constants.R_OK);
    const stats = await stat(trimmedPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function resolveEffectiveCwd(options: ResolveEffectiveCwdOptions): Promise<ResolvedCwd> {
  const validateDirectory = options.validateDirectory ?? isReadableDirectory;
  const sessionCwd = options.sessionCwd?.trim() ?? "";
  const fallbackCwd = options.fallbackCwd?.trim() ?? "";
  const processCwd = (options.processCwd ?? process.cwd()).trim();

  if (sessionCwd && await validateDirectory(sessionCwd)) {
    return { cwd: sessionCwd, source: "session" };
  }

  if (fallbackCwd && await validateDirectory(fallbackCwd)) {
    return {
      cwd: fallbackCwd,
      source: "fallback",
      reason: sessionCwd ? "session-invalid" : "session-empty",
    };
  }

  return {
    cwd: processCwd || ".",
    source: "process",
    reason: "fallback-invalid",
  };
}
