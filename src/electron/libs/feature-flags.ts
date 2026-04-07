import { app } from "electron";
import { readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { join } from "path";

export interface FeatureFlags {
  desktop: {
    enableCodexRunner: boolean;
    enableProviderSwitch: boolean;
  };
}

const DEFAULTS: FeatureFlags = {
  desktop: {
    enableCodexRunner: false,
    enableProviderSwitch: false,
  },
};

const FILE_NAME = "feature-flags.json";

let cached: FeatureFlags | null = null;

function filePath(): string {
  return join(app.getPath("userData"), FILE_NAME);
}

function atomicWriteSync(target: string, data: string): void {
  const tmp = `${target}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    writeFileSync(tmp, data, "utf8");
    renameSync(tmp, target);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* ignore cleanup failure */ }
    throw err;
  }
}

function fileExists(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

function load(): FeatureFlags {
  try {
    const rawContent = readFileSync(filePath(), "utf8");
    if (rawContent) {
      const raw = JSON.parse(rawContent);
      return {
        desktop: {
          enableCodexRunner: typeof raw?.desktop?.enableCodexRunner === "boolean"
            ? raw.desktop.enableCodexRunner
            : DEFAULTS.desktop.enableCodexRunner,
          enableProviderSwitch: typeof raw?.desktop?.enableProviderSwitch === "boolean"
            ? raw.desktop.enableProviderSwitch
            : DEFAULTS.desktop.enableProviderSwitch,
        },
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ENOENT")) {
      console.error("[feature-flags] Failed to load:", error);
    }
  }
  return { desktop: { ...DEFAULTS.desktop } };
}

function save(flags: FeatureFlags): void {
  try {
    atomicWriteSync(filePath(), JSON.stringify(flags, null, 2));
  } catch (error) {
    console.error("[feature-flags] Failed to save:", error);
  }
}

export function getFeatureFlags(): FeatureFlags {
  if (!cached) {
    cached = load();
  }
  return { desktop: { ...cached.desktop } };
}

export function setFeatureFlag(
  path: "desktop.enableCodexRunner" | "desktop.enableProviderSwitch",
  value: boolean,
): FeatureFlags {
  const current = getFeatureFlags();
  const [, key] = path.split(".") as [string, keyof FeatureFlags["desktop"]];
  const updated: FeatureFlags = {
    desktop: { ...current.desktop, [key]: value },
  };
  cached = updated;
  save(updated);
  return getFeatureFlags();
}

export function resetFeatureFlags(): FeatureFlags {
  const fresh: FeatureFlags = { desktop: { ...DEFAULTS.desktop } };
  cached = fresh;
  save(fresh);
  return getFeatureFlags();
}

export function isCodexEnabled(): boolean {
  // 在生产环境中允许通过环境变量直接启用，避免首次部署被本地 flag 文件阻断
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0) {
    return true;
  }
  // 登录态下允许启用 Codex（通过云端代理鉴权），避免强依赖本地 OPENAI_API_KEY。
  // secure-storage 会将 token 持久化到 userData/secure-tokens.enc。
  const secureTokensPath = join(app.getPath("userData"), "secure-tokens.enc");
  if (fileExists(secureTokensPath)) {
    return true;
  }
  return getFeatureFlags().desktop.enableCodexRunner;
}

export function isProviderSwitchEnabled(): boolean {
  return getFeatureFlags().desktop.enableProviderSwitch;
}
