/**
 * API Configuration Store (DEPRECATED)
 *
 * This module has been deprecated as part of the SaaS monetization migration.
 * Local API key configuration is no longer required.
 * The application now uses cloud proxy service after user authentication.
 *
 * These functions are kept for backward compatibility but will:
 * - loadApiConfig: Always return null (no local config)
 * - saveApiConfig: Log a deprecation warning and do nothing
 * - deleteApiConfig: Clean up any existing local config files
 *
 * @deprecated Use cloud authentication instead
 */

import { app } from "electron";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

export type ApiType = "anthropic";

export type ApiConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  apiType?: ApiType;
};

const CONFIG_FILE_NAME = "api-config.json";

function getConfigPath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, CONFIG_FILE_NAME);
}

/**
 * @deprecated Local API config is no longer used. Use cloud authentication instead.
 * @returns Always returns null
 */
export function loadApiConfig(): ApiConfig | null {
  console.warn("[config-store] loadApiConfig is deprecated. Local API configuration is no longer required. Please use cloud authentication.");
  // Clean up any existing local config file
  deleteApiConfig();
  return null;
}

/**
 * @deprecated Local API config is no longer used. Use cloud authentication instead.
 * @param _config - Ignored
 */
export function saveApiConfig(_config: ApiConfig): void {
  console.warn("[config-store] saveApiConfig is deprecated. Local API configuration is no longer required. Please use cloud authentication.");
  // Do nothing - local config is not needed anymore
}

/**
 * Clean up any existing local API config files.
 * This is called during migration to remove legacy config.
 */
export function deleteApiConfig(): void {
  try {
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      unlinkSync(configPath);
      console.info("[config-store] Legacy API config deleted during migration");
    }
  } catch (error) {
    console.error("[config-store] Failed to delete legacy API config:", error);
  }
}

