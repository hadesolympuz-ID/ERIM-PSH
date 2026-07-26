# Desktop v1.0 Setup

## Install

Run `ERIM-PSH-Setup-1.0.0.exe`, choose the installation folder, and launch the
application from the desktop or Start menu.

## Local profile

Open Settings and enter the employee ID, name, department, environment, Apps
Script web-app URL, and Google Desktop OAuth client credentials. These values
remain on the current PC. Each Windows profile gets a separate SQLite database.

## DEV dummy mode

Keep Environment set to `DEV`. In this mode Google login and OAuth settings are
hidden. Publishing a ready draft creates a deterministic dummy publication ID,
official entity ID, record version, sync result, and local audit history. This
allows the full desktop workflow to be modeled before company infrastructure
is available.

`STAGING` and `PROD` never use the dummy bypass. They require Google login,
Apps Script configuration, and an approved employee record.

## Administrator DEV Console

Select `ADMIN_DEV` to keep local dummy publication while enabling optional
Google connectivity and backend diagnostics. Configure the Desktop OAuth
client, central Spreadsheet ID, optional Drive DEV Folder ID, and Apps Script
URL. Then connect Google and run **Admin DEV Console → Run all checks**.

The console reports explicit `HEALTHY`, `NOT_CONFIGURED`, `UNAVAILABLE`, or
`FAILED` states. Health checks are read-only. Gmail uses profile metadata only,
Drive reads account/folder metadata, and Sheets reads spreadsheet metadata.

The Gmail and Drive connections installed in Codex are separate development
connectors; their tokens are never copied into ERIM-PSH.

## Google OAuth

Create a Google Cloud OAuth client with application type **Desktop app**. Put
the client ID and client secret into the desktop Settings screen. Use the same
client ID for the Apps Script `GOOGLE_CLIENT_ID` script property.

The desktop app opens Google's browser login and accepts the callback only on a
temporary `127.0.0.1` port. The access token is kept in memory and is never
written into a draft, sync job, repository, or central sheet.

Desktop PKCE does not require the OAuth Client Secret. The refresh token is
encrypted using Electron safeStorage/Windows encryption and stored separately
from the operational SQLite database. This keeps the Google connection active
across application restarts without exposing the token to renderer code.

## Apps Script

Create a standalone Apps Script project from `apps-script/`, set these Script
Properties, and deploy it as a web app:

- `SPREADSHEET_ID`
- `GOOGLE_CLIENT_ID`
- `COMPANY_DOMAIN` (optional during personal-account DEV)

Run the web app as the owner and restrict access to the intended Google users.
The `EMPLOYEES` table must also mark the user active and allow desktop access.

## Update flow

The installed app checks GitHub Releases. When a newer published release is
available, the user sees a notification, clicks Download, then clicks
**Restart & install**. Draft data remains because uninstall/update does not
delete the local application-data database.

The current installer is unsigned, so Windows SmartScreen may warn during the
DEV phase. A code-signing certificate is required before broad production use.
