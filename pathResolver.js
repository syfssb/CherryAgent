import path from "path";
import { app } from "electron";
import { existsSync } from "fs";
function resolvePackagedPath(...segments) {
    const pathInAsar = path.join(app.getAppPath(), ...segments);
    if (existsSync(pathInAsar))
        return pathInAsar;
    return path.join(process.resourcesPath, ...segments);
}
export function getPreloadPath() {
    if (app.isPackaged) {
        return resolvePackagedPath("dist-electron", "src", "electron", "preload.cjs");
    }
    return path.join(app.getAppPath(), "dist-electron", "src", "electron", "preload.cjs");
}
export function getUIPath() {
    if (app.isPackaged) {
        return resolvePackagedPath("dist-react", "index.html");
    }
    return path.join(app.getAppPath(), "dist-react", "index.html");
}
export function getIconPath() {
    const candidates = [
        path.join(app.getAppPath(), "app-icon.png"),
        path.join(app.getAppPath(), "cherry2-square.png"),
        path.join(process.resourcesPath, "app-icon.png"),
        path.join(process.resourcesPath, "cherry2-square.png"),
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    return found ?? candidates[0];
}
