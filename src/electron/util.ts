import { ipcMain, WebContents, WebFrameMain } from "electron";
import { getUIPath } from "./pathResolver.js";
import { pathToFileURL } from "url";
export const DEV_PORT = 5173;
export const DEV_HOST = process.env.VITE_DEV_HOST || "127.0.0.1";

// Checks if you are in development mode
export function isDev(): boolean {
    return process.env.NODE_ENV == "development";
}

// Making IPC Typesafe
export function ipcMainHandle<Key extends keyof EventPayloadMapping>(key: Key, handler: (...args: any[]) => EventPayloadMapping[Key] | Promise<EventPayloadMapping[Key]>) {
    ipcMain.handle(key, (event, ...args) => {
        if (event.senderFrame) validateEventFrame(event.senderFrame);

        return handler(event, ...args)
    });
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(key: Key, webContents: WebContents, payload: EventPayloadMapping[Key]) {
    webContents.send(key, payload);
}

export function validateEventFrame(frame: WebFrameMain) {
    if (isDev()) {
        const host = new URL(frame.url).host;
        if (host === `localhost:${DEV_PORT}` || host === `${DEV_HOST}:${DEV_PORT}`) return;
    }

    const expectedURL = pathToFileURL(getUIPath());
    const currentURL = new URL(frame.url);

    if (currentURL.protocol !== expectedURL.protocol) {
        throw new Error("Malicious event");
    }

    if (currentURL.protocol === "file:") {
        const normalizePath = (pathname: string) =>
            process.platform === "win32" ? pathname.toLowerCase() : pathname;

        const currentPath = normalizePath(decodeURIComponent(currentURL.pathname));
        const expectedPath = normalizePath(decodeURIComponent(expectedURL.pathname));

        if (currentPath !== expectedPath) {
            throw new Error("Malicious event");
        }
        return;
    }

    if (currentURL.toString() !== expectedURL.toString()) {
        throw new Error("Malicious event");
    }
}
