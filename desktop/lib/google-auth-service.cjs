const crypto = require("node:crypto");
const http = require("node:http");

class GoogleAuthService {
  constructor({ database, openExternal }) {
    this.database = database;
    this.openExternal = openExternal;
    this.session = null;
  }

  status() {
    return {
      connected: Boolean(this.session?.accessToken && this.session.expiresAt > Date.now()),
      email: this.session?.email || "",
      expiresAt: this.session?.expiresAt || null,
    };
  }

  async accessToken() {
    if (this.session?.accessToken && this.session.expiresAt > Date.now() + 60_000) {
      return this.session.accessToken;
    }
    throw new Error("Google session is not connected or has expired.");
  }

  logout() {
    this.session = null;
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
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      ].join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      access_type: "online",
      prompt: "select_account",
      state,
    }).toString();

    await this.openExternal(authUrl.toString());
    const code = await callback.code;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.googleClientId,
        client_secret: settings.googleClientSecret || "",
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || "Google sign-in token exchange failed.");
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = profileResponse.ok ? await profileResponse.json() : {};
    this.session = {
      accessToken: tokens.access_token,
      email: profile.email || "",
      expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    };
    return this.status();
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
      response.end("<h2>ERIM-PSH connected</h2><p>You can close this browser tab and return to the desktop application.</p>");
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
