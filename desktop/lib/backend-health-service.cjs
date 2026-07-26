const { performance } = require("node:perf_hooks");

class BackendHealthService {
  constructor({ database, authService, appVersion, isPackaged }) {
    this.database = database;
    this.authService = authService;
    this.appVersion = appVersion;
    this.isPackaged = isPackaged;
  }

  async checkAll() {
    const settings = this.database.getPublicSettings();
    const checks = await Promise.all([
      this.localDatabase(),
      this.dummyPublisher(settings),
      this.googleAccount(settings),
      this.gmail(settings),
      this.drive(settings),
      this.googleSheet(settings),
      this.appsScript(settings),
      this.github(),
      this.updater(),
    ]);
    return {
      checkedAt: new Date().toISOString(),
      environment: settings.environment,
      summary: {
        healthy: checks.filter((item) => item.status === "HEALTHY").length,
        attention: checks.filter((item) => ["NOT_CONFIGURED", "UNAVAILABLE"].includes(item.status)).length,
        failed: checks.filter((item) => item.status === "FAILED").length,
      },
      checks,
    };
  }

  async timed(name, run) {
    const started = performance.now();
    try {
      const detail = await run();
      return {
        name,
        status: "HEALTHY",
        latencyMs: Math.round(performance.now() - started),
        detail,
      };
    } catch (error) {
      return {
        name,
        status: "FAILED",
        latencyMs: Math.round(performance.now() - started),
        detail: error.message,
      };
    }
  }

  async localDatabase() {
    return this.timed("Local SQLite", () => {
      const row = this.database.db.prepare(`
        SELECT
          (SELECT COUNT(*) FROM local_drafts) AS drafts,
          (SELECT COUNT(*) FROM local_sync_queue) AS sync_jobs,
          (SELECT COUNT(*) FROM local_activity_log) AS audit_events
      `).get();
      return `${row.drafts} drafts, ${row.sync_jobs} sync jobs, ${row.audit_events} audit events`;
    });
  }

  async dummyPublisher(settings) {
    return {
      name: "Dummy publication engine",
      status: settings.environment === "DEV" ? "HEALTHY" : "UNAVAILABLE",
      latencyMs: 0,
      detail: settings.environment === "DEV"
        ? "Local end-to-end publication enabled"
        : "Disabled; ADMIN_DEV publishes through Apps Script",
    };
  }

  async googleAccount(settings) {
    if (!settings.googleClientId) return this.notConfigured("Google account", "Desktop OAuth Client ID is empty");
    const status = this.authService.status();
    return {
      name: "Google account",
      status: status.connected ? "HEALTHY" : "UNAVAILABLE",
      latencyMs: 0,
      detail: status.connected ? status.email : "OAuth configured; account not connected",
    };
  }

  async googleFetch(name, settings, url, describe) {
    if (!settings.googleClientId) return this.notConfigured(name, "Google OAuth is not configured");
    let token;
    try {
      token = await this.authService.accessToken();
    } catch {
      return { name, status: "UNAVAILABLE", latencyMs: 0, detail: "Connect Google first" };
    }
    return this.timed(name, async () => {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || `${name} returned HTTP ${response.status}`);
      return describe(payload);
    });
  }

  gmail(settings) {
    return this.googleFetch(
      "Gmail API",
      settings,
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      (payload) => `${payload.emailAddress}; ${payload.messagesTotal || 0} messages`,
    );
  }

  drive(settings) {
    const query = settings.driveFolderId
      ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(settings.driveFolderId)}?fields=id,name,mimeType`
      : "https://www.googleapis.com/drive/v3/about?fields=user";
    return this.googleFetch(
      "Google Drive API",
      settings,
      query,
      (payload) => payload.name || payload.user?.displayName || "Drive access verified",
    );
  }

  googleSheet(settings) {
    if (!settings.spreadsheetId) return this.notConfigured("Google Sheets API", "Spreadsheet ID is empty");
    return this.googleFetch(
      "Google Sheets API",
      settings,
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(settings.spreadsheetId)}?fields=properties.title,sheets.properties.title`,
      (payload) => `${payload.properties?.title || "Spreadsheet"}; ${payload.sheets?.length || 0} tabs`,
    );
  }

  async appsScript(settings) {
    if (!settings.apiBaseUrl) return this.notConfigured("Apps Script API", "Deployment URL is empty");
    return this.timed("Apps Script API", async () => {
      const response = await fetch(`${settings.apiBaseUrl}${settings.apiBaseUrl.includes("?") ? "&" : "?"}action=health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      return payload.ok ? "Health endpoint responded" : payload.error?.message || "Unhealthy response";
    });
  }

  async github() {
    return this.timed("GitHub repository", async () => {
      const response = await fetch("https://api.github.com/repos/hadesolympuz-ID/ERIM-PSH", {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "ERIM-PSH-Desktop" },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
      return `${payload.full_name}; default ${payload.default_branch}`;
    });
  }

  async updater() {
    return {
      name: "Application updater",
      status: this.isPackaged ? "HEALTHY" : "UNAVAILABLE",
      latencyMs: 0,
      detail: this.isPackaged ? `Packaged version ${this.appVersion}` : "Updater runs only after installation",
    };
  }

  notConfigured(name, detail) {
    return { name, status: "NOT_CONFIGURED", latencyMs: 0, detail };
  }
}

module.exports = { BackendHealthService };
