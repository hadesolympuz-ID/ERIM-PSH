# ERIM-PSH

Internal operations platform for Peak Season Holidays.

## Desktop v1.0

The Windows desktop application is the operational workspace. Each user works
in an isolated local SQLite database. A result can only enter the central
Google publication chain after it is marked ready and published through the
authenticated Apps Script API.

Desktop v1.0 includes:

- department workspaces and local draft management;
- immutable ready-to-post records and controlled revisions;
- idempotent sync queue, retry tracking, and version-conflict handling;
- Google browser sign-in using a Desktop OAuth client;
- confirmation, quotation, email, WhatsApp, and portal references;
- Windows installer and GitHub Releases update flow.

In `DEV`, the complete publication flow runs in local dummy mode. Google login,
Apps Script, and Google Workspace credentials are not required. Switching to
`STAGING` or `PROD` activates the authenticated central publication path.

`ADMIN_DEV` keeps dummy publication enabled and adds the Administrator DEV
Console. It can run read-only diagnostics against local SQLite, Gmail, Drive,
Sheets, Apps Script, GitHub, and the packaged updater when the relevant
development credentials and IDs are configured.

Run locally:

```powershell
pnpm install
pnpm test
pnpm run dev
```

Build the Windows installer:

```powershell
pnpm run build:win
```

## Central Google layer

- Google Apps Script is the permission and business-rule gateway.
- Google Sheets stores published structured records.
- Google Drive stores documents and evidence.
- Gmail URLs are references; mailbox access is not unrestricted.
- Mobile remains read-only and will be developed after the desktop milestone.

The prepared central workbook is in
`preparation/ERIM-PSH_Desktop_Dashboard_Data_Foundation.xlsx`.

## Repository layout

```text
desktop/              Electron desktop application
tests/                Local database and publication-safety tests
apps-script/           Authenticated publish/read API
preparation/           Google Sheets-ready central workbook
apps/pwa/              Deferred read-only mobile PWA foundation
docs/                  Architecture, setup, permissions, and roadmap
```

## Security

Never commit real spreadsheet IDs, deployment URLs, OAuth secrets, tokens,
customer data, or private email content. Production resources must ultimately
be owned by the company Google Workspace account.
