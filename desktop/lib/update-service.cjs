const { autoUpdater } = require("electron-updater");

class UpdateService {
  constructor({ isPackaged, currentVersion, send }) {
    this.isPackaged = isPackaged;
    this.currentVersion = currentVersion;
    this.send = send;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    this.bindEvents();
  }

  bindEvents() {
    autoUpdater.on("checking-for-update", () => this.emit("CHECKING"));
    autoUpdater.on("update-available", (info) => this.emit("AVAILABLE", { version: info.version }));
    autoUpdater.on("update-not-available", () => this.emit("CURRENT"));
    autoUpdater.on("download-progress", (progress) => this.emit("DOWNLOADING", {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    }));
    autoUpdater.on("update-downloaded", (info) => this.emit("READY_TO_INSTALL", {
      version: info.version,
    }));
    autoUpdater.on("error", (error) => this.emit("ERROR", { message: error.message }));
  }

  emit(status, details = {}) {
    this.send("update:status", {
      status,
      currentVersion: this.currentVersion,
      ...details,
    });
  }

  scheduleInitialCheck() {
    if (!this.isPackaged) {
      this.emit("DEV_MODE");
      return;
    }
    setTimeout(() => this.check(), 15_000);
    setInterval(() => this.check(), 6 * 60 * 60 * 1000);
  }

  async check() {
    if (!this.isPackaged) {
      const payload = {
        status: "DEV_MODE",
        currentVersion: this.currentVersion,
        message: "Update checks run only in the installed application.",
      };
      this.send("update:status", payload);
      return payload;
    }
    await autoUpdater.checkForUpdates();
    return { status: "CHECKING", currentVersion: this.currentVersion };
  }

  async download() {
    if (!this.isPackaged) return { status: "DEV_MODE" };
    await autoUpdater.downloadUpdate();
    return { status: "DOWNLOADING" };
  }

  install() {
    if (!this.isPackaged) return { status: "DEV_MODE" };
    autoUpdater.quitAndInstall(false, true);
    return { status: "INSTALLING" };
  }
}

module.exports = { UpdateService };

