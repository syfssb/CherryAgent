import { getModelAndEnv } from "./llm-service.js";
import { getCurrentApiConfig, buildEnvForConfig } from "./claude-settings.js";
import { generateTitleFromUserInput } from "./title-generator.js";
import { computeRuntimeEnvPatch } from "./bundled-runtime.js";
import { app } from "electron";

// Build enhanced PATH for packaged environment
export async function getEnhancedEnv(
  config?: Awaited<ReturnType<typeof getCurrentApiConfig>> | null,
  baseEnv?: Record<string, string>
): Promise<Record<string, string | undefined>> {
  let env: Record<string, string | undefined>;

  if (baseEnv) {
    env = { ...process.env, ...baseEnv };
  } else {
    const resolvedConfig = config ?? await getCurrentApiConfig();
    if (!resolvedConfig) {
      env = { ...process.env };
    } else {
      const configEnv = await buildEnvForConfig(resolvedConfig);
      env = { ...process.env, ...configEnv };
    }
  }

  // 注入内置运行时路径（CHERRY_NODE / CHERRY_PYTHON / NODE_PATH 等）
  const runtimePatch = computeRuntimeEnvPatch({
    PATH: env.PATH as string,
    NODE_PATH: env.NODE_PATH as string,
  });
  return { ...env, ...runtimePatch };
}

export const generateSessionTitle = async (userIntent: string | null) => {
  if (!userIntent) return "New Session";

  const { config, model } = await getModelAndEnv();
  if (!config || !model) {
    const words = userIntent.trim().split(/\s+/).slice(0, 5);
    return words.join(" ").toUpperCase() + (userIntent.trim().split(/\s+/).length > 5 ? "..." : "");
  }

  try {
    return await generateTitleFromUserInput(userIntent);
  } catch (error) {
    console.error("Failed to generate session title:", error);
    console.error("Is packaged:", app.isPackaged);
    console.error("Resources path:", process.resourcesPath);

    const words = userIntent.trim().split(/\s+/).slice(0, 5);
    return words.join(" ").toUpperCase() + (userIntent.trim().split(/\s+/).length > 5 ? "..." : "");
  }
};
