const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

module.exports = async function afterPack(context) {
  if (!context) return;

  const appOutDir = context.appOutDir;
  if (!appOutDir) return;

  const platform = context.electronPlatformName; // "darwin" | "win32" | "linux"

  // ── 确保 app-update.yml 存在（跨平台通用）──
  // electron-updater 依赖此文件识别更新源。
  // macOS 用 --mac dir target 时不自动生成；Windows 用 NSIS 时也可能缺失。
  // afterPack 在签名之前执行，此时写入不会破坏代码签名。
  let resourcesDir;
  if (platform === "darwin") {
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = path.join(appOutDir, `${appName}.app`, "Contents", "Resources");
  } else {
    // Windows / Linux: resources 直接在 appOutDir 下
    resourcesDir = path.join(appOutDir, "resources");
  }

  const appUpdateYml = path.join(resourcesDir, "app-update.yml");

  if (!fs.existsSync(appUpdateYml)) {
    try {
      // Prefer DESKTOP_UPDATE_BASE_URL env var; fall back to electron-builder publish.url
      const builderConfig = context.packager.config;
      const publish = builderConfig.publish;
      const configUrl = Array.isArray(publish) ? publish[0]?.url : publish?.url;
      const url = process.env.DESKTOP_UPDATE_BASE_URL || configUrl;
      if (url) {
        const content = `provider: generic\nurl: ${url}\nupdaterCacheDirName: cherry-agent-updater\n`;
        fs.mkdirSync(resourcesDir, { recursive: true });
        fs.writeFileSync(appUpdateYml, content, "utf8");
        console.log(`[afterPack] Generated app-update.yml (${platform}): ${appUpdateYml}`);
      } else {
        console.warn("[afterPack] No publish URL found (set DESKTOP_UPDATE_BASE_URL to enable auto-update)");
      }
    } catch (error) {
      console.warn("[afterPack] Failed to generate app-update.yml:", error?.message || error);
    }
  } else {
    console.log(`[afterPack] app-update.yml already exists: ${appUpdateYml}`);
  }

  // ── macOS 特有：清理 extended attributes（防止公证失败）──
  if (platform !== "darwin") return;

  console.log(`[afterPack] Cleaning extended attributes in: ${appOutDir}`);

  try {
    execFileSync("xattr", ["-cr", appOutDir], { stdio: "inherit" });
  } catch (error) {
    console.warn("[afterPack] xattr cleanup failed:", error?.message || error);
  }

  const problematicDirAttrs = [
    "com.apple.FinderInfo",
    "com.apple.fileprovider.fpfs#P",
    "com.apple.fileprovider.fpfs#N",
  ];

  let dirList = [];
  try {
    const raw = execFileSync("find", [appOutDir, "-type", "d", "-print"], {
      encoding: "utf8",
    });
    dirList = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.warn("[afterPack] failed to enumerate directories:", error?.message || error);
  }

  for (const dir of dirList) {
    for (const attr of problematicDirAttrs) {
      try {
        execFileSync("xattr", ["-d", attr, dir], { stdio: "ignore" });
      } catch {
        // ignore if attribute does not exist
      }
    }
  }

  try {
    execFileSync("dot_clean", ["-m", appOutDir], { stdio: "inherit" });
  } catch (error) {
    console.warn("[afterPack] dot_clean failed:", error?.message || error);
  }

  try {
    execFileSync("find", [appOutDir, "-name", "._*", "-delete"], { stdio: "inherit" });
  } catch (error) {
    console.warn("[afterPack] sidecar cleanup failed:", error?.message || error);
  }
};
