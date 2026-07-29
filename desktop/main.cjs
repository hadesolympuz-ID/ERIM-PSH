const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require("electron");
const { LocalDatabase } = require("./lib/database.cjs");
const { SyncService } = require("./lib/sync-service.cjs");
const { UpdateService } = require("./lib/update-service.cjs");
const { GoogleAuthService } = require("./lib/google-auth-service.cjs");
const { BackendHealthService } = require("./lib/backend-health-service.cjs");
const { GoogleWorkspaceService } = require("./lib/google-workspace-service.cjs");
const { SupplierExcelService } = require("./lib/supplier-excel-service.cjs");

let mainWindow;
let database;
let syncService;
let updateService;
let googleAuth;
let backendHealth;
let googleWorkspace;
let supplierExcel;

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
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

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
    masterData: {
      summary: database.getLocalMasterDataSummary(),
      syncState: database.getMasterDataSyncState(),
    },
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
  ipcMain.handle("workspace:agents-search", (_event, query) => googleWorkspace.searchAgents(query));
  ipcMain.handle("workspace:confirmation-search", (_event, customerCode) => googleWorkspace.searchConfirmationEmails(customerCode));
  ipcMain.handle("workspace:itinerary-upload", (_event, details) => googleWorkspace.selectAndUploadItinerary(details));
  ipcMain.handle("workspace:revision-context", (_event, customerCode) => googleWorkspace.getRevisionContext(customerCode));
  ipcMain.handle("workspace:revision-choose-file", () => googleWorkspace.chooseRevisedDocx());
  ipcMain.handle("workspace:revision-post", (_event, details) => googleWorkspace.postItineraryRevision(details));
  ipcMain.handle("workspace:recheck-context", (_event, customerCode) => googleWorkspace.getRecheckContext(customerCode));
  ipcMain.handle("workspace:itinerary-download", (_event, details) => googleWorkspace.downloadLatestItinerary(details));
  ipcMain.handle("workspace:notifications-list", () => googleWorkspace.listNotifications());
  ipcMain.handle("workspace:download-folder-open", async () => {
    const folderPath = googleWorkspace.ensureDownloadDirectory();
    const error = await shell.openPath(folderPath);
    if (error) throw new Error(error);
    return { ok: true, folderPath };
  });
  ipcMain.handle("reservation:followup-list", () => database.listReservationFollowups());
  ipcMain.handle("reservation:followup-start", (_event, details) => database.startReservationFollowup(details));
  ipcMain.handle("reservation:followup-update", (_event, id, details) => database.updateReservationFollowup(id, details));
  ipcMain.handle("reservation:followup-resolve", (_event, id) => database.resolveReservationFollowup(id));
  ipcMain.handle("workspace:gmail-thread", (_event, threadId) => googleWorkspace.getGmailThread(threadId));
  ipcMain.handle("vendor:dashboard", () => googleWorkspace.getVendorDashboard());
  ipcMain.handle("vendor:operational-model", () => googleWorkspace.getVendorOperationalModel());
  ipcMain.handle("vendor:itinerary-check", (_event, customerCode) =>
    database.getVendorItineraryCheck(customerCode));
  ipcMain.handle("vendor:intake-context", (_event, customerCode) => googleWorkspace.getVendorIntakeContext(customerCode));
  ipcMain.handle("vendor:intake-draft-get", (_event, customerCode) => database.getVendorIntakeDraftByCode(customerCode));
  ipcMain.handle("vendor:intake-draft-list", () => database.listVendorIntakeDrafts());
  ipcMain.handle("vendor:intake-draft-save", (_event, details) => database.saveVendorIntakeDraft(details));
  ipcMain.handle("vendor:intake-publish", (_event, details) => googleWorkspace.publishVendorIntake(details));
  ipcMain.handle("vendor:booking-queue", () => database.listVendorBookingQueue());
  ipcMain.handle("vendor:booking-list", () => database.listVendorBookings());
  ipcMain.handle("vendor:booking-preview", (_event, details) => database.getVendorBookingPreview(details || {}));
  ipcMain.handle("vendor:booking-generate", (_event, details) => database.saveVendorBookingPreview(details || {}));
  ipcMain.handle("vendor:booking-email-send", (_event, details) =>
    googleWorkspace.sendVendorBookingEmail(details || {}));
  ipcMain.handle("vendor:booking-external-sent", (_event, details) =>
    database.recordVendorBookingExternalAction(details || {}));
  ipcMain.handle("vendor:booking-send-sync-retry", (_event, sendAttemptId) =>
    googleWorkspace.retryVendorSendSync(sendAttemptId));
  ipcMain.handle("master-data:sync", () => googleWorkspace.syncMasterDataCache());
  ipcMain.handle("supplier-master:list", (_event, options) => googleWorkspace.listSupplierMaster(options || {}));
  ipcMain.handle("supplier-master:initialize", () => googleWorkspace.initializeSupplierMaster());
  ipcMain.handle("supplier-master:type-save", (_event, details) => googleWorkspace.saveSupplierType(details));
  ipcMain.handle("supplier-master:supplier-save", (_event, details) => googleWorkspace.saveSupplier(details));
  ipcMain.handle("supplier-master:product-save", (_event, details) => googleWorkspace.saveSupplierProduct(details));
  ipcMain.handle("supplier-master:product-duplicate", (_event, details) =>
    googleWorkspace.duplicateSupplierProduct(details));
  ipcMain.handle("supplier-master:contract-save", (_event, details) => googleWorkspace.saveSupplierContract(details));
  ipcMain.handle("supplier-master:archive", (_event, details) => googleWorkspace.archiveSupplierEntity(details));
  ipcMain.handle("supplier-master:drafts-list", () => googleWorkspace.listSupplierMasterDrafts());
  ipcMain.handle("supplier-master:drafts-publish", (_event, details) =>
    googleWorkspace.publishSupplierMasterDrafts(details || {}));
  ipcMain.handle("supplier-master:publish-sessions-list", () =>
    googleWorkspace.listSupplierPublishSessions());
  ipcMain.handle("supplier-master:draft-discard", (_event, draftId) =>
    googleWorkspace.discardSupplierMasterDraft(draftId));
  ipcMain.handle("supplier-master:contract-upload", (_event, details) =>
    googleWorkspace.selectAndUploadSupplierContract(details));
  ipcMain.handle("supplier-excel:template", (_event, details) =>
    supplierExcel.downloadTemplate(details || {}));
  ipcMain.handle("supplier-excel:import-analyze", (_event, details) =>
    supplierExcel.analyzeImport(details || {}));
  ipcMain.handle("supplier-excel:import-stage", (_event, batchId) =>
    supplierExcel.stageImport(batchId));
  ipcMain.handle("supplier-excel:batch-list", () => supplierExcel.listBatches());
  ipcMain.handle("supplier-excel:conflicts-export", (_event, batchId) =>
    supplierExcel.exportConflicts(batchId));
  ipcMain.handle("supplier-excel:catalog-export", (_event, details) =>
    supplierExcel.exportCatalog(details || {}));
  ipcMain.handle("supplier-excel:suggestions", (_event, details) =>
    supplierExcel.suggestions(details || {}));

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
  database.requeueAdminDevDummyPublications();
  googleAuth = new GoogleAuthService({
    database,
    openExternal: (url) => shell.openExternal(url),
    safeStorage,
    sessionFile: path.join(app.getPath("userData"), "google-session.secure"),
    diagnosticFile: path.join(app.getPath("userData"), "google-auth-diagnostic.log"),
  });
  syncService = new SyncService(database, googleAuth);
  backendHealth = new BackendHealthService({
    database,
    authService: googleAuth,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
  });
  googleWorkspace = new GoogleWorkspaceService({
    database,
    authService: googleAuth,
    onSupplierPublishProgress: (payload) =>
      mainWindow?.webContents.send("supplier-master:publish-progress", payload),
    downloadDirectory: path.join(app.getPath("downloads"), "ERIM-PSH", "Itineraries"),
    chooseFile: async (options = {}) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options.title || "Post Soft Copy Itinerary",
        properties: ["openFile"],
        filters: options.docxOnly ? [
          { name: "Word document", extensions: ["docx"] },
        ] : options.contractOnly ? [
          { name: "Supplier contracts", extensions: ["pdf", "doc", "docx", "xls", "xlsx"] },
        ] : [
          { name: "Itinerary documents", extensions: ["pdf", "doc", "docx", "xls", "xlsx"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      return result.canceled ? null : result.filePaths[0];
    },
  });
  supplierExcel = new SupplierExcelService({
    database,
    templatePath: path.join(__dirname, "assets", "supplier-import-template.xlsx"),
    chooseFile: async (options = {}) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: options.title || "Choose Supplier Excel Workbook",
        properties: ["openFile"],
        filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
      });
      return result.canceled ? null : result.filePaths[0];
    },
    saveFile: async (options = {}) => {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: options.title || "Save Supplier Excel Workbook",
        defaultPath: options.defaultPath,
        filters: options.filters || [{ name: "Excel Workbook", extensions: ["xlsx"] }],
      });
      return result.canceled ? null : result.filePath;
    },
  });
  updateService = new UpdateService({
    isPackaged: app.isPackaged,
    currentVersion: app.getVersion(),
    send: (channel, payload) => mainWindow?.webContents.send(channel, payload),
  });

  registerIpc();
  createWindow();
  updateService.scheduleInitialCheck();
  setTimeout(() => {
    googleWorkspace.syncMasterDataCache()
      .then((result) => mainWindow?.webContents.send("master-data:status", result))
      .catch((error) => {
        database.log("MASTER_DATA_SYNC_FAILED", "MASTER_DATA", "TOC_VENDOR_RATES", {
          message: error.message,
        });
        mainWindow?.webContents.send("master-data:status", {
          status: "OFFLINE_CACHE",
          message: error.message,
          summary: database.getLocalMasterDataSummary(),
        });
      });
  }, 1_500);

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
