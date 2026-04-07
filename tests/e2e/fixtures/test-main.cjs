// CJS wrapper for Playwright test — avoids ESM loader conflict
// This file is used as the Electron entry point during e2e tests
const path = require('path')
const projectRoot = path.resolve(__dirname, '../../..')

// Override app path to project root before main.js loads
const { app } = require('electron')
app.setAppPath(projectRoot)

// Use unique userData dir per worker to avoid SingletonLock conflicts
if (process.env.ELECTRON_USER_DATA_DIR) {
  app.setPath('userData', process.env.ELECTRON_USER_DATA_DIR)
}

// Now load the real ESM main entry
import(path.join(projectRoot, 'dist-electron/src/electron/main.js'))
