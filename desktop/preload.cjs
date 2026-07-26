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
