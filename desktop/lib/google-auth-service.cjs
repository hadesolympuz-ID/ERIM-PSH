const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");

class GoogleAuthService {
  constructor({ database, openExternal, safeStorage, sessionFile, diagnosticFile }) {
    this.database = database;
    this.openExternal = openExternal;
    this.safeStorage = safeStorage;
    this.sessionFile = sessionFile;
    this.diagnosticFile = diagnosticFile;
    this.persistenceWarning = "";
    this.session = this.loadSession();
  }

  status() {
    return {
      connected: Boolean(this.session?.accessToken && this.session.expiresAt > Date.now()),
      email: this.session?.email || "",
      expiresAt: this.session?.expiresAt || null,
      persistent: Boolean(this.session && fs.existsSync(this.sessionFile)),
      warning: this.persistenceWarning,
    };
  }

  async accessToken() {
    if (this.session?.accessToken && this.session.expiresAt > Date.now() + 60_000) {
      return this.session.accessToken;
    }
    if (this.session?.refreshToken) {
      return this.refreshAccessToken();
    }
    throw new Error("Google session is not connected or has expired.");
  }

  logout() {
    this.session = null;
    if (fs.existsSync(this.sessionFile)) fs.rmSync(this.sessionFile, { force: true });
    return this.status();
  }

  async login() {
    const settings = this.database.getPublicSettings();
    if (!settings.googleClientId) {
      throw new Error("Add the Google Desktop OAuth Client ID in Settings first.");
    }

    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const state = crypto.randomBytes(24).toString("hex");
    const callback = await this.createCallbackServer(state);
    const redirectUri = `http://127.0.0.1:${callback.port}/oauth/callback`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.search = new URLSearchParams({
      client_id: settings.googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ].join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent select_account",
      state,
    }).toString();

    await this.openExternal(authUrl.toString());
    const code = await callback.code;
    this.diagnostic("CALLBACK_RECEIVED", "Authorization code received; starting token exchange.");
    const tokenParameters = {
      client_id: settings.googleClientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    };
    if (settings.googleClientSecret) tokenParameters.client_secret = settings.googleClientSecret.trim();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParameters),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      const message = `${tokens.error || "TOKEN_EXCHANGE_FAILED"}: ${tokens.error_description || "Google sign-in token exchange failed."}`;
      this.diagnostic("TOKEN_EXCHANGE_FAILED", message);
      throw new Error(message);
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileResponse.ok ? await profileResponse.json() : {};
    this.session = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      email: profile.email || "",
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    };
    const persistent = this.saveSession();
    this.diagnostic("CONNECTED", persistent ? "Google session encrypted and saved." : "Connected for current session only.");
    return this.status();
  }

  async refreshAccessToken() {
    const settings = this.database.getPublicSettings();
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.googleClientId,
        refresh_token: this.session.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) {
      this.logout();
      throw new Error(tokens.error_description || "Google session refresh failed; connect again.");
    }
    this.session.accessToken = tokens.access_token;
    this.session.expiresAt = Date.now() + Number(tokens.expires_in || 3600) * 1000;
    this.saveSession();
    return this.session.accessToken;
  }

  loadSession() {
    try {
      if (!this.safeStorage.isEncryptionAvailable() || !fs.existsSync(this.sessionFile)) return null;
      const encrypted = fs.readFileSync(this.sessionFile);
      return JSON.parse(this.safeStorage.decryptString(encrypted));
    } catch {
      return null;
    }
  }

  saveSession() {
    if (!this.safeStorage.isEncryptionAvailable()) {
      this.persistenceWarning = "Windows secure storage is unavailable; connection lasts for this application session.";
      this.diagnostic("SECURE_STORAGE_UNAVAILABLE", this.persistenceWarning);
      return false;
    }
    try {
      const encrypted = this.safeStorage.encryptString(JSON.stringify(this.session));
      fs.writeFileSync(this.sessionFile, encrypted);
      this.persistenceWarning = "";
      return true;
    } catch (error) {
      this.persistenceWarning = `Google connected, but secure session persistence failed: ${error.message}`;
      this.diagnostic("SECURE_STORAGE_FAILED", this.persistenceWarning);
      return false;
    }
  }

  diagnostic(stage, message) {
    if (!this.diagnosticFile) return;
    const safeMessage = String(message)
      .replace(/4\/[A-Za-z0-9._-]+/g, "[REDACTED_CODE]")
      .replace(/ya29\.[A-Za-z0-9._-]+/g, "[REDACTED_TOKEN]");
    fs.appendFileSync(this.diagnosticFile, `${new Date().toISOString()} ${stage} ${safeMessage}\n`);
  }

  createCallbackServer(expectedState) {
    let resolveCode;
    let rejectCode;
    const code = new Promise((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname !== "/oauth/callback") {
        response.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const returnedState = url.searchParams.get("state");
      const authCode = url.searchParams.get("code");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<h2>ERIM-PSH authorization received</h2><p>Return to the desktop application while it completes the secure connection.</p>");
      server.close();
      if (error) rejectCode(new Error(`Google sign-in failed: ${error}`));
      else if (returnedState !== expectedState) rejectCode(new Error("Google sign-in state validation failed."));
      else if (!authCode) rejectCode(new Error("Google sign-in returned no authorization code."));
      else resolveCode(authCode);
    });
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const timeout = setTimeout(() => {
          server.close();
          rejectCode(new Error("Google sign-in timed out."));
        }, 180_000);
        code.finally(() => clearTimeout(timeout));
        resolve({ port: server.address().port, code });
      });
    });
  }
}

module.exports = { GoogleAuthService };
