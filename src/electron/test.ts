import osUtils from "os-utils";
import fs from "fs"
import os from "os"
import { BrowserWindow } from "electron";
import { ipcWebContentsSend } from "./util.js";

const POLLING_INTERVAL = 10_000;

let pollingIntervalId: ReturnType<typeof setInterval> | null = null;
let pollTickInFlight = false;

export function pollResources(mainWindow: BrowserWindow): void {
    if (pollingIntervalId) return;

    pollingIntervalId = setInterval(async () => {
        if (pollTickInFlight) return;
        pollTickInFlight = true;

        if (mainWindow.isDestroyed()) {
            stopPolling();
            return;
        }

        try {
            const cpuUsage = await getCPUUsage();
            const storageData = await getStorageData();
            const ramUsage = getRamUsage();

            if (mainWindow.isDestroyed()) {
                stopPolling();
                return;
            }

            ipcWebContentsSend("statistics", mainWindow.webContents, { cpuUsage, ramUsage, storageData: storageData.usage });
        } finally {
            pollTickInFlight = false;
        }
    }, POLLING_INTERVAL);
}

export function stopPolling(): void {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }
    pollTickInFlight = false;
}

export function getStaticData() {
    const totalStorage = getStorageDataSync().total;
    const cpuModel = os.cpus()[0].model;
    const totalMemoryGB = Math.floor(osUtils.totalmem() / 1024);

    return {
        totalStorage,
        cpuModel,
        totalMemoryGB
    }
}

function getCPUUsage(): Promise<number> {
    return new Promise(resolve => {
        osUtils.cpuUsage(resolve);
    })
}

function getRamUsage() {
    return 1 - osUtils.freememPercentage();
}

function getStorageDataSync() {
    const stats = fs.statfsSync(process.platform === 'win32' ? 'C://' : '/');
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bfree;

    return {
        total: Math.floor(total / 1_000_000_000),
        usage: 1 - free / total
    }
}

function getStorageData(): Promise<{ total: number; usage: number }> {
    return new Promise((resolve, reject) => {
        fs.statfs(process.platform === 'win32' ? 'C://' : '/', (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            const total = stats.bsize * stats.blocks;
            const free = stats.bsize * stats.bfree;
            resolve({
                total: Math.floor(total / 1_000_000_000),
                usage: 1 - free / total
            });
        });
    });
}

