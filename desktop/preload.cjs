const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erim", {
  bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  drafts: {
    list: (filters) => ipcRenderer.invoke("draft:list", filters),
    get: (id) => ipcRenderer.invoke("draft:get", id),
    save: (draft) => ipcRenderer.invoke("draft:save", draft),
    markReady: (id) => ipcRenderer.invoke("draft:mark-ready", id),
    cancel: (id, reason) => ipcRenderer.invoke("draft:cancel", id, reason),
  },
  sync: {
    list: () => ipcRenderer.invoke("sync:list"),
    queue: (draftId) => ipcRenderer.invoke("sync:queue", draftId),
    run: () => ipcRenderer.invoke("sync:run"),
  },
  auth: {
    status: () => ipcRenderer.invoke("auth:status"),
    login: () => ipcRenderer.invoke("auth:login"),
    logout: () => ipcRenderer.invoke("auth:logout"),
  },
  health: {
    checkAll: () => ipcRenderer.invoke("health:check-all"),
  },
  workspace: {
    searchAgents: (query) => ipcRenderer.invoke("workspace:agents-search", query),
    searchConfirmationEmails: (customerCode) => ipcRenderer.invoke("workspace:confirmation-search", customerCode),
    uploadItinerary: (details) => ipcRenderer.invoke("workspace:itinerary-upload", details),
    getRevisionContext: (customerCode) => ipcRenderer.invoke("workspace:revision-context", customerCode),
    chooseRevisedDocx: () => ipcRenderer.invoke("workspace:revision-choose-file"),
    postItineraryRevision: (details) => ipcRenderer.invoke("workspace:revision-post", details),
    getRecheckContext: (customerCode) => ipcRenderer.invoke("workspace:recheck-context", customerCode),
    downloadLatestItinerary: (details) => ipcRenderer.invoke("workspace:itinerary-download", details),
    openDownloadFolder: () => ipcRenderer.invoke("workspace:download-folder-open"),
    listNotifications: () => ipcRenderer.invoke("workspace:notifications-list"),
    getGmailThread: (threadId) => ipcRenderer.invoke("workspace:gmail-thread", threadId),
  },
  reservation: {
    listFollowups: () => ipcRenderer.invoke("reservation:followup-list"),
    startFollowup: (details) => ipcRenderer.invoke("reservation:followup-start", details),
    updateFollowup: (id, details) => ipcRenderer.invoke("reservation:followup-update", id, details),
    resolveFollowup: (id) => ipcRenderer.invoke("reservation:followup-resolve", id),
  },
  vendor: {
    getDashboard: () => ipcRenderer.invoke("vendor:dashboard"),
    getIntakeContext: (customerCode) => ipcRenderer.invoke("vendor:intake-context", customerCode),
    getIntakeDraft: (customerCode) => ipcRenderer.invoke("vendor:intake-draft-get", customerCode),
    listIntakeDrafts: () => ipcRenderer.invoke("vendor:intake-draft-list"),
    saveIntakeDraft: (details) => ipcRenderer.invoke("vendor:intake-draft-save", details),
    publishIntake: (details) => ipcRenderer.invoke("vendor:intake-publish", details),
  },
  masterData: {
    sync: () => ipcRenderer.invoke("master-data:sync"),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("master-data:status", listener);
      return () => ipcRenderer.removeListener("master-data:status", listener);
    },
  },
  supplierMaster: {
    list: (options) => ipcRenderer.invoke("supplier-master:list", options),
    initialize: () => ipcRenderer.invoke("supplier-master:initialize"),
    saveType: (details) => ipcRenderer.invoke("supplier-master:type-save", details),
    saveSupplier: (details) => ipcRenderer.invoke("supplier-master:supplier-save", details),
    saveProduct: (details) => ipcRenderer.invoke("supplier-master:product-save", details),
    duplicateProduct: (details) => ipcRenderer.invoke("supplier-master:product-duplicate", details),
    saveContract: (details) => ipcRenderer.invoke("supplier-master:contract-save", details),
    archive: (details) => ipcRenderer.invoke("supplier-master:archive", details),
    listDrafts: () => ipcRenderer.invoke("supplier-master:drafts-list"),
    publishDrafts: (details) => ipcRenderer.invoke("supplier-master:drafts-publish", details),
    discardDraft: (draftId) => ipcRenderer.invoke("supplier-master:draft-discard", draftId),
    uploadContract: (details) => ipcRenderer.invoke("supplier-master:contract-upload", details),
  },
  supplierExcel: {
    downloadTemplate: (details) => ipcRenderer.invoke("supplier-excel:template", details),
    analyzeImport: (details) => ipcRenderer.invoke("supplier-excel:import-analyze", details),
    stageImport: (batchId) => ipcRenderer.invoke("supplier-excel:import-stage", batchId),
    listBatches: () => ipcRenderer.invoke("supplier-excel:batch-list"),
    exportConflicts: (batchId) => ipcRenderer.invoke("supplier-excel:conflicts-export", batchId),
    exportCatalog: (details) => ipcRenderer.invoke("supplier-excel:catalog-export", details),
    suggestions: (details) => ipcRenderer.invoke("supplier-excel:suggestions", details),
  },
  settings: {
    save: (values) => ipcRenderer.invoke("settings:save", values),
  },
  external: {
    open: (url) => ipcRenderer.invoke("external:open", url),
  },
  updates: {
    check: () => ipcRenderer.invoke("update:check"),
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
    onStatus: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("update:status", listener);
      return () => ipcRenderer.removeListener("update:status", listener);
    },
  },
});
