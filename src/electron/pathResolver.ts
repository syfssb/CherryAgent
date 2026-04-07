import path from "path"
import { app } from "electron"
import { existsSync } from "fs"

function resolvePackagedPath(...segments: string[]) {
    const appPath = app.getAppPath()
    const pathInApp = path.join(appPath, ...segments)

    // appPath 在默认 asar 打包下通常是 .../Resources/app.asar
    // 这种情况下直接使用 asar 内路径，避免 existsSync 兼容性差异导致误判
    if (appPath.endsWith(".asar") || appPath.includes(".asar/")) {
        return pathInApp
    }

    if (existsSync(pathInApp)) return pathInApp
    return path.join(process.resourcesPath, ...segments)
}

export function getPreloadPath() {
    if (app.isPackaged) {
        return resolvePackagedPath("dist-electron", "src", "electron", "preload.cjs")
    }
    return path.join(app.getAppPath(), "dist-electron", "src", "electron", "preload.cjs")
}

export function getUIPath() {
    if (app.isPackaged) {
        return resolvePackagedPath("dist-react", "index.html")
    }
    return path.join(app.getAppPath(), "dist-react", "index.html")
}

export function getIconPath() {
    const candidates = [
        path.join(app.getAppPath(), "app-icon.png"),
        path.join(app.getAppPath(), "cherry2-square.png"),
        path.join(process.resourcesPath, "app-icon.png"),
        path.join(process.resourcesPath, "cherry2-square.png"),
    ]

    const found = candidates.find((candidate) => existsSync(candidate))
    return found ?? candidates[0]
}
