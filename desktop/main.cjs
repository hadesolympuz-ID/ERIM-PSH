const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const { LocalDatabase } = require("./lib/database.cjs");
const { SyncService } = require("./lib/sync-service.cjs");
const { UpdateService } = require("./lib/update-service.cjs");
const { GoogleAuthService } = require("./lib/google-auth-service.cjs");
const { BackendHealthService } = require("./lib/backend-health-service.cjs");

let mainWindow;
let database;
let syncService;
let updateService;
let googleAuth;
let backendHealth;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: "#f3f6f8",
    show: false,
    title: `ERIM-PSH ${app.getVersion()}`,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());

  if (isDev && process.env.ERIM_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function registerIpc() {
  ipcMain.handle("app:bootstrap", async () => ({
    version: app.getVersion(),
    databasePath: database.filePath,
    dashboard: database.getDashboard(),
    settings: database.getPublicSettings(),
  }));

  ipcMain.handle("draft:list", (_event, filters) => database.listDrafts(filters || {}));
  ipcMain.handle("draft:get", (_event, id) => database.getDraft(id));
  ipcMain.handle("draft:save", (_event, draft) => database.saveDraft(draft));
  ipcMain.handle("draft:mark-ready", (_event, id) => database.markReady(id));
  ipcMain.handle("draft:cancel", (_event, id, reason) => database.cancelDraft(id, reason));

  ipcMain.handle("sync:list", () => database.listSyncQueue());
  ipcMain.handle("sync:queue", (_event, draftId) => syncService.queueDraft(draftId));
  ipcMain.handle("sync:run", () => syncService.runPending());
  ipcMain.handle("auth:status", () => googleAuth.status());
  ipcMain.handle("auth:login", () => googleAuth.login());
  ipcMain.handle("auth:logout", () => googleAuth.logout());
  ipcMain.handle("health:check-all", () => backendHealth.checkAll());

  ipcMain.handle("settings:save", (_event, values) => database.saveSettings(values));

  ipcMain.handle("external:open", async (_event, url) => {
    if (!/^https:\/\//i.test(String(url || ""))) {
      throw new Error("Only HTTPS links can be opened.");
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("update:check", () => updateService.check());
  ipcMain.handle("update:download", () => updateService.download());
  ipcMain.handle("update:install", () => updateService.install());
}

app.whenReady().then(() => {
  const databasePath = path.join(app.getPath("userData"), "erim-psh-local.sqlite");
  database = new LocalDatabase(databasePath);
  googleAuth = new GoogleAuthService({
    database,
    openExternal: (url) => shell.openExternal(url),
    safeStorage,
    sessionFile: path.join(app.getPath("userData"), "google-session.secure"),
  });
  syncService = new SyncService(database, googleAuth);
  backendHealth = new BackendHealthService({
    database,
    authService: googleAuth,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
  });
  updateService = new UpdateService({
    isPackaged: app.isPackaged,
    currentVersion: app.getVersion(),
    send: (channel, payload) => mainWindow?.webContents.send(channel, payload),
  });

  registerIpc();
  createWindow();
  updateService.scheduleInitialCheck();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  database?.close();
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => {
  dialog.showErrorBox("ERIM-PSH Error", error.message);
});
